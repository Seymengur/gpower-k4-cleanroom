// eslint-disable-next-line @typescript-eslint/no-var-requires
const jStat = require('jstat');

export interface K4Defaults {
  w: number;
  alpha: number;
  power: number;
  n_total: number;
  df: number;
  beta_alpha_ratio: number;
  conventions_hint: string;
}

export interface K4Result {
  n_total: number;
  actual_power: number;
  critical: number;
  df: number;
  ncp: number;
}

export interface PostHocParams {
  w: number;
  alpha: number;
  n_total: number;
  df: number;
}

export interface APrioriParams {
  w: number;
  alpha: number;
  power: number;
  df: number;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Default parameters as specified in SPEC.md Section 1
 */
export function getDefaults(): K4Defaults {
  return {
    w: 0.3,
    alpha: 0.05,
    power: 0.95,
    n_total: 100.0,
    df: 5.0,
    beta_alpha_ratio: 1.0,
    conventions_hint:
      'Effect size conventions\nw = .10 - small\nw = .30 - medium\nw = .50 - large',
  };
}

/**
 * Accurate Log-Gamma function (Lanczos g=7, n=9 approximation with 16-digit IEEE-754 precision)
 * Note: jStat.gammaln has a bug where its loop runs j < 6 instead of j < 8!
 */
export function gammaln(xx: number): number {
  const cof = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (xx < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * xx)) - gammaln(1.0 - xx);
  }
  const z = xx - 1.0;
  let x = cof[0];
  for (let i = 1; i < 9; i++) {
    x += cof[i] / (z + i);
  }
  const t = z + 7.5;
  return 0.5 * Math.log(2.0 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function centralChi2Cdf(x: number, df: number): number {
  if (x <= 0.0 || df <= 0.0) return 0.0;
  return regularizedGammaP(df * 0.5, x * 0.5);
}

/**
 * Regularized Lower Incomplete Gamma Function P(a, x) = gamma(a, x) / Gamma(a)
 */
function regularizedGammaP(a: number, x: number): number {
  if (x <= 0.0) return 0.0;
  if (x < a + 1.0) {
    return gammaSeriesP(a, x);
  } else {
    return 1.0 - gammaContinuedFractionQ(a, x);
  }
}

function gammaSeriesP(a: number, x: number): number {
  const EPS = 1e-16;
  const MAX_ITER = 1000;
  const gln = gammaln(a);
  let ap = a;
  let del = 1.0 / a;
  let sum = del;

  for (let n = 1; n <= MAX_ITER; n++) {
    ap += 1.0;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) {
      break;
    }
  }
  const logPrefactor = -x + a * Math.log(x) - gln;
  if (logPrefactor < -709.0) return 0.0;
  return Math.min(1.0, sum * Math.exp(logPrefactor));
}

function gammaContinuedFractionQ(a: number, x: number): number {
  const EPS = 1e-16;
  const FPMIN = 1e-300;
  const MAX_ITER = 1000;
  const gln = gammaln(a);

  let b = x + 1.0 - a;
  let c = 1.0 / FPMIN;
  let d = 1.0 / b;
  let h = d;

  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2.0;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) <= EPS) {
      break;
    }
  }

  const logPrefactor = -x + a * Math.log(x) - gln;
  if (logPrefactor < -709.0) return 0.0;
  return Math.max(0.0, Math.min(1.0, Math.exp(logPrefactor) * h));
}

/**
 * Central Chi-Square PDF: f(x; df)
 */
function centralChi2Pdf(x: number, df: number): number {
  if (x <= 0.0 || df <= 0.0) return 0.0;
  const halfDf = df * 0.5;
  const logPdf =
    (halfDf - 1.0) * Math.log(x) -
    x * 0.5 -
    halfDf * Math.LN2 -
    gammaln(halfDf);
  if (logPdf < -709.0) return 0.0;
  return Math.exp(logPdf);
}

/**
 * Central Chi-Square Quantile (Inverse CDF) with Newton-Raphson refinement
 * using high-precision centralChi2Cdf for full IEEE-754 double precision accuracy matching DCDFLIB.
 */
