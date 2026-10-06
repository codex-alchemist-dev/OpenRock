// `openrock fmbe <check|preview|commands> [modDir]`
//   check     compile every .fmbe scene and list what is in them
//   preview   show each display's resolved spec and how many commands it costs
//   commands  print the exact playanimation commands for every display (paste into a command block to try them)
"use strict";

const path = require("path");
const { loadManifestFile } = require("../manifest.js");
const { compileFmbeDsl } = require("../fmbeDsl/fmbeCompiler.js");
const lib = name => require(path.join(__dirname, "..", "..", "libs", "fmbe", "scripts", "fmbe", name));

function loadScenes(modDir) {
    const { manifest, dir } = loadManifestFile(modDir);
    const rel = manifest.content?.fmbeDsl;
    if (!rel) throw new Error(`"${manifest.name}" doesn't declare content.fmbeDsl`);
    const { bp } = compileFmbeDsl(path.resolve(dir, rel));
    const scenes = [];
    for (const [key, value] of Object.entries(bp ?? {})) {
        if (key.startsWith("fmbe/") && key.endsWith(".json")) scenes.push(typeof value === "string" ? JSON.parse(value) : Buffer.isBuffer(value) ? JSON.parse(value.toString("utf8")) : value);
    }
    return scenes;
}

async function cmdFmbe(sub, modDir, flags = []) {
    const subs = ["check", "preview", "commands"];
    if (!subs.includes(sub)) throw new Error(`Usage: openrock fmbe <${subs.join("|")}> [modDir]`);
    const scenes = loadScenes(modDir);
    const json = flags.includes("--json");
    const { normalizeSpec } = lib("spec.cjs");
    const { commandsFor } = lib("commands.cjs");

    if (sub === "check") {
        const report = { ok: true, scenes: scenes.map(s => ({ id: s.id, ...s.stats, persist: s.persist })) };
        if (json) console.log(JSON.stringify(report));
        else for (const s of report.scenes) console.log(`${s.id}: ${s.displays} displays, ${s.groups} groups, ${s.anims} animations${s.persist ? " (persistent)" : ""}`);
        return;
    }
    for (const scene of scenes) {
        console.log(`\n# ${scene.id}`);
        for (const node of scene.nodes) {
            const indent = "  ".repeat(1 + depth(scene, node));
            if (node.kind === "group") { console.log(`${indent}group ${node.name} at (${node.local.pos}) rot (${node.local.rot}) scale ${node.local.scale}`); continue; }
            const spec = normalizeSpec({ ...node.spec, ...node.local }, node.name);
            const { render, vars } = commandsFor(spec);
            console.log(`${indent}display ${node.name}: ${spec.kind} "${spec.item}" ${spec.system}, ${render.length + (vars ? 1 : 0)} commands`);
            if (sub === "commands") for (const c of [...render, vars].filter(Boolean)) console.log(`${indent}  ${c}`);
        }
        for (const a of scene.anims) console.log(`  anim ${a.name} on ${a.target}: ${Object.keys(a.patch).join(", ")} over ${(a.ticks / 20).toFixed(2)}s ease ${a.ease} loop ${a.loop}${a.auto ? " auto" : ""}`);
    }
}

function depth(scene, node) {
    let d = 0;
    for (let p = node.parent; p; d++) p = scene.nodes.find(n => n.kind === "group" && n.name === p)?.parent ?? null;
    return d;
}

module.exports = { cmdFmbe };
