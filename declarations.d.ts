// The vendored encoder is bundled as a `.txt` asset (see metro.config.js), so
// `require(...)` of it returns an asset module reference rather than code.
declare module '*.txt';
