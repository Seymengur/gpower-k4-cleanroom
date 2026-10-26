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
export declare class ValidationError extends Error {
    constructor(message: string);
}
/**
 * Default parameters as specified in SPEC.md Section 1
 */
export declare function getDefaults(): K4Defaults;
/**
 * Accurate Log-Gamma function (Lanczos g=7, n=9 approximation with 16-digit IEEE-754 precision)
 * Note: jStat.gammaln has a bug where its loop runs j < 6 instead of j < 8!
 */
export declare function gammaln(xx: number): number;
export declare function centralChi2Cdf(x: number, df: number): number;
/**
 * Central Chi-Square Quantile (Inverse CDF) with Newton-Raphson refinement
 * using high-precision centralChi2Cdf for full IEEE-754 double precision accuracy matching DCDFLIB.
 */
export declare function quantileChi2(df: number, lambda: number, p: number): number;
/**
 * Non-central Chi-Square CDF: P(X <= x) for X ~ Chi2(df, lambda)
 * Implements bidirectional expansion around the mode j0 = floor(lambda * 0.5)
 * as specified in SPEC.md Section 3:
 * - If lambda < 1e-100: calls central Chi2 CDF directly.
 * - If lambda >= 1e-100: expands upwards (j0+1, j0+2, ...) and downwards (j0, j0-1, ..., 0)
 *   weighted by Poisson(lambda / 2) * CentralChi2Cdf(x, df + 2j),
 *   stopping when term <= sum * DBL_EPSILON or total steps reach max(1000, 3 * floor(lambda * 0.5)).
 */
export declare function cdfChi2(df: number, lambda: number, x: number): number;
/**
 * Validates input parameters according to SPEC.md Section 2
 */
export declare function validateInputs(mode: 'a-priori' | 'post-hoc', params: {
    df?: number;
    w?: number;
    alpha?: number;
    power?: number;
    n_total?: number;
}): void;
/**
 * Post-hoc power calculation (SPEC.md Section 3)
 * Raw internal helper (no validation) used during root finding as well.
 */
export declare function computePostHocRaw(w: number, alpha: number, n: number, df: number, precomputedCritChi2?: number): {
    power: number;
    crit_chi2: number;
    lambda: number;
};
/**
 * Public Post-Hoc calculation with full input validation
 */
export declare function calculatePostHoc(params: PostHocParams): K4Result;
/**
 * Pre-rounding sample size rounding formula (SPEC.md Section 4 & Rule 5):
 * N_final = Math.ceil(Math.floor(N_raw * 1e10 + 0.5) / 1e10)
 */
export declare function roundSampleSize(nRaw: number): number;
/**
 * Asymmetric root bracketing (SPEC.md Section 4):
 * Starts at N = 100.0.
 * - If f(100.0) < 0 (upward search):
 *   lower = 100.0, upper = 160.0; while f(upper) < 0: lower = upper, upper = upper * 1.6
 * - If f(100.0) >= 0 (downward search):
 *   upper = 100.0, lower = 50.5; while lower >= 1.0 and f(lower) > 0: upper = lower, lower = (lower + 1) * 0.5 - 1
 * Clamps lower < 1.0 to 1.0 at the end of the loop.
 */
export declare function bracketSampleSize(f: (n: number) => number): {
    lower: number;
    upper: number;
};
/**
 * Brent-Dekker Root Finding Algorithm (SPEC.md Section 4):
 * Uses inverse quadratic interpolation, secant, or bisection step per iteration.
 * Stopping criteria:
 * - Exact root: f(b) == 0.0 (status 0)
 * - Relative machine precision: Math.abs(0.5 * (c - b)) <= Math.abs(b) * 1.1102230246251565e-16
 *   or tolerance check (status 0)
 * - Max iterations: iter == 300 (status 2)
 */
export declare function brentRootFinder(f: (x: number) => number, lower: number, upper: number, tol?: number, maxIter?: number): {
    root: number;
    status: number;
    iterations: number;
};
/**
 * A-Priori Sample Size and Actual Power Calculation (SPEC.md Section 4)
 * 1. Validates inputs.
 * 2. Defines f(N) = PostHocPower(w, alpha, N, df) - target_power.
 * 3. Brackets the root asymmetrically starting at N = 100.
 * 4. Finds continuous root N_raw via Brent-Dekker.
 * 5. Applies pre-rounding: N_final = Math.ceil(Math.floor(N_raw * 1e10 + 0.5) / 1e10).
 * 6. Recomputes Actual Power and NCP (lambda) using N_final.
 */
export declare function calculateAPriori(params: APrioriParams): K4Result;
/**
 * Effect Size (w) Drawer Utilities (SPEC.md Section 5 - CEff_CHI_GoF_Cont)
 */
/**
 * Clamps cell count k to [2, 50]
 */
export declare function clampCellCount(k: number): number;
/**
 * Manual column normalization with floating-point remainder added to the last cell (SPEC.md Section 5):
 * 1. dVar7 = sum(p[0..k-1])
 * 2. p_new[i] = p[i] / dVar7
 * 3. dVar8 = sum(p_new[0..k-1])
 * 4. p_new[k-1] += (1.0 - dVar8)
 */
export declare function normalizeColumn(p: number[]): number[];
/**
 * Calculates Cohen's w from cell probabilities p(H0) and p(H1) (SPEC.md Section 5)
 * @param p0 Array of expected probabilities under H0
 * @param p1 Array of expected probabilities under H1
 * @param inmode Input mode (0 = auto-normalize, 2 = strict sum=1 check)
 */
export declare function calculateEffectSizeW(p0: number[], p1: number[], inmode?: 0 | 2): number;
