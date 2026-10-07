// Crystal Core: the lexical syntax EVERY Crystal language shares (see docs/crystal.md, "Crystal Core").
//
// The Crystal TS dialects (entity, block, item, manifest) are TypeScript, so their lexical layer IS TypeScript's. The
// line-based languages (Cinema, FMBE, ...) lex with this file, which is deliberately a subset of TypeScript's lexical
// grammar plus a few conveniences, so one set of habits works everywhere:
//
//   comments     // to end of line        /* ... */ (may span lines)        (# to end of line is a deprecated alias)
//   strings      "double" or 'single' with JavaScript escapes (\n \t \r \b \f \v \0 \xHH \uHHHH \u{H...} \\ \" \' \` and
//                \<newline> continuation), or `backticks`, which may span lines. No ${...} interpolation (an error).
//   numbers      12  1.5  .5  1e3  0xFF  1_000    - a leading minus belongs to the number
//   durations    a number followed by s / ms / t: 1.5s  250ms  20t  (always normalised to ticks, 20 per second)
//   identifiers  letters, digits and _ ; plus . and - inside (so `actor.play` and `in-out` are one word)
//   statements   end at a newline or a `;` - both mean the same, so several statements may share a line
//   punctuation  chosen by the language (parens, braces, commas, ...)
//
// Tokens carry 1-based line/col. The string/number/comment rules are checked against TypeScript's own scanner in
// test/crystalCore.test.js, so "same syntax" is a tested claim, not a promise.
"use strict";

const { CrystalSyntaxError } = require("./errors.js");

const TICKS_PER_SECOND = 20;
const UNIT_TICKS = { s: TICKS_PER_SECOND, ms: TICKS_PER_SECOND / 1000, t: 1 };
const SIMPLE_ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };

/**
 * @param {string} source
 * @param {object} [options]
 * @param {string} [options.filename]
 * @param {Record<string,string>} [options.punct] single character -> token type, e.g. { "(": "LPAREN" }
 * @param {boolean} [options.hashComments=true] accept `#` comments (deprecated; reported in `tokens.warnings`)
 * @returns {Array<{type: string, value?: any, line: number, col: number, multiline?: boolean}> & {warnings: Array<{line:number,col:number,message:string}>}}
 */
