// `openrock check` - OR-Track H1: a --json mode, for piping into other
// tools rather than scraping human-readable text (the command most likely
// to be scripted, e.g. as a pre-commit/CI gate).
"use strict";

const { buildMod } = require("../buildPipeline.js");
const { buildOpts, maybeRunSmokeTest } = require("./shared.js");

async function cmdCheck(modDir, flags = [], openrockRoot) {
    const t0 = Date.now();
    const r = buildMod(modDir, buildOpts(modDir, openrockRoot));
    const ms = Date.now() - t0;
    await maybeRunSmokeTest(r, flags, flags.includes("--json"));
    if (flags.includes("--json")) {
        console.log(JSON.stringify({ ok: true, name: r.manifest.name, bpFiles: r.bp ? r.bp.size : null, rpFiles: r.rp.size, ms }));
    } else {
        const bpNote = r.bp ? `${r.bp.size} BP + ` : "(resource-pack-only) ";
        console.log(`OK - ${r.manifest.name}: ${bpNote}${r.rp.size} RP files, all checks passed (${ms}ms).`);
    }
    return r;
}

module.exports = cmdCheck;
