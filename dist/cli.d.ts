#!/usr/bin/env node
interface ParsedArgs {
    test?: string;
    mode?: string;
    w?: number;
    alpha?: number;
    df?: number;
    power?: number;
    n_total?: number;
}
export declare function parseCliArgs(argv: string[]): ParsedArgs;
export declare function runCli(argv: string[]): {
    exitCode: number;
    output: string;
};
export {};
