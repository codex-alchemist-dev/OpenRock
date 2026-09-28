// `openrock build` - OR-Track G: a resource-pack-only mod (packs.behavior
// === false) has r.bp === null; only touch the behavior pack half when
// it's genuinely there.
"use strict";

const path = require("path");
const { buildMod, writeTree } = require("../buildPipeline.js");
const { stamp, buildOpts, maybeRunSmokeTest } = require("./shared.js");

async function cmdBuild(modDir, flags = [], openrockRoot) {
    const t0 = Date.now();
    const r = buildMod(modDir, buildOpts(modDir, openrockRoot));
    const out = path.join(modDir, "build");
    const a = r.bp ? writeTree(r.bp, path.join(out, r.manifest.packs.behavior.folder)) : { written: 0, removed: 0 };
    const b = writeTree(r.rp, path.join(out, r.manifest.packs.resource.folder));
    console.log(`[${stamp()}] Built ${r.manifest.name} in ${Date.now() - t0}ms -> ${out} (${a.written + b.written} written, ${a.removed + b.removed} removed)`);
    await maybeRunSmokeTest(r, flags);
    return r;
}

module.exports = cmdBuild;
