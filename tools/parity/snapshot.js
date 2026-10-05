#!/usr/bin/env node
// Parity gate for the OpenChara/Claude Waifus -> OpenRock migration.
//   node tools/parity/snapshot.js legacy <projectDir> <out.json>   hash the legacy openchara.js build()
//   node tools/parity/snapshot.js diff <a.json> <b.json>           report added/removed/changed files
// A snapshot is { "BP/<path>": sha1, "RP/<path>": sha1 }. JSON files are hashed canonically
// (parsed + re-stringified with sorted keys) so formatting-only differences don't count.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha = b => crypto.createHash("sha1").update(b).digest("hex");
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;

function hashFile(rel, data) {
    if (rel.endsWith(".json")) {
        try { return sha(JSON.stringify(canon(JSON.parse(Buffer.from(data).toString("utf8").replace(/^\uFEFF/, ""))))); } catch (e) { /* fall through: JSONC */ }
    }
    return sha(Buffer.from(data));
}

function snapshotMaps(bp, rp) {
    const out = {};
    for (const [tag, map] of [["BP", bp], ["RP", rp]]) for (const [rel, data] of map) out[`${tag}/${rel}`] = hashFile(rel, data);
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function snapshotDir(dir) {
    const bp = new Map(), rp = new Map();
    const walk = (root, map, base = root) => { for (const e of fs.readdirSync(root, { withFileTypes: true })) { const f = path.join(root, e.name); if (e.isDirectory()) walk(f, map, base); else map.set(path.relative(base, f).split(path.sep).join("/"), fs.readFileSync(f)); } };
    const [b, r] = fs.readdirSync(dir).sort();
    walk(path.join(dir, b), bp); walk(path.join(dir, r), rp);
    return snapshotMaps(bp, rp);
}

function diff(a, b) {
    const added = Object.keys(b).filter(k => !(k in a)), removed = Object.keys(a).filter(k => !(k in b));
    const changed = Object.keys(a).filter(k => k in b && a[k] !== b[k]);
    return { added, removed, changed, same: !added.length && !removed.length && !changed.length };
}

if (require.main === module) {
    const [cmd, x, y] = process.argv.slice(2);
    if (cmd === "legacy") {
        const { build } = require(path.resolve(x, "..", "OpenChara", "tools", "lib", "build.js"));
        const r = build(path.resolve(x));
        fs.writeFileSync(y, JSON.stringify(snapshotMaps(r.bp, r.rp), null, 1));
        console.log(`legacy snapshot: ${r.bp.size} BP + ${r.rp.size} RP files -> ${y}`);
    } else if (cmd === "dir") {
        fs.writeFileSync(y, JSON.stringify(snapshotDir(path.resolve(x)), null, 1));
        console.log(`dir snapshot -> ${y}`);
    } else if (cmd === "diff") {
        const d = diff(JSON.parse(fs.readFileSync(x, "utf8")), JSON.parse(fs.readFileSync(y, "utf8")));
        console.log(d.same ? "PARITY: identical" : `DIFF: +${d.added.length} -${d.removed.length} ~${d.changed.length}`);
        for (const k of ["added", "removed", "changed"]) for (const f of d[k].slice(0, 40)) console.log(`  ${k}: ${f}`);
        process.exitCode = d.same ? 0 : 1;
    } else { console.log("Usage: snapshot.js <legacy <projectDir> <out>|dir <buildDir> <out>|diff <a> <b>>"); }
}

module.exports = { snapshotMaps, snapshotDir, diff };
