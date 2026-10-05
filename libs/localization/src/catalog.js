// The string catalog: translation STATE for every key. The source language's
// text is authored in `<sourceLang>.lang` (human-edited); the catalog stores
// per-language translations plus which source-text hash each was made from,
// so "stale" is DERIVED (translation.from !== entry.sourceHash), never stored.
//
// catalog = { version: 1, sourceLang, entries: {
//   [key]: { source, sourceHash, context, refs: string[], orphaned: bool,
//            translations: { [lang]: { text, status: "machine"|"reviewed", from: sourceHash } } } } }
"use strict";

const crypto = require("crypto");

const hashText = text => crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);

function createCatalog(sourceLang = "en_US") {
    return { version: 1, sourceLang, entries: {} };
}

/**
 * Brings the catalog in line with the current source texts.
 * @param {Map<string,string>} sourceTexts key -> source-language text
 * @param {{refs?: Map<string,string[]>, usedKeys?: Iterable<string>, contexts?: Map<string,string>}} [info]
 * @returns {{added: string[], changed: string[], orphaned: string[], revived: string[], undefinedKeys: string[]}}
 */
function reconcile(catalog, sourceTexts, { refs = new Map(), usedKeys = null, contexts = new Map() } = {}) {
    const added = [], changed = [], orphaned = [], revived = [];
    for (const [key, text] of sourceTexts) {
        const h = hashText(text);
        let e = catalog.entries[key];
        if (!e) {
            e = catalog.entries[key] = { source: text, sourceHash: h, context: contexts.get(key) ?? "", refs: [], orphaned: false, translations: {} };
            added.push(key);
        } else {
            if (e.sourceHash !== h) { e.source = text; e.sourceHash = h; changed.push(key); }
            if (e.orphaned) { e.orphaned = false; revived.push(key); }
            if (contexts.has(key)) e.context = contexts.get(key);
        }
        e.refs = refs.get(key) ?? e.refs;
    }
    for (const [key, e] of Object.entries(catalog.entries)) {
        if (!sourceTexts.has(key) && !e.orphaned) { e.orphaned = true; orphaned.push(key); }
    }
    const undefinedKeys = usedKeys ? [...new Set(usedKeys)].filter(k => !sourceTexts.has(k)).sort() : [];
    return { added, changed, orphaned, revived, undefinedKeys };
}

/** "missing" | "stale" | "machine" | "reviewed" for one entry in one language. */
function statusOf(entry, lang) {
    const t = entry.translations[lang];
    if (!t) return "missing";
    if (t.from !== entry.sourceHash) return "stale";
    return t.status;
}

/** Keys needing (re)translation in `lang`: missing or stale, never reviewed-and-current, never orphaned. */
function pendingKeys(catalog, lang) {
    return Object.entries(catalog.entries)
        .filter(([, e]) => !e.orphaned && ["missing", "stale"].includes(statusOf(e, lang)))
        .map(([k]) => k);
}

/**
 * Records a translation. A "machine" write never replaces a CURRENT reviewed
 * one; a "reviewed" write always wins. Returns whether it was applied.
 */
function setTranslation(catalog, key, lang, text, status = "machine") {
    const e = catalog.entries[key];
    if (!e) throw new Error(`setTranslation: unknown key "${key}"`);
    if (status !== "machine" && status !== "reviewed") throw new Error(`setTranslation: status must be "machine" or "reviewed"`);
    if (status === "machine" && statusOf(e, lang) === "reviewed") return false;
    e.translations[lang] = { text, status, from: e.sourceHash };
    return true;
}

/** Per-language counts, for `openrock translate status`. */
function summarize(catalog, langs) {
    const live = Object.values(catalog.entries).filter(e => !e.orphaned);
    const out = {};
    for (const lang of langs) {
        const c = { missing: 0, stale: 0, machine: 0, reviewed: 0 };
        for (const e of live) c[statusOf(e, lang)]++;
        out[lang] = { ...c, total: live.length };
    }
    return out;
}

module.exports = { hashText, createCatalog, reconcile, statusOf, pendingKeys, setTranslation, summarize };
