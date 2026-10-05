// Machine-translation pipeline. A provider is any object
//   { id: string, translate(items: [{key, text}], from, to) -> Promise<Map|object key -> text> }
// The pipeline owns everything risky around it: placeholder + glossary
// masking, verification (one retry, then the key is reported failed and NOT
// written), caching by content hash (so rebuilds are offline), batching, and
// the rule that machine output never overwrites a current reviewed string.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { mask, unmask } = require("./placeholders.js");
const { pendingKeys, setTranslation } = require("./catalog.js");

function memoryCache() {
    const m = new Map();
    return { get: k => m.get(k), set: (k, v) => { m.set(k, v); } };
}

/** Persistent cache: one tiny JSON file per entry under `dir`. */
function fileCache(dir) {
    const file = k => path.join(dir, `${k}.json`);
    return {
        get(k) { try { return JSON.parse(fs.readFileSync(file(k), "utf8")).text; } catch { return undefined; } },
        set(k, text) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(k), JSON.stringify({ text })); },
    };
}

const cacheKey = (providerId, from, to, masked) => crypto.createHash("sha1").update([providerId, from, to, masked].join("\u0001")).digest("hex");

/** Applies a glossary's forced renderings for `lang` after unmasking (do-not-translate terms are handled by masking). */
function applyTerms(text, terms = {}) {
    return Object.entries(terms).reduce((s, [from, to]) => s.split(from).join(to), text);
}

/**
 * Translates every missing/stale key for `lang`. Mutates `catalog`.
 * @returns {Promise<{translated: number, cached: number, failed: Array<{key: string, reason: string}>, providerCalls: number}>}
 */
async function translateMissing({ catalog, lang, provider, cache = memoryCache(), glossary = {}, batchSize = 20, onlyKeys = null }) {
    const from = catalog.sourceLang;
    const doNotTranslate = glossary.doNotTranslate ?? [];
    const terms = glossary.terms?.[lang] ?? {};
    const result = { translated: 0, cached: 0, failed: [], providerCalls: 0 };

    let keys = pendingKeys(catalog, lang);
    if (onlyKeys) { const only = new Set(onlyKeys); keys = keys.filter(k => only.has(k)); }

    const prepared = keys.map(key => {
        const { masked, tokens } = mask(catalog.entries[key].source, doNotTranslate);
        return { key, masked, tokens, ck: cacheKey(provider.id, from, lang, masked) };
    });

    const finish = (p, translatedMasked, wasCached) => {
        const u = unmask(translatedMasked, p.tokens);
        if (!u.ok) return false;
        setTranslation(catalog, p.key, lang, applyTerms(u.text, terms), "machine");
        if (wasCached) result.cached++; else { result.translated++; cache.set(p.ck, translatedMasked); }
        return true;
    };

    const todo = [];
    for (const p of prepared) {
        const hit = cache.get(p.ck);
        if (hit !== undefined && finish(p, hit, true)) continue;
        todo.push(p);
    }

    for (let i = 0; i < todo.length; i += batchSize) {
        let batch = todo.slice(i, i + batchSize);
        for (let attempt = 0; attempt < 2 && batch.length; attempt++) {
            result.providerCalls++;
            const raw = await provider.translate(batch.map(p => ({ key: p.key, text: p.masked })), from, lang);
            const got = raw instanceof Map ? raw : new Map(Object.entries(raw ?? {}));
            const retry = [];
            for (const p of batch) {
                const text = got.get(p.key);
                if (typeof text === "string" && finish(p, text, false)) continue;
                retry.push(p);
            }
            batch = retry;
        }
        for (const p of batch) result.failed.push({ key: p.key, reason: "provider output missing or placeholders not preserved after retry" });
    }
    return result;
}

module.exports = { translateMissing, memoryCache, fileCache, cacheKey };
