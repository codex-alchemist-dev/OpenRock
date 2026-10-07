// `openrock refs [modDir] [--json] [--kind=<kind>]`
// Builds the pack and prints every thing the project defines, by kind, with where each is referenced from (Crystal Refs,
// `@ns:name`). A "find usages" for the whole pack - and a quick way to see what is defined but never referenced.
"use strict";

const path = require("path");
const { buildMod } = require("../buildPipeline.js");
const { buildOpts } = require("./shared.js");

function cmdRefs(modDir, flags, openrockRoot) {
    const built = buildMod(modDir, buildOpts(modDir, openrockRoot));
    const { refs, known } = built.crystal;
    const kindFlag = (flags.find(f => f.startsWith("--kind=")) ?? "").slice(7) || null;
    const report = {};
    for (const [kind, ids] of known) {
        if (kind === "any" || kind === "blockOrItem" || (kindFlag && kind !== kindFlag)) continue;
        for (const id of ids) {
            const used = refs.filter(r => r.id === id && (r.kind === kind || r.kind === "any" || (r.kind === "blockOrItem" && (kind === "block" || kind === "item"))));
            (report[kind] ??= []).push({ id, usedBy: used.map(r => `${r.file ?? "?"}${r.line > 1 || !String(r.file).includes(" $") ? `:${r.line}:${r.col}` : ""}`) });
        }
    }
    if (flags.includes("--json")) { console.log(JSON.stringify({ ok: true, defined: report })); return; }
    const kinds = Object.keys(report).sort();
    if (!kinds.length) { console.log("No Crystal-referenceable definitions found."); return; }
    for (const kind of kinds) {
        console.log(`\n${kind} (${report[kind].length})`);
        for (const { id, usedBy } of report[kind].sort((a, b) => a.id.localeCompare(b.id))) {
            console.log(`  @${id}${usedBy.length ? `   <- ${usedBy.join(", ")}` : ""}`);
        }
    }
}

module.exports = { cmdRefs };
