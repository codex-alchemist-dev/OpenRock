// `openrock info` - reports a package's script status (and its whole
// dependency tree's), so users and a future GUI can see at a glance whether
// anything ships runtime scripts, runs Node at build time, or lists
// "external" scripts. Read-only: never builds or writes anything.
"use strict";

const { loadManifestFile } = require("../manifest.js");
const { collectEntries } = require("../buildPipeline.js");
const { describeScriptsTree, checkExternalScriptFiles } = require("../scriptsDecl.js");
const { buildOpts } = require("./shared.js");

function cmdInfo(modDir, flags = [], openrockRoot) {
    const { manifest, dir } = loadManifestFile(modDir);
    const entries = collectEntries(manifest, dir, buildOpts(modDir, openrockRoot));
    const tree = describeScriptsTree(entries);
    const missing = [...entries.values()].flatMap(({ manifest: m, dir: d }) =>
        checkExternalScriptFiles(m, d).map(x => ({ ...x, package: m.name })));
    const report = { ok: missing.length === 0, name: manifest.name, kind: manifest.kind, version: manifest.version, scripts: tree, missingExternalScripts: missing };
    if (flags.includes("--json")) {
        console.log(JSON.stringify(report));
    } else {
        console.log(`${manifest.name}@${manifest.version} (${manifest.kind})`);
        for (const p of tree.packages) {
            const parts = [p.runtime ? "runtime scripts" : null, p.buildTime ? "build-time scripts" : null].filter(Boolean);
            console.log(`  ${p.package}: ${parts.length ? parts.join(", ") : "no scripts"}${p.declared ? "" : " (inferred)"}`);
        }
        if (tree.external.length) {
            console.log("External scripts:");
            for (const e of tree.external) console.log(`  [${e.runs}] ${e.package}: ${e.name} (${e.path})${e.why ? " - " + e.why : ""}`);
        }
        for (const m of missing) console.log(`MISSING external script: ${m.package}: ${m.name} (${m.path})`);
    }
    if (!report.ok) process.exitCode = 1;
    return report;
}

module.exports = cmdInfo;