export function quantileChi2(df: number, lambda: number, p: number): number {
  if (p <= 0) return 0.0;
  if (p >= 1) return Infinity;

  // Initial approximation via jStat
  let x = jStat.chisquare.inv(p, df);
  if (!Number.isFinite(x) || x <= 0) {
    x = df;
  }

  // Refine with Newton-Raphson using exact centralChi2Cdf when central (lambda === 0)
  if (lambda < 1e-100) {
    for (let i = 0; i < 30; i++) {
      const cdf = centralChi2Cdf(x, df);
      const err = cdf - p;
      if (Math.abs(err) <= 1e-15) break;
      const pdf = centralChi2Pdf(x, df);
      if (pdf <= 0) break;
      const nextX = x - err / pdf;
      if (nextX <= 0) {
        x = x * 0.5;
      } else {
        x = nextX;
      }
    }
  }
  return x;
}

/**
 * Log-Poisson probability log(e^(-mu) * mu^j / j!)
 */
function logPoissonWeight(mu: number, j: number): number {
  if (j === 0) return -mu;
  return -mu + j * Math.log(mu) - gammaln(j + 1);
}

/**
 * Non-central Chi-Square CDF: P(X <= x) for X ~ Chi2(df, lambda)
 * Implements bidirectional expansion around the mode j0 = floor(lambda * 0.5)
 * as specified in SPEC.md Section 3:
 * - If lambda < 1e-100: calls central Chi2 CDF directly.
 * - If lambda >= 1e-100: expands upwards (j0+1, j0+2, ...) and downwards (j0, j0-1, ..., 0)
 *   weighted by Poisson(lambda / 2) * CentralChi2Cdf(x, df + 2j),
 *   stopping when term <= sum * DBL_EPSILON or total steps reach max(1000, 3 * floor(lambda * 0.5)).
 */
export function cdfChi2(df: number, lambda: number, x: number): number {
  if (x <= 0.0) return 0.0;
  if (lambda < 1e-100) {
    return centralChi2Cdf(x, df);
  }

  const DBL_EPSILON = 2.220446049250313e-16;
  const mu = lambda * 0.5;
  const j0 = Math.floor(mu);
  const maxSteps = Math.max(1000, 3 * j0);

  const w0 = Math.exp(logPoissonWeight(mu, j0));
  let sum = 0.0;
  let steps = 0;

  // Downward expansion: j = j0, j0 - 1, ..., 0
  let wDown = w0;
  for (let j = j0; j >= 0; j--) {
    const c = centralChi2Cdf(x, df + 2.0 * j);
    const term = wDown * c;
    sum += term;
    steps++;
    if (j > 0) {
      wDown = wDown * (j / mu);
      if (wDown === 0) {
        wDown = Math.exp(logPoissonWeight(mu, j - 1));
      }
    }
    if (j < j0 && (wDown <= sum * DBL_EPSILON || steps >= maxSteps)) {
      break;
    }
  }

  // Upward expansion: j = j0 + 1, j0 + 2, ...
  let wUp = w0;
  for (let j = j0 + 1; steps < maxSteps; j++) {
    wUp = wUp * (mu / j);
    if (wUp === 0 || !Number.isFinite(wUp)) {
      wUp = Math.exp(logPoissonWeight(mu, j));
    }
    const c = centralChi2Cdf(x, df + 2.0 * j);
    const term = wUp * c;
    sum += term;
    steps++;
    if (term <= sum * DBL_EPSILON) {
      break;
    }
  }

  return Math.min(1.0, Math.max(0.0, sum));
}

/**
 * Validates input parameters according to SPEC.md Section 2
 */
