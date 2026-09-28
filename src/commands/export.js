// `openrock export` - build + write <modDir>/dist/<name> <version>.mcaddon
"use strict";

const fs = require("fs");
const path = require("path");
const { buildMod } = require("../buildPipeline.js");
const { zip } = require("../zip.js");
const { stamp, buildOpts } = require("./shared.js");

function cmdExport(modDir, openrockRoot) {
    const r = buildMod(modDir, buildOpts(modDir, openrockRoot));
    const entries = [];
    const packs = r.bp ? [[r.manifest.packs.behavior.folder, r.bp], [r.manifest.packs.resource.folder, r.rp]] : [[r.manifest.packs.resource.folder, r.rp]];
    for (const [folder, map] of packs) {
        for (const [rel, data] of map) entries.push({ name: `${folder}/${rel}`, data });
    }
    const dist = path.join(modDir, "dist");
    fs.mkdirSync(dist, { recursive: true });
    const file = path.join(dist, `${r.manifest.name} ${r.manifest.version}.mcaddon`);
    fs.writeFileSync(file, zip(entries));
    console.log(`[${stamp()}] Exported ${file} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
}

module.exports = cmdExport;
