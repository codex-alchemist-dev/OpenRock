// Text helpers shared by the line-based Crystal languages.
"use strict";

/**
 * The value of a string token for display text (dialogue, titles, ...). A multi-line backtick string is dedented the way
 * JSX text is read: the line break right after the opening backtick and the indentation-only line before the closing one
 * are dropped, and the common indentation is removed (text that starts on the opening line is left where it is and only the
 * continuation lines are dedented). Everything else (a one-line string, an escape-built string) is returned exactly as
 * written.
 */
function textOf(token) {
    if (!token.multiline) return token.value;
    const lines = token.value.split("\n");
    let head = null;
    if (lines[0].trim() === "") lines.shift(); else head = lines.shift();   // text that starts on the opening line keeps its place
    if (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    const indentOf = l => /^[ \t]*/.exec(l)[0].length;
    const indents = lines.filter(l => l.trim() !== "").map(indentOf);
    const strip = indents.length ? Math.min(...indents) : 0;
    const body = lines.map(l => l.slice(Math.min(strip, indentOf(l))));
    return (head === null ? body : [head, ...body]).join("\n");
}

/** snake_case -> camelCase (`look_at` -> `lookAt`). Words without an underscore come back unchanged. */
const snakeToCamel = s => s.replace(/_+([a-zA-Z0-9])/g, (m, c) => c.toUpperCase());

module.exports = { textOf, snakeToCamel };