export function validateInputs(
  mode: 'a-priori' | 'post-hoc',
  params: {
    df?: number;
    w?: number;
    alpha?: number;
    power?: number;
    n_total?: number;
  }
): void {
  const { df, w, alpha, power, n_total } = params;

  if (df === undefined || Number.isNaN(df) || !Number.isFinite(df) || df < 1.0) {
    throw new ValidationError('Degrees of Freedom must be greater or equal one.');
  }

  if (mode === 'a-priori') {
    if (w === undefined || Number.isNaN(w) || !Number.isFinite(w) || w < 1e-6) {
      throw new ValidationError('Effect size w must be greater 1e-06.');
    }
  } else {
    if (w === undefined || Number.isNaN(w) || !Number.isFinite(w) || w < 0.0) {
      throw new ValidationError('Effect size w must be non-negative.');
    }
  }

  if (
    alpha === undefined ||
    Number.isNaN(alpha) ||
    !Number.isFinite(alpha) ||
    alpha < 1e-7 ||
    alpha > 0.9999999
  ) {
    throw new ValidationError('Alpha is outside the admissible range (1e-07, 1).');
  }

  if (mode === 'a-priori') {
    if (
      power === undefined ||
      Number.isNaN(power) ||
      !Number.isFinite(power) ||
      power < 1e-7 ||
      power > 0.9999999
    ) {
      throw new ValidationError('Power is outside the admissible range (1e-07, 1).');
    }
    if (power < alpha) {
      throw new ValidationError('Power must be greater than or equal to alpha.');
    }
  } else {
    if (
      n_total === undefined ||
      Number.isNaN(n_total) ||
      !Number.isFinite(n_total) ||
      n_total < 1 ||
      n_total > 2147483646
    ) {
      throw new ValidationError(
        'Total sample size is outside the admissible range (1, 2147483646).'
      );
    }
  }
}

/**
 * Post-hoc power calculation (SPEC.md Section 3)
 * Raw internal helper (no validation) used during root finding as well.
 */
export function computePostHocRaw(
  w: number,
  alpha: number,
  n: number,
  df: number,
  precomputedCritChi2?: number
): { power: number; crit_chi2: number; lambda: number } {
  const crit_chi2 =
    precomputedCritChi2 !== undefined
      ? precomputedCritChi2
      : quantileChi2(df, 0.0, 1.0 - alpha);
  const lambda = w * w * n;
  const beta = cdfChi2(df, lambda, crit_chi2);
  const power = 1.0 - beta;
  return { power, crit_chi2, lambda };
}

/**
 * Public Post-Hoc calculation with full input validation
 */
export function calculatePostHoc(params: PostHocParams): K4Result {
  validateInputs('post-hoc', params);
  const { w, alpha, n_total, df } = params;
  const { power, crit_chi2, lambda } = computePostHocRaw(w, alpha, n_total, df);

  return {
    n_total,
    actual_power: power,
    critical: crit_chi2,
    df,
    ncp: lambda,
  };
}

/**
 * Pre-rounding sample size rounding formula (SPEC.md Section 4 & Rule 5):
 * N_final = Math.ceil(Math.floor(N_raw * 1e10 + 0.5) / 1e10)
 */
export function roundSampleSize(nRaw: number): number {
  const nScaled = Math.floor(nRaw * 1e10 + 0.5);
  return Math.ceil(nScaled / 1e10);
}

/**
 * Asymmetric root bracketing (SPEC.md Section 4):
 * Starts at N = 100.0.
 * - If f(100.0) < 0 (upward search):
 *   lower = 100.0, upper = 160.0; while f(upper) < 0: lower = upper, upper = upper * 1.6
 * - If f(100.0) >= 0 (downward search):
 *   upper = 100.0, lower = 50.5; while lower >= 1.0 and f(lower) > 0: upper = lower, lower = (lower + 1) * 0.5 - 1
 * Clamps lower < 1.0 to 1.0 at the end of the loop.
 */
export function bracketSampleSize(f: (n: number) => number): {
  lower: number;
  upper: number;
} {
  const f100 = f(100.0);
  let lower: number;
  let upper: number;

  if (f100 < 0.0) {
    lower = 100.0;
    upper = 160.0;
    while (f(upper) < 0.0) {
      lower = upper;
      upper = upper * 1.6;
      if (!Number.isFinite(upper)) {
        break;
      }
    }
  } else {
    upper = 100.0;
    lower = 50.5;
    while (lower >= 1.0 && f(lower) > 0.0) {
      upper = lower;
      lower = (lower + 1.0) * 0.5 - 1.0;
    }
    if (lower < 1.0) {
      lower = 1.0;
    }
  }

  return { lower, upper };
}

