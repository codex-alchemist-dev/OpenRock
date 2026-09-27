// Generic filesystem-tree helpers - walking a directory into a sorted
// relative-path list, and writing a built {relPath -> Buffer} map to disk
// as a diff (only changed files written, files no longer produced
// removed). Ported near-verbatim from OpenChara's tools/lib/build.js,
// which already had zero character/content-specific logic in this part -
// see "OpenRock Ecosystem Expansion Roadmap", OR-Track F0, in the project
// plan document.
"use strict";

const fs = require("fs");
const path = require("path");

/** Every file under `dir`, as `/`-joined paths relative to `base` (defaults to `dir`), sorted. */
function walk(dir, base = dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base, out);
        else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
    return out.sort();
}

/**
 * Writes a built tree to `outDir` as a mirror: only changed files are
 * written, files no longer produced are removed, empty directories left
 * behind by removal are pruned. Deterministic builds (same inputs -> the
 * same map) make this diff meaningful - a dev-mode watcher can tell real
 * changes from rebuild noise this way.
 * @param {Map<string, Buffer>} map
 * @returns {{written: number, removed: number}}
 */
function writeTree(map, outDir) {
    let written = 0, removed = 0;
    for (const [rel, buf] of map) {
        const dest = path.join(outDir, rel);
        if (fs.existsSync(dest)) {
            const cur = fs.readFileSync(dest);
            if (cur.equals(buf)) continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        written++;
    }
    const want = new Set([...map.keys()]);
    for (const rel of walk(outDir)) {
        if (!want.has(rel)) { fs.rmSync(path.join(outDir, rel)); removed++; }
    }
    pruneEmptyDirs(outDir);
    return { written, removed };
}

function pruneEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const full = path.join(dir, entry.name);
            pruneEmptyDirs(full);
            if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        }
    }
}

// Registry-style files several packages can each add entries to, merged
// instead of one replacing another (a library's item_texture.json entry
// and a mod's must both survive).
const MERGED_FILES = new Set([
    "textures/item_texture.json", "textures/terrain_texture.json", "textures/flipbook_textures.json",
    "ui/_ui_defs.json", "ui/_global_variables.json", "sounds/sound_definitions.json", "sounds.json",
]);

/** Objects merge key by key (the later value wins on a scalar clash); arrays are a union keeping first-seen order. */
function mergeRegistry(base, add) {
    if (Array.isArray(base) && Array.isArray(add)) {
        const out = [...base];
        for (const v of add) if (!out.some(x => JSON.stringify(x) === JSON.stringify(v))) out.push(v);
        return out;
    }
    if (base && add && typeof base === "object" && typeof add === "object" && !Array.isArray(base) && !Array.isArray(add)) {
        const out = { ...base };
        for (const [k, v] of Object.entries(add)) out[k] = k in base ? mergeRegistry(base[k], v) : v;
        return out;
    }
    return add;
}

module.exports = { walk, writeTree, MERGED_FILES, mergeRegistry };
