// "Virtual script modules": generated JS that a build-time compiler (e.g. a
// DSL like Crystal Cinema) wants imported by in-world scripts, WITHOUT
// shipping as a loose file. A compiler emits a bp entry at
// `.openrock-virtual/<name>.js`; renderScripts() writes those to a
// content-addressed cache dir and aliases `@openrock/virtual/<name>` to them
// for esbuild (whose sync API can't use resolve plugins), and every consumer
// of the finished pack sees the tree with those entries stripped.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VIRTUAL_PREFIX = ".openrock-virtual/";
const SPECIFIER_PREFIX = "@openrock/virtual/";

function isVirtualKey(key) { return key.startsWith(VIRTUAL_PREFIX); }

/** bp/rp Map (relPath -> Buffer|string) -> Map<name, source text> of its virtual modules. */
function extractVirtualModules(map) {
    const out = new Map();
    if (!map) return out;
    for (const [key, value] of map) {
        if (!isVirtualKey(key)) continue;
        const name = key.slice(VIRTUAL_PREFIX.length).replace(/\.js$/, "");
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`virtual module name "${name}" is invalid (letters, digits, ".", "_", "-" only)`);
        out.set(name, Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
    }
    return out;
}

/** Writes each module to a content-addressed temp dir; returns [[specifier, absPath], ...] for esbuild alias. */
function materializeVirtualModules(modules) {
    const entries = [];
    for (const [name, source] of modules) {
        const hash = crypto.createHash("sha1").update(source).digest("hex").slice(0, 12);
        const dir = path.join(os.tmpdir(), "openrock-virtual", hash);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${name}.js`);
        if (!fs.existsSync(file)) fs.writeFileSync(file, source);
        entries.push([SPECIFIER_PREFIX + name, file]);
    }
    return entries;
}

/** A copy of `map` without virtual entries - what actually ships. Returns null for null. */
function stripVirtual(map) {
    if (!map) return map;
    const out = new Map();
    for (const [key, value] of map) if (!isVirtualKey(key)) out.set(key, value);
    return out;
}

module.exports = { VIRTUAL_PREFIX, SPECIFIER_PREFIX, isVirtualKey, extractVirtualModules, materializeVirtualModules, stripVirtual };
