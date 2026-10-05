// Bedrock .lang format: `key=value` per line, `##` comments, values may
// contain `=`; literal newlines are written as \n. Parsing keeps entry order.
"use strict";

/** @returns {Map<string, string>} key -> text (insertion-ordered) */
function parseLang(text) {
    const out = new Map();
    for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, "");
        if (!line || line.startsWith("##")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        out.set(line.slice(0, eq).trim(), line.slice(eq + 1));
    }
    return out;
}

function serializeLang(entries, { header } = {}) {
    const lines = [];
    if (header) for (const h of header.split("\n")) lines.push(`## ${h}`);
    for (const [key, value] of entries) {
        if (/[=\n\r]/.test(key)) throw new Error(`lang key ${JSON.stringify(key)} contains "=" or a newline`);
        lines.push(`${key}=${String(value).replace(/\r?\n/g, "\\n")}`);
    }
    return lines.join("\n") + "\n";
}

module.exports = { parseLang, serializeLang };
