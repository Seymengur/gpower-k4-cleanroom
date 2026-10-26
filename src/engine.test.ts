import { describe, it, expect } from 'vitest';
import {
  getDefaults,
  validateInputs,
  calculatePostHoc,
  calculateAPriori,
  roundSampleSize,
  clampCellCount,
  calculateEffectSizeW,
  normalizeColumn,
  cdfChi2,
} from './engine';
import { runCli } from './cli';

describe('K4: Chi-Square Contingency Tables Engine (SPEC.md)', () => {
  describe('Section 1: Default Parameters', () => {
    it('loads exact IEEE-754 defaults and conventions hint', () => {
      const defs = getDefaults();
      expect(defs.w).toBe(0.3);
      expect(defs.alpha).toBe(0.05);
      expect(defs.power).toBe(0.95);
      expect(defs.n_total).toBe(100.0);
      expect(defs.df).toBe(5.0);
      expect(defs.beta_alpha_ratio).toBe(1.0);
      expect(defs.conventions_hint).toBe(
        'Effect size conventions\nw = .10 - small\nw = .30 - medium\nw = .50 - large'
      );
    });
  });

  describe('Section 2: Input Validation & Boundary Values', () => {
    it('validates Degrees of Freedom (df >= 1.0)', () => {
      expect(() =>
        validateInputs('a-priori', { df: -1.0, w: 0.3, alpha: 0.05, power: 0.95 })
      ).toThrow('Degrees of Freedom must be greater or equal one.');
      expect(() =>
        validateInputs('a-priori', { df: 0.0, w: 0.3, alpha: 0.05, power: 0.95 })
      ).toThrow('Degrees of Freedom must be greater or equal one.');
      expect(() =>
        validateInputs('post-hoc', { df: 0.999, w: 0.3, alpha: 0.05, n_total: 100 })
      ).toThrow('Degrees of Freedom must be greater or equal one.');
      expect(() =>
        validateInputs('a-priori', { df: 1.0, w: 0.3, alpha: 0.05, power: 0.95 })
      ).not.toThrow();
      expect(() =>
        validateInputs('post-hoc', { df: 2.5, w: 0.3, alpha: 0.05, n_total: 100 })
      ).not.toThrow();
      expect(() =>
        validateInputs('post-hoc', { df: 5.0, w: 0.3, alpha: 0.05, n_total: 100 })
      ).not.toThrow();
    });

    it('validates Effect Size w in A-Priori mode (w >= 1e-06)', () => {
      for (const w of [-0.1, 0.0, 0.00000099]) {
        expect(() =>
          validateInputs('a-priori', { df: 5, w, alpha: 0.05, power: 0.95 })
        ).toThrow('Effect size w must be greater 1e-06.');
      }
      for (const w of [0.000001, 0.3]) {
        expect(() =>
          validateInputs('a-priori', { df: 5, w, alpha: 0.05, power: 0.95 })
        ).not.toThrow();
      }
    });

    it('validates Effect Size w in Post-Hoc mode (w >= 0.0)', () => {
      expect(() =>
        validateInputs('post-hoc', { df: 5, w: -0.00001, alpha: 0.05, n_total: 100 })
      ).toThrow('Effect size w must be non-negative.');
      for (const w of [0.0, 0.000001, 0.3]) {
        expect(() =>
          validateInputs('post-hoc', { df: 5, w, alpha: 0.05, n_total: 100 })
        ).not.toThrow();
      }
    });

    it('validates Alpha and Power admissible ranges and relationship', () => {
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.00000009, power: 0.95 })
      ).toThrow('Alpha is outside the admissible range (1e-07, 1).');
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.99999991, power: 0.95 })
      ).toThrow('Alpha is outside the admissible range (1e-07, 1).');
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.0000001, power: 0.95 })
      ).not.toThrow();
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.05, power: 0.00000009 })
      ).toThrow('Power is outside the admissible range (1e-07, 1).');
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.05, power: 0.99999991 })
      ).toThrow('Power is outside the admissible range (1e-07, 1).');
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.1, power: 0.05 })
      ).toThrow('Power must be greater than or equal to alpha.');
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.05, power: 0.05 })
      ).not.toThrow();
      expect(() =>
        validateInputs('a-priori', { df: 5, w: 0.3, alpha: 0.05, power: 0.9999999 })
      ).not.toThrow();
    });

    it('validates Total Sample Size N in Post-Hoc mode ([1, 2147483646])', () => {
      for (const n_total of [0, -10, 2147483647]) {
        expect(() =>
          validateInputs('post-hoc', { df: 5, w: 0.3, alpha: 0.05, n_total })
        ).toThrow(
          'Total sample size is outside the admissible range (1, 2147483646).'
        );
      }
      for (const n_total of [1, 100, 2147483646]) {
        expect(() =>
          validateInputs('post-hoc', { df: 5, w: 0.3, alpha: 0.05, n_total })
        ).not.toThrow();
      }
    });
  });

  describe('Section 3: Post-Hoc Power Calculation', () => {
    const cases = [
      { w: 0.3, alpha: 0.05, n_total: 100, df: 5.0, lambda: 9.0, crit: 11.0704977, power: 0.6235846 },
      { w: 0.3, alpha: 0.05, n_total: 220, df: 5.0, lambda: 19.8, crit: 11.0704977, power: 0.9502155 },
      { w: 0.1, alpha: 0.05, n_total: 100, df: 1.0, lambda: 1.0, crit: 3.8414588, power: 0.1700750 },
      { w: 0.5, alpha: 0.01, n_total: 80, df: 3.0, lambda: 20.0, crit: 11.3448667, power: 0.9136896 },
      { w: 0.0, alpha: 0.05, n_total: 100, df: 5.0, lambda: 0.0, crit: 11.0704977, power: 0.0500000 },
    ];

    for (const tc of cases) {
      it(`computes post-hoc for w=${tc.w}, alpha=${tc.alpha}, N=${tc.n_total}, df=${tc.df}`, () => {
        const res = calculatePostHoc({
          w: tc.w,
          alpha: tc.alpha,
          n_total: tc.n_total,
          df: tc.df,
        });
        expect(res.n_total).toBe(tc.n_total);
        expect(res.ncp).toBeCloseTo(tc.lambda, 7);
        expect(res.critical).toBeCloseTo(tc.crit, 6);
        expect(res.actual_power).toBeCloseTo(tc.power, 6);
      });
    }

    it('uses central Chi2 directly when lambda < 1e-100', () => {
      const c1 = cdfChi2(5.0, 0.0, 11.070497693516355);
      const c2 = cdfChi2(5.0, 1e-105, 11.070497693516355);
      expect(c1).toBeCloseTo(0.95, 7);
      expect(c2).toBe(c1);
    });
  });

  describe('Section 4: A-Priori Sample Size & Pre-Rounding', () => {
    it('applies exact 1e-10 pre-rounding formula', () => {
      expect(roundSampleSize(100.0)).toBe(100);
      expect(roundSampleSize(100.00000000004999)).toBe(100);
      expect(roundSampleSize(100.00000000005001)).toBe(101);
      expect(roundSampleSize(219.91824315)).toBe(220);
    });

    const aprioriCases = [
      { w: 0.3, alpha: 0.05, power: 0.95, df: 5.0, expectedN: 220, crit: 11.0704977, lambda: 19.8, actualPower: 0.9502155 },
      { w: 0.3, alpha: 0.05, power: 0.80, df: 5.0, expectedN: 143, crit: 11.0704977, lambda: 12.87, actualPower: 0.8015133 },
      { w: 0.5, alpha: 0.05, power: 0.95, df: 1.0, expectedN: 52, crit: 3.8414588, lambda: 13.0, actualPower: 0.9500756 },
      { w: 0.1, alpha: 0.01, power: 0.90, df: 2.0, expectedN: 1743, crit: 9.2103404, lambda: 17.43, actualPower: 0.9000683 },
    ];

    for (const tc of aprioriCases) {
      it(`computes a-priori for w=${tc.w}, alpha=${tc.alpha}, power=${tc.power}, df=${tc.df}`, () => {
        const res = calculateAPriori({
          w: tc.w,
          alpha: tc.alpha,
          power: tc.power,
          df: tc.df,
        });
        expect(res.n_total).toBe(tc.expectedN);
        expect(res.critical).toBeCloseTo(tc.crit, 6);
        expect(res.ncp).toBeCloseTo(tc.lambda, 6);
        expect(res.actual_power).toBeCloseTo(tc.actualPower, 6);
      });
    }
  });

  describe('Section 5: Effect Size Drawer (CEff_CHI_GoF_Cont)', () => {
    it('clamps cell count to [2, 50]', () => {
      expect(clampCellCount(1)).toBe(2);
      expect(clampCellCount(60)).toBe(50);
      expect(clampCellCount(4)).toBe(4);
    });

    it('validates and calculates Cohen w from cell probabilities', () => {
      expect(() =>
        calculateEffectSizeW([0.0, 0.25, 0.25, 0.5], [0.25, 0.25, 0.25, 0.25], 2)
      ).toThrow('All expected probabilities p(H0)\nmust be greater than 1e-19');

      expect(() =>
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [-0.01, 0.26, 0.25, 0.5], 2)
      ).toThrow('All expected probabilities p(H1)\nmust be greater than or equal to 0');

      expect(() =>
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [0, 0, 0, 0], 0)
      ).toThrow(
        'The sum of the expected probabilities p(H1) must be.\ngreater zero if in normalize input mode'
      );

      expect(() =>
        calculateEffectSizeW([0.2, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], 2)
      ).toThrow('The sum of the expected probabilities p(H0) must be 1.0.\nThe real sum is too small.');

      expect(() =>
        calculateEffectSizeW([0.3, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], 2)
      ).toThrow('The sum of the expected probabilities p(H0) must be 1.0.\nThe real sum is too large.');

      expect(() =>
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [0.2, 0.25, 0.25, 0.25], 2)
      ).toThrow('The sum of the expected probabilities p(H1) must be 1.0.\nThe real sum is too small.');

      expect(() =>
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [0.3, 0.25, 0.25, 0.25], 2)
      ).toThrow('The sum of the expected probabilities p(H1) must be 1.0.\nThe real sum is too large.');

      expect(
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], 2)
      ).toBeCloseTo(0.0, 7);

      expect(
        calculateEffectSizeW([0.25, 0.25, 0.25, 0.25], [0.4, 0.2, 0.2, 0.2], 2)
      ).toBeCloseTo(0.3464102, 6);

      expect(
        calculateEffectSizeW([1.0, 1.0, 1.0, 1.0], [4.0, 2.0, 2.0, 2.0], 0)
      ).toBeCloseTo(0.3464102, 6);
    });

    it('adds floating-point remainder (1.0 - sum) to the last cell on manual normalization', () => {
      const normalized = normalizeColumn([1, 1, 1]);
      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1.0);
    });
  });

  describe('CLI Contract & Error Handling', () => {
    it('handles a-priori CLI call and outputs single-line JSON', () => {
      const res = runCli([
        '--test',
        'chi2-contingency',
        '--mode',
        'a-priori',
        '--w',
        '0.3',
        '--alpha',
        '0.05',
        '--power',
        '0.95',
        '--df',
        '5',
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.output.includes('\n')).toBe(false);
      const parsed = JSON.parse(res.output);
      expect(parsed.n_total).toBe(220);
      expect(parsed.actual_power).toBeCloseTo(0.9502155, 6);
      expect(parsed.critical).toBeCloseTo(11.0704977, 6);
      expect(parsed.df).toBe(5);
      expect(parsed.ncp).toBeCloseTo(19.8, 6);
    });

    it('handles post-hoc CLI call and outputs single-line JSON', () => {
      const res = runCli([
        '--test',
        'chi2-contingency',
        '--mode',
        'post-hoc',
        '--w',
        '0.5',
        '--alpha',
        '0.05',
        '--n_total',
        '210',
        '--df',
        '1',
      ]);
      expect(res.exitCode).toBe(0);
      expect(res.output.includes('\n')).toBe(false);
      const parsed = JSON.parse(res.output);
      expect(parsed.n_total).toBe(210);
      expect(parsed.df).toBe(1);
      expect(parsed.ncp).toBeCloseTo(52.5, 6);
      expect(parsed.critical).toBeCloseTo(3.8414588, 6);
    });

    it('returns non-zero exit code and {"error":"..."} on invalid inputs', () => {
      const res = runCli([
        '--test',
        'chi2-contingency',
        '--mode',
        'a-priori',
        '--w',
        '0.0',
        '--alpha',
        '0.05',
        '--power',
        '0.95',
        '--df',
        '5',
      ]);
      expect(res.exitCode).not.toBe(0);
      const parsed = JSON.parse(res.output);
      expect(parsed.error).toBe('Effect size w must be greater 1e-06.');
    });
  });
});
