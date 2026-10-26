#!/usr/bin/env node
import {
  calculateAPriori,
  calculatePostHoc,
  ValidationError,
} from './engine';

interface ParsedArgs {
  test?: string;
  mode?: string;
  w?: number;
  alpha?: number;
  df?: number;
  power?: number;
  n_total?: number;
}

function parseStrictNumber(raw: string | undefined, paramName: string): number {
  if (raw === undefined || raw.trim() === '') {
    throw new ValidationError(`Missing value for parameter --${paramName}`);
  }
  const num = Number(raw);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new ValidationError(`Invalid numeric value for --${paramName}: ${raw}`);
  }
  return num;
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  let i = 0;

  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new ValidationError(`Unexpected argument: ${token}`);
    }

    let key: string;
    let val: string | undefined;

    const eqIdx = token.indexOf('=');
    if (eqIdx !== -1) {
      key = token.slice(2, eqIdx);
      val = token.slice(eqIdx + 1);
      i += 1;
    } else {
      key = token.slice(2);
      val = argv[i + 1];
      i += 2;
    }

    switch (key) {
      case 'test':
        if (!val || val.startsWith('--')) {
          throw new ValidationError('Missing value for parameter --test');
        }
        result.test = val;
        break;
      case 'mode':
        if (!val || val.startsWith('--')) {
          throw new ValidationError('Missing value for parameter --mode');
        }
        result.mode = val;
        break;
      case 'w':
        result.w = parseStrictNumber(val, 'w');
        break;
      case 'alpha':
        result.alpha = parseStrictNumber(val, 'alpha');
        break;
      case 'df':
        result.df = parseStrictNumber(val, 'df');
        break;
      case 'power':
        result.power = parseStrictNumber(val, 'power');
        break;
      case 'n_total':
      case 'n':
        result.n_total = parseStrictNumber(val, key);
        break;
      default:
        throw new ValidationError(`Unknown parameter: --${key}`);
    }
  }

  return result;
}

export function runCli(argv: string[]): { exitCode: number; output: string } {
  try {
    if (argv.length === 0) {
      throw new ValidationError('No arguments provided.');
    }

    const args = parseCliArgs(argv);

    if (args.test !== undefined && args.test !== 'chi2-contingency') {
      throw new ValidationError(
        `Unsupported test type: ${args.test}. Expected 'chi2-contingency'.`
      );
    }

    const rawMode = args.mode?.toLowerCase();
    let normalizedMode: 'a-priori' | 'post-hoc';
    if (rawMode === 'a-priori' || rawMode === 'apriori' || rawMode === 'a_priori') {
      normalizedMode = 'a-priori';
    } else if (
      rawMode === 'post-hoc' ||
      rawMode === 'posthoc' ||
      rawMode === 'post_hoc'
    ) {
      normalizedMode = 'post-hoc';
    } else {
      throw new ValidationError(
        `Invalid or missing --mode: ${args.mode ?? 'undefined'}. Expected 'a-priori' or 'post-hoc'.`
      );
    }

    if (normalizedMode === 'a-priori') {
      const outputObj = calculateAPriori({
        w: args.w as number,
        alpha: args.alpha as number,
        power: args.power as number,
        df: args.df as number,
      });
      return {
        exitCode: 0,
        output: JSON.stringify(outputObj),
      };
    } else {
      if (args.n_total !== undefined && !Number.isInteger(args.n_total)) {
        throw new ValidationError(
          'Total sample size is outside the admissible range (1, 2147483646).'
        );
      }
      const outputObj = calculatePostHoc({
        w: args.w as number,
        alpha: args.alpha as number,
        n_total: args.n_total as number,
        df: args.df as number,
      });
      return {
        exitCode: 0,
        output: JSON.stringify(outputObj),
      };
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return {
      exitCode: 1,
      output: JSON.stringify({ error: message }),
    };
  }
}

if (require.main === module) {
  const { exitCode, output } = runCli(process.argv.slice(2));
  process.stdout.write(output + '\n');
  process.exit(exitCode);
}
