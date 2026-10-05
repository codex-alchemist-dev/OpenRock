// content.scriptMounts: [{ "from": "../MinUI/runtime", "at": "openchara/ui" }]
// Some script trees are written to live side by side (relative imports like "../ids.js") but are owned by
// different repos. A package that declares mounts gets a STAGED scripts root: its scriptsDir copied to a temp dir
// with each mount's directory overlaid at `at`, and esbuild bundles from there. Only imported files reach the bundle.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function validateScriptMounts(list, where) {
    if (!Array.isArray(list)) throw new Error(`${where}: content.scriptMounts must be an array of { from, at }`);
    for (const m of list) {
        if (!m || typeof m.from !== "string" || typeof m.at !== "string") throw new Error(`${where}: content.scriptMounts[] needs string "from" and "at"`);
        if (path.isAbsolute(m.at) || m.at.split(/[\/]/).includes("..")) throw new Error(`${where}: content.scriptMounts "at" must be a relative path inside the scripts root`);
    }
}

const SKIP = /(^|[\/])(node_modules|\.git)([\/]|$)|\.test\.[cm]?js$|^package(-lock)?\.json$/;

/** @returns {string} absolute staged scripts root (contains scriptsDir contents + mounts). */
function stageScripts(manifest, entryDir) {
    const content = manifest.content;
    const stage = path.join(os.tmpdir(), "openrock-stage", crypto.createHash("sha1").update(`${manifest.name}|${entryDir}`).digest("hex").slice(0, 12));
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    fs.cpSync(path.resolve(entryDir, content.scriptsDir), stage, { recursive: true });
    for (const { from, at } of content.scriptMounts) {
        const src = path.resolve(entryDir, from);
        if (!fs.existsSync(src)) throw new Error(`"${manifest.name}": content.scriptMounts "${from}" doesn't exist`);
        fs.cpSync(src, path.join(stage, at), { recursive: true, filter: f => !SKIP.test(path.relative(src, f)) });
    }
    return stage;
}

module.exports = { validateScriptMounts, stageScripts };
