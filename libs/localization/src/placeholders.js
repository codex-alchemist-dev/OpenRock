// Placeholder protection: everything in a string that must survive
// translation byte-for-byte (format specifiers, {0}/{name} slots, MinUI
// {t:key} markers, color codes, escaped newlines) is swapped for opaque
// sentinels before text goes to a translator and verified on the way back.
"use strict";

const TOKEN_RE = /\{t:[^}]+\}|%\d*\$?[sdif]|%%|\{[A-Za-z0-9_]+\}|§[0-9a-fk-or]|\\n/g;
const SENTINEL_RE = /⟦(\d+)⟧/g;

function extractPlaceholders(text) {
    return text.match(TOKEN_RE) ?? [];
}

const multiset = list => list.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());

/** Order-insensitive comparison of the placeholders in two strings (translations may reorder them). */
function comparePlaceholders(source, translation) {
    const a = multiset(extractPlaceholders(source));
    const b = multiset(extractPlaceholders(translation));
    const missing = [];
    const extra = [];
    for (const [t, n] of a) for (let i = (b.get(t) ?? 0); i < n; i++) missing.push(t);
    for (const [t, n] of b) for (let i = (a.get(t) ?? 0); i < n; i++) extra.push(t);
    return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Replaces placeholders (and optional do-not-translate terms) with ⟦n⟧ sentinels. */
function mask(text, doNotTranslate = []) {
    const tokens = [];
    const take = m => { tokens.push(m); return `⟦${tokens.length - 1}⟧`; };
    let out = text.replace(TOKEN_RE, take);
    for (const term of [...doNotTranslate].sort((x, y) => y.length - x.length)) {
        if (!term) continue;
        const parts = out.split(term);
        out = parts.reduce((acc, part, i) => acc + part + (i < parts.length - 1 ? take(term) : ""), "");
    }
    return { masked: out, tokens };
}

/** Restores sentinels. ok=false if any sentinel was dropped, duplicated, invented, or text still holds a stray one. */
function unmask(translated, tokens) {
    const seen = new Map();
    let invented = false;
    const text = translated.replace(SENTINEL_RE, (m, n) => {
        const i = Number(n);
        if (i >= tokens.length) { invented = true; return m; }
        seen.set(i, (seen.get(i) ?? 0) + 1);
        return tokens[i];
    });
    const missing = [];
    const duplicated = [];
    tokens.forEach((t, i) => {
        const c = seen.get(i) ?? 0;
        if (c === 0) missing.push(t);
        if (c > 1) duplicated.push(t);
    });
    return { text, ok: !invented && missing.length === 0 && duplicated.length === 0, missing, duplicated, invented };
}

module.exports = { extractPlaceholders, comparePlaceholders, mask, unmask };
