// Type surface for export_slice.mjs (the scripts/*.d.mts convention, so a
// test can import the .mjs under strict tsc).

/** Absolute path of the TypeScript exporter the entry runs. */
export declare const EXPORT_SCRIPT: string;

/** Run the export with CLI arguments; returns the child exit code. */
export declare function runWorldSliceExport(argv: readonly string[]): number;
