// `openrock deploy` - build + sync into Minecraft's development pack
// folders. Also reused directly by dev.js's watch loop for the ONE-SHOT
// (non-incremental) deploy paths it needs.
"use strict";

const path = require("path");
const { buildMod, writeTree } = require("../buildPipeline.js");
const { stamp, comMojang, buildOpts } = require("./shared.js");

/** Writes an already-built {bp, rp, manifest} result into com.mojang's real development pack folders. */
function deployBuiltResult(r) {
    const root = comMojang();
    const a = r.bp ? writeTree(r.bp, path.join(root, "development_behavior_packs", r.manifest.packs.behavior.folder)) : { written: 0, removed: 0 };
    const b = writeTree(r.rp, path.join(root, "development_resource_packs", r.manifest.packs.resource.folder));
    return { written: a.written + b.written, removed: a.removed + b.removed };
}

function cmdDeploy(modDir, quiet = false, openrockRoot) {
    const r = buildMod(modDir, buildOpts(modDir, openrockRoot));
    const { written, removed } = deployBuiltResult(r);
    if (!quiet || written + removed) console.log(`[${stamp()}] Deployed ${r.manifest.name}: ${written} file(s) updated, ${removed} removed.`);
    return { r, changed: written + removed };
}

module.exports = cmdDeploy;
module.exports.deployBuiltResult = deployBuiltResult;
