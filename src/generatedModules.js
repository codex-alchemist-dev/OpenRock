// content.generatedModules: [{ "name": "openchara-content", "from": "src/build/content.js" }]
// `from` is a build-time Node file exporting (ctx) => string (JS source). The source becomes the
// virtual script module @openrock/virtual/<name> (see virtualModules.js) - never a loose file.
// ctx = { manifest, mod, dir, templateVars, readJsonTable(dirRel) }
"use strict";

const fs = require("fs");
const path = require("path");

function walk(dir, base = dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, base, out); else out.push(path.relative(base, f).split(path.sep).join("/"));
    }
    return out.sort();
}

/** Every *.json under `dirAbs` keyed by its "id" field (or file basename); duplicate ids throw. */
function readJsonTable(dirAbs, label = path.basename(dirAbs)) {
    const table = {};
    if (!fs.existsSync(dirAbs)) return table;
    for (const rel of walk(dirAbs)) {
        if (!rel.endsWith(".json")) continue;
        const obj = JSON.parse(fs.readFileSync(path.join(dirAbs, rel), "utf8").replace(/^\uFEFF/, ""));
        const id = obj.id ?? path.basename(rel, ".json");
        if (table[id]) throw new Error(`${label}: duplicate id "${id}" (${rel})`);
        table[id] = { ...obj, id };
    }
    return table;
}

function validateGeneratedModules(list, where) {
    if (!Array.isArray(list)) throw new Error(`${where}: content.generatedModules must be an array of { name, from }`);
    const seen = new Set();
    for (const m of list) {
        if (!m || typeof m.name !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(m.name)) throw new Error(`${where}: content.generatedModules[].name must be letters/digits/"."/"_"/"-"`);
        if (typeof m.from !== "string") throw new Error(`${where}: content.generatedModules "${m.name}" needs a "from" path`);
        if (seen.has(m.name)) throw new Error(`${where}: duplicate generated module name "${m.name}"`);
        seen.add(m.name);
    }
}

/** @returns {Map<string, string>} name -> JS source */
function renderGeneratedModules(manifest, entryDir, { mod, templateVars }) {
    const out = new Map();
    for (const { name, from } of manifest.content?.generatedModules ?? []) {
        const abs = path.resolve(entryDir, from);
        if (!fs.existsSync(abs)) throw new Error(`"${manifest.name}": generated module "${name}": "${from}" doesn't exist`);
        let fn;
        try { fn = require(abs); } catch (e) { throw new Error(`"${manifest.name}": generated module "${name}": "${from}" failed to load: ${e.message}`); }
        if (typeof fn !== "function") throw new Error(`"${manifest.name}": generated module "${name}": "${from}" must export (ctx) => string`);
        const src = fn({ manifest, mod, dir: entryDir, templateVars, readJsonTable });
        if (typeof src !== "string") throw new Error(`"${manifest.name}": generated module "${name}" must return a string of JS source`);
        out.set(name, src);
    }
    return out;
}

module.exports = { renderGeneratedModules, validateGeneratedModules, readJsonTable };
