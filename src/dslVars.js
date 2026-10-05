// Template variables for a package's content. Sources, later wins:
//   root mod `templateVars` (strings)  <  `ns`  <  the package's `content.dslVarsProvider` output (any JSON values).
// Strings fill {{name}} in files/paths; Crystal DSL sources can also read the full set (numbers, arrays, objects)
// through `vars()` exported by @openrock/<dialect>-dsl.
"use strict";

const fs = require("fs");
const path = require("path");
const { readJsonTable, walk } = require("./generatedModules.js");

function computeVars(entryManifest, entryDir, rootManifest) {
    const vars = { ...(rootManifest?.templateVars ?? {}), ns: entryManifest.namespace ?? rootManifest?.namespace ?? "" };
    const rel = entryManifest.content?.dslVarsProvider;
    if (rel) {
        const abs = path.resolve(entryDir, rel);
        if (!fs.existsSync(abs)) throw new Error(`"${entryManifest.name}": content.dslVarsProvider "${rel}" doesn't exist`);
        const provider = require(abs);
        if (typeof provider !== "function") throw new Error(`"${entryManifest.name}": content.dslVarsProvider "${rel}" must export (ctx) => object`);
        const extra = provider({ manifest: entryManifest, mod: rootManifest, dir: entryDir, templateVars: vars, readJsonTable, walk });
        if (!extra || typeof extra !== "object") throw new Error(`"${entryManifest.name}": dslVarsProvider must return an object`);
        Object.assign(vars, extra);
    }
    return vars;
}

/** {{name}} -> String(value). Unknown names stay as written. */
function fill(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Deep-fills a JSON document. A string that is EXACTLY "{{name}}" with a non-string var becomes that value (number/array/object). */
function fillDoc(doc, vars) {
    if (typeof doc === "string") {
        const m = /^\{\{(\w+)\}\}$/.exec(doc);
        return m && m[1] in vars && typeof vars[m[1]] !== "string" ? vars[m[1]] : fill(doc, vars);
    }
    if (Array.isArray(doc)) return doc.map(v => fillDoc(v, vars));
    if (doc && typeof doc === "object" && !Buffer.isBuffer(doc)) return Object.fromEntries(Object.entries(doc).map(([k, v]) => [fill(k, vars), fillDoc(v, vars)]));
    return doc;
}

module.exports = { computeVars, fill, fillDoc };