/**
 * Brent-Dekker Root Finding Algorithm (SPEC.md Section 4):
 * Uses inverse quadratic interpolation, secant, or bisection step per iteration.
 * Stopping criteria:
 * - Exact root: f(b) == 0.0 (status 0)
 * - Relative machine precision: Math.abs(0.5 * (c - b)) <= Math.abs(b) * 1.1102230246251565e-16
 *   or tolerance check (status 0)
 * - Max iterations: iter == 300 (status 2)
 */
export function brentRootFinder(
  f: (x: number) => number,
  lower: number,
  upper: number,
  tol = 1e-11,
  maxIter = 300
): { root: number; status: number; iterations: number } {
  const HALF_DBL_EPSILON = 1.1102230246251565e-16;
  let a = lower;
  let b = upper;
  let fa = f(a);
  let fb = f(b);

  if (fa === 0.0) {
    return { root: a, status: 0, iterations: 0 };
  }
  if (fb === 0.0) {
    return { root: b, status: 0, iterations: 0 };
  }

  // If f(lower) > 0 even at lower=1.0 (target power already exceeded at N=1)
  if (fa > 0.0 && fb > 0.0) {
    return { root: a, status: 0, iterations: 0 };
  }

  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let iter = 1; iter <= maxIter; iter++) {
    if ((fb > 0.0 && fc > 0.0) || (fb < 0.0 && fc < 0.0)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }

    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const xm = 0.5 * (c - b);
    const tol1 = Math.abs(b) * HALF_DBL_EPSILON;

    if (fb === 0.0 || Math.abs(xm) <= tol1) {
      return { root: b, status: 0, iterations: iter };
    }

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let s = fb / fa;
      let p: number;
      let q: number;

      if (a === c) {
        // Secant method
        p = 2.0 * xm * s;
        q = 1.0 - s;
      } else {
        // Inverse quadratic interpolation
        q = fa / fc;
        const r = fb / fc;
        p = s * (2.0 * xm * q * (q - r) - (b - a) * (r - 1.0));
        q = (q - 1.0) * (r - 1.0) * (s - 1.0);
      }

      if (p > 0.0) {
        q = -q;
      }
      p = Math.abs(p);

      const min1 = 3.0 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2.0 * p < (min1 < min2 ? min1 : min2)) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      // Bisection
      d = xm;
      e = d;
    }

    a = b;
    fa = fb;
    if (Math.abs(d) > tol1) {
      b += d;
    } else {
      b += xm >= 0.0 ? Math.abs(tol1) : -Math.abs(tol1);
    }
    fb = f(b);
  }

  return { root: b, status: 2, iterations: maxIter };
}

/**
 * A-Priori Sample Size and Actual Power Calculation (SPEC.md Section 4)
 * 1. Validates inputs.
 * 2. Defines f(N) = PostHocPower(w, alpha, N, df) - target_power.
 * 3. Brackets the root asymmetrically starting at N = 100.
 * 4. Finds continuous root N_raw via Brent-Dekker.
 * 5. Applies pre-rounding: N_final = Math.ceil(Math.floor(N_raw * 1e10 + 0.5) / 1e10).
 * 6. Recomputes Actual Power and NCP (lambda) using N_final.
 */
export function calculateAPriori(params: APrioriParams): K4Result {
  validateInputs('a-priori', params);
  const { w, alpha, power: targetPower, df } = params;

  const crit_chi2 = quantileChi2(df, 0.0, 1.0 - alpha);
  const f = (n: number): number => {
    const res = computePostHocRaw(w, alpha, n, df, crit_chi2);
    return res.power - targetPower;
  };

  const { lower, upper } = bracketSampleSize(f);
  const { root: nRaw } = brentRootFinder(f, lower, upper, 1e-11, 300);

  const nFinal = Math.max(1, roundSampleSize(nRaw));
  const finalStats = computePostHocRaw(w, alpha, nFinal, df, crit_chi2);

  return {
    n_total: nFinal,
    actual_power: finalStats.power,
    critical: crit_chi2,
    df,
    ncp: finalStats.lambda,
  };
}