function lex(source, { filename, punct = {}, hashComments = true } = {}) {
    const tokens = [];
    tokens.warnings = [];
    let i = 0, line = 1, lineStart = 0;
    let emitted = false;   // anything on this logical line yet (a NEWLINE token is only produced after a real token)
    const col = pos => pos - lineStart + 1;
    const fail = (msg, atLine = line, atCol = col(i)) => { throw new CrystalSyntaxError(msg, source, atLine, atCol, filename); };
    const push = (type, value, startPos, startLine, startLineStart, extra) => {
        tokens.push({ type, value, line: startLine, col: startPos - startLineStart + 1, ...extra });
        emitted = true;
    };
    const endStatement = () => {
        if (emitted) tokens.push({ type: "NEWLINE", value: "\n", line, col: col(i) });
        emitted = false;
    };
    const newline = () => { line++; lineStart = i + 1; };

    /** Reads an escape after the backslash at `i` (pointing at the char after `\`). Returns the cooked text. */
    function escape() {
        const c = source[i];
        if (c === undefined) fail("unterminated string");
        if (c === "\r" && source[i + 1] === "\n") { i += 2; line++; lineStart = i; return ""; }       // line continuation
        if (c === "\n" || c === "\r") { i++; line++; lineStart = i; return ""; }
        if (c in SIMPLE_ESCAPES) { i++; return SIMPLE_ESCAPES[c]; }
        if (c === "0" && !/[0-9]/.test(source[i + 1] ?? "")) { i++; return "\0"; }
        if (c === "x") {
            const hex = source.slice(i + 1, i + 3);
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) fail("invalid \\x escape: expected two hex digits");
            i += 3; return String.fromCharCode(parseInt(hex, 16));
        }
        if (c === "u") {
            if (source[i + 1] === "{") {
                const end = source.indexOf("}", i);
                const hex = end < 0 ? "" : source.slice(i + 2, end);
                if (!/^[0-9a-fA-F]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff) fail("invalid \\u{...} escape");
                i = end + 1; return String.fromCodePoint(parseInt(hex, 16));
            }
            const hex = source.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid \\u escape: expected four hex digits");
            i += 5; return String.fromCharCode(parseInt(hex, 16));
        }
        i++;
        return c; // \\ \" \' \` and, as in JavaScript, any other escaped character stands for itself
    }

    function string(quote) {
        const startPos = i, startLine = line, startLineStart = lineStart;
        i++;
        let out = "";
        for (;;) {
            const c = source[i];
            if (c === undefined) fail("unterminated string", startLine, startPos - startLineStart + 1);
            if (c === quote) { i++; break; }
            if (c === "\\") { i++; out += escape(); continue; }
            if (c === "\n" || c === "\r") {
                if (quote !== "`") fail("unterminated string (use a `backtick string` for text that spans lines)", startLine, startPos - startLineStart + 1);
                if (c === "\r" && source[i + 1] === "\n") { out += "\n"; i += 2; line++; lineStart = i; continue; }
                out += "\n"; i++; line++; lineStart = i; continue;
            }
            if (quote === "`" && c === "$" && source[i + 1] === "{") fail("${...} interpolation is not supported in Crystal strings");
            out += c; i++;
        }
        push("STR", out, startPos, startLine, startLineStart, quote === "`" && out.includes("\n") ? { multiline: true } : undefined);
    }

    const NUMBER = /^(?:0[xX][0-9a-fA-F][0-9a-fA-F_]*|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/;
    const IDENT = /^[A-Za-z_][A-Za-z0-9_.-]*/;

    while (i < source.length) {
        const ch = source[i];
        if (ch === "\n") { endStatement(); newline(); i++; continue; }
        if (ch === "\r") { i++; continue; }
        if (ch === " " || ch === "\t") { i++; continue; }
        if (ch === ";") { endStatement(); i++; continue; }
        if (ch === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
        if (ch === "/" && source[i + 1] === "*") {
            const startLine = line, startCol = col(i);
            i += 2;
            while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") newline(); i++; }
            if (i >= source.length) fail("unterminated /* comment", startLine, startCol);
            i += 2; continue;
        }
        if (ch === "#" && hashComments) {
            tokens.warnings.push({ line, col: col(i), message: "`#` comments are deprecated - use `//`" });
            while (i < source.length && source[i] !== "\n") i++;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { string(ch); continue; }

        // a number (with an optional leading minus) and optional duration unit
        const signed = ch === "-" && /[0-9.]/.test(source[i + 1] ?? "") ? 1 : 0;
        const numMatch = NUMBER.exec(source.slice(i + signed, i + signed + 64));
        if (numMatch && (signed || /[0-9.]/.test(ch))) {
            const startPos = i, startLine = line, startLineStart = lineStart;
            if (/_$/.test(numMatch[0]) || /__/.test(numMatch[0])) fail("invalid numeric separator");
            const text = numMatch[0].replace(/_/g, "");
            let value = Number(text);
            if (Number.isNaN(value)) fail(`invalid number "${numMatch[0]}"`);
            if (signed) value = -value;
            i += signed + numMatch[0].length;
            const unit = /^(ms|s|t)(?![A-Za-z0-9_])/.exec(source.slice(i, i + 3));
            if (unit) { push("DUR", Math.round(value * UNIT_TICKS[unit[1]]), startPos, startLine, startLineStart); i += unit[0].length; }
            else push("NUM", value, startPos, startLine, startLineStart);
            continue;
        }
        if (punct[ch]) { push(punct[ch], ch, i, line, lineStart); i++; continue; }
        const id = IDENT.exec(source.slice(i, i + 128));
        if (id) { push("IDENT", id[0], i, line, lineStart); i += id[0].length; continue; }
        fail(`unexpected character ${JSON.stringify(ch)}`);
    }
    endStatement();
    tokens.push({ type: "EOF", value: null, line, col: col(i) });
    return tokens;
}

module.exports = { lex, TICKS_PER_SECOND, UNIT_TICKS };
