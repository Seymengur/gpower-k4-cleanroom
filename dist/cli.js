#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCliArgs = parseCliArgs;
exports.runCli = runCli;
const engine_1 = require("./engine");
function parseStrictNumber(raw, paramName) {
    if (raw === undefined || raw.trim() === '') {
        throw new engine_1.ValidationError(`Missing value for parameter --${paramName}`);
    }
    const num = Number(raw);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new engine_1.ValidationError(`Invalid numeric value for --${paramName}: ${raw}`);
    }
    return num;
}
function parseCliArgs(argv) {
    const result = {};
    let i = 0;
    while (i < argv.length) {
        const token = argv[i];
        if (!token.startsWith('--')) {
            throw new engine_1.ValidationError(`Unexpected argument: ${token}`);
        }
        let key;
        let val;
        const eqIdx = token.indexOf('=');
        if (eqIdx !== -1) {
            key = token.slice(2, eqIdx);
            val = token.slice(eqIdx + 1);
            i += 1;
        }
        else {
            key = token.slice(2);
            val = argv[i + 1];
            i += 2;
        }
        switch (key) {
            case 'test':
                if (!val || val.startsWith('--')) {
                    throw new engine_1.ValidationError('Missing value for parameter --test');
                }
                result.test = val;
                break;
            case 'mode':
                if (!val || val.startsWith('--')) {
                    throw new engine_1.ValidationError('Missing value for parameter --mode');
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
                throw new engine_1.ValidationError(`Unknown parameter: --${key}`);
        }
    }
    return result;
}
function runCli(argv) {
    try {
        if (argv.length === 0) {
            throw new engine_1.ValidationError('No arguments provided.');
        }
        const args = parseCliArgs(argv);
        if (args.test !== undefined && args.test !== 'chi2-contingency') {
            throw new engine_1.ValidationError(`Unsupported test type: ${args.test}. Expected 'chi2-contingency'.`);
        }
        const rawMode = args.mode?.toLowerCase();
        let normalizedMode;
        if (rawMode === 'a-priori' || rawMode === 'apriori' || rawMode === 'a_priori') {
            normalizedMode = 'a-priori';
        }
        else if (rawMode === 'post-hoc' ||
            rawMode === 'posthoc' ||
            rawMode === 'post_hoc') {
            normalizedMode = 'post-hoc';
        }
        else {
            throw new engine_1.ValidationError(`Invalid or missing --mode: ${args.mode ?? 'undefined'}. Expected 'a-priori' or 'post-hoc'.`);
        }
        if (normalizedMode === 'a-priori') {
            const outputObj = (0, engine_1.calculateAPriori)({
                w: args.w,
                alpha: args.alpha,
                power: args.power,
                df: args.df,
            });
            return {
                exitCode: 0,
                output: JSON.stringify(outputObj),
            };
        }
        else {
            if (args.n_total !== undefined && !Number.isInteger(args.n_total)) {
                throw new engine_1.ValidationError('Total sample size is outside the admissible range (1, 2147483646).');
            }
            const outputObj = (0, engine_1.calculatePostHoc)({
                w: args.w,
                alpha: args.alpha,
                n_total: args.n_total,
                df: args.df,
            });
            return {
                exitCode: 0,
                output: JSON.stringify(outputObj),
            };
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
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
