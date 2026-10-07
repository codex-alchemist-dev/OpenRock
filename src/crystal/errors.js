// The one diagnostic every Crystal language reports its own mistakes with: `file:line:col: message` plus a code frame.
// (Crystal TS dialects get the same shape from tsc's diagnostics.)
"use strict";

function codeFrame(source, line, col) {
    const lines = source.split(/\r?\n/);
    const text = lines[line - 1] ?? "";
    const gutter = String(line).padStart(4) + " | ";
    return `${gutter}${text}\n${" ".repeat(gutter.length + Math.max(0, col - 1))}^`;
}

class CrystalSyntaxError extends Error {
    constructor(message, source, line, col, filename) {
        super(message);
        this.name = "CrystalSyntaxError";
        this.crystalLine = line;
        this.crystalCol = col;
        // kept for the Cinema code that already reads these
        this.cinemaLine = line;
        this.cinemaCol = col;
        this.filename = filename ?? null;
        this.frame = source ? codeFrame(source, line, col) : "";
        this.message = `${filename ? filename + ":" : ""}${line}:${col}: ${message}${this.frame ? "\n" + this.frame : ""}`;
    }
}

module.exports = { CrystalSyntaxError, codeFrame };
