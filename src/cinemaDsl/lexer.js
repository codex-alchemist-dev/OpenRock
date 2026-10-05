// Crystal Cinema lexer: turns .cinema source text into a flat token list
// with 1-based line/col on every token. Statements are line-based, so NEWLINE
// is a real token; blank lines and `#` / `//` comments produce nothing.
"use strict";

const TICKS_PER_SECOND = 20;
const UNIT_TICKS = { s: TICKS_PER_SECOND, ms: TICKS_PER_SECOND / 1000, t: 1 };

class CinemaSyntaxError extends Error {
    constructor(message, source, line, col, filename) {
        super(message);
        this.name = "CinemaSyntaxError";
        this.cinemaLine = line;
        this.cinemaCol = col;
        this.filename = filename ?? null;
        this.frame = source ? codeFrame(source, line, col) : "";
        this.message = `${filename ? filename + ":" : ""}${line}:${col}: ${message}${this.frame ? "\n" + this.frame : ""}`;
    }
}

function codeFrame(source, line, col) {
    const lines = source.split(/\r?\n/);
    const text = lines[line - 1] ?? "";
    const gutter = String(line).padStart(4) + " | ";
    return `${gutter}${text}\n${" ".repeat(gutter.length + Math.max(0, col - 1))}^`;
}

const PUNCT = { "(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE", ",": "COMMA", "=": "EQ", "+": "PLUS" };

/** @returns {Array<{type: string, value?: any, line: number, col: number}>} */
function lex(source, filename) {
    const tokens = [];
    const lines = source.split(/\r?\n/);
    const fail = (msg, line, col) => { throw new CinemaSyntaxError(msg, source, line, col, filename); };

    lines.forEach((text, idx) => {
        const line = idx + 1;
        let i = 0;
        let emitted = false;
        const push = (type, value, col) => { tokens.push({ type, value, line, col }); emitted = true; };
        while (i < text.length) {
            const ch = text[i];
            const col = i + 1;
            if (ch === " " || ch === "\t") { i++; continue; }
            if (ch === "#" || (ch === "/" && text[i + 1] === "/")) break;
            if (PUNCT[ch]) { push(PUNCT[ch], ch, col); i++; continue; }
            if (ch === '"') {
                let j = i + 1, out = "";
                while (j < text.length && text[j] !== '"') {
                    if (text[j] === "\\" && j + 1 < text.length) { out += text[j + 1] === "n" ? "\n" : text[j + 1]; j += 2; }
                    else out += text[j++];
                }
                if (text[j] !== '"') fail("unterminated string", line, col);
                push("STR", out, col);
                i = j + 1;
                continue;
            }
            const num = /^-?\d+(\.\d+)?/.exec(text.slice(i));
            if (num) {
                let j = i + num[0].length;
                const value = Number(num[0]);
                const unit = /^(ms|s|t)(?![A-Za-z0-9_])/.exec(text.slice(j));
                if (unit) {
                    push("DUR", Math.round(value * UNIT_TICKS[unit[1]]), col);
                    j += unit[0].length;
                } else {
                    push("NUM", value, col);
                }
                i = j;
                continue;
            }
            const ident = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(text.slice(i));
            if (ident) { push("IDENT", ident[0], col); i += ident[0].length; continue; }
            fail(`unexpected character ${JSON.stringify(ch)}`, line, col);
        }
        if (emitted) tokens.push({ type: "NEWLINE", value: "\n", line, col: text.length + 1 });
    });
    tokens.push({ type: "EOF", value: null, line: lines.length, col: 1 });
    return tokens;
}

module.exports = { lex, CinemaSyntaxError, codeFrame, TICKS_PER_SECOND };