/**
 * Effect Size (w) Drawer Utilities (SPEC.md Section 5 - CEff_CHI_GoF_Cont)
 */

/**
 * Clamps cell count k to [2, 50]
 */
export function clampCellCount(k: number): number {
  const intK = Math.trunc(k);
  if (intK < 2) return 2;
  if (intK > 50) return 50;
  return intK;
}

/**
 * Manual column normalization with floating-point remainder added to the last cell (SPEC.md Section 5):
 * 1. dVar7 = sum(p[0..k-1])
 * 2. p_new[i] = p[i] / dVar7
 * 3. dVar8 = sum(p_new[0..k-1])
 * 4. p_new[k-1] += (1.0 - dVar8)
 */
export function normalizeColumn(p: number[]): number[] {
  const k = p.length;
  if (k === 0) return [];
  let sum = 0.0;
  for (let i = 0; i < k; i++) {
    sum += p[i];
  }
  if (sum <= 0.0) {
    throw new ValidationError(
      'The sum of the expected probabilities p(H1) must be.\ngreater zero if in normalize input mode'
    );
  }
  const pNew = new Array<number>(k);
  let sumNew = 0.0;
  for (let i = 0; i < k; i++) {
    pNew[i] = p[i] / sum;
    sumNew += pNew[i];
  }
  pNew[k - 1] += 1.0 - sumNew;
  return pNew;
}

/**
 * Calculates Cohen's w from cell probabilities p(H0) and p(H1) (SPEC.md Section 5)
 * @param p0 Array of expected probabilities under H0
 * @param p1 Array of expected probabilities under H1
 * @param inmode Input mode (0 = auto-normalize, 2 = strict sum=1 check)
 */
export function calculateEffectSizeW(
  p0: number[],
  p1: number[],
  inmode: 0 | 2 = 2
): number {
  const k = p0.length;
  if (k !== p1.length || k < 2) {
    throw new ValidationError('Invalid cell array lengths.');
  }

  for (let i = 0; i < k; i++) {
    if (p0[i] <= 1e-19) {
      throw new ValidationError(
        'All expected probabilities p(H0)\nmust be greater than 1e-19'
      );
    }
  }

  for (let i = 0; i < k; i++) {
    if (p1[i] < 0.0) {
      throw new ValidationError(
        'All expected probabilities p(H1)\nmust be greater than or equal to 0'
      );
    }
  }

  let sum0 = 0.0;
  let sum1 = 0.0;
  for (let i = 0; i < k; i++) {
    sum0 += p0[i];
    sum1 += p1[i];
  }

  let normP0 = p0.slice();
  let normP1 = p1.slice();

  if (inmode === 0) {
    if (sum1 <= 0.0) {
      throw new ValidationError(
        'The sum of the expected probabilities p(H1) must be.\ngreater zero if in normalize input mode'
      );
    }
    normP0 = normalizeColumn(normP0);
    normP1 = normalizeColumn(normP1);
  } else {
    const tol = 1e-6;
    if (sum0 < 1.0 - tol) {
      throw new ValidationError(
        'The sum of the expected probabilities p(H0) must be 1.0.\nThe real sum is too small.'
      );
    }
    if (sum0 > 1.0 + tol) {
      throw new ValidationError(
        'The sum of the expected probabilities p(H0) must be 1.0.\nThe real sum is too large.'
      );
    }
    if (sum1 < 1.0 - tol) {
      throw new ValidationError(
        'The sum of the expected probabilities p(H1) must be 1.0.\nThe real sum is too small.'
      );
    }
    if (sum1 > 1.0 + tol) {
      throw new ValidationError(
        'The sum of the expected probabilities p(H1) must be 1.0.\nThe real sum is too large.'
      );
    }
  }

  let chi2Sum = 0.0;
  for (let i = 0; i < k; i++) {
    const diff = normP1[i] - normP0[i];
    chi2Sum += (diff * diff) / normP0[i];
  }

  return Math.sqrt(chi2Sum);
}
