// Crystal Refs: the one thing only Crystal has. A reference is written `@namespace:name` - or `@:name` for "this project's
// own namespace" - and names a THING in the game: an entity, item, block, particle, sound, animation, cutscene or FMBE scene.
// Unlike a string, a reference is checked when the pack is built, across every Crystal language at once:
//
//   cutscene "intro" { cast mira = entity @:mira ... }        // cinema -> an entity written in the entity DSL
//   display scene altar @:shrine at (~4, ~, ~)                // cinema -> a scene written in the FMBE DSL
//
// A typo (`@:mria`) fails the build with file:line:col and a "did you mean". Each compiler reports the references it read
// (`refs`) and the things it defines (`defs`); the build adds every definition it can see in the finished pack (entity, item,
// block, particle, sound and animation JSON), then this linker resolves them. Only references into the project's OWN
// namespaces are checked (`@minecraft:zombie` and other packs' ids pass through): their definitions are not ours to see.
"use strict";

const { CrystalSyntaxError } = require("./errors.js");

/** Kinds a reference slot can ask for. "blockOrItem" accepts either (an FMBE display shows both). */
const KINDS = ["entity", "item", "block", "blockOrItem", "particle", "sound", "animation", "cutscene", "scene"];
/** Kinds whose runtime value is the bare name (cutscene and scene ids are not namespaced at runtime). */
const BARE_VALUE = new Set(["cutscene", "scene"]);

/**
 * A REF token's value -> what the slot receives, plus the identity to link.
 * @returns {{ns: string, id: string, value: string}} id = what is linked ("ns:name", or "animation.ns.name"), value = what the compiled output carries
 */
function resolveRef(ref, kind, projectNs) {
    const ns = ref.ns || projectNs;
    if (!ns) throw new Error("`@:name` needs a project namespace (the mod's \"namespace\")");
    // Bedrock names animations animation.<namespace>.<name>; everything else is <namespace>:<name>
    const id = kind === "animation" ? `animation.${ns}.${ref.name}` : `${ns}:${ref.name}`;
    return { ns, id, value: BARE_VALUE.has(kind) ? ref.name : id };
}

const jsonOf = value => {
    try { return JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : JSON.stringify(value)); } catch (e) { return null; }
};

/** Everything defined by the finished pack's own JSON. @returns {Map<string, Set<string>>} kind -> ids */
function packDefs({ bp, rp }) {
    const defs = new Map(KINDS.map(k => [k, new Set()]));
    const add = (kind, id) => { if (typeof id === "string") defs.get(kind).add(id); };
    for (const [file, value] of bp ?? []) {
        const doc = /\.json$/.test(file) ? jsonOf(value) : null;
        if (!doc) continue;
        if (/^entities\//.test(file)) add("entity", doc["minecraft:entity"]?.description?.identifier);
        else if (/^items\//.test(file)) add("item", doc["minecraft:item"]?.description?.identifier);
        else if (/^blocks\//.test(file)) add("block", doc["minecraft:block"]?.description?.identifier);
    }
    for (const [file, value] of rp ?? []) {
        const doc = /\.json$/.test(file) ? jsonOf(value) : null;
        if (!doc) continue;
        if (/^particles\//.test(file)) add("particle", doc.particle_effect?.description?.identifier);
        else if (/^animations\//.test(file)) for (const id of Object.keys(doc.animations ?? {})) add("animation", id);
        else if (file === "sounds/sound_definitions.json") for (const id of Object.keys(doc.sound_definitions ?? doc)) add("sound", id);
    }
    return defs;
}

const editDistance = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
};
const suggest = (id, candidates) => {
    let best = null, bestD = Infinity;
    for (const c of candidates) { const dist = editDistance(id, c); if (dist < bestD) { best = c; bestD = dist; } }
    return best && bestD <= Math.max(2, Math.floor(id.length / 3)) ? best : null;
};

class CrystalLinkError extends Error {
    constructor(problems) {
        super(`${problems.length} unresolved Crystal reference${problems.length === 1 ? "" : "s"}:\n${problems.join("\n")}`);
        this.name = "CrystalLinkError";
        this.problems = problems;
    }
}

/**
 * @param {object} p
 * @param {Array<{kind: string, id: string, file?: string, line?: number, col?: number, source?: string}>} p.refs
 * @param {Array<{kind: string, id: string}>} p.defs definitions the compilers reported (cutscenes, scenes, ...)
 * @param {{bp?: Map, rp?: Map}} p.pack the finished pack, scanned for entity/item/block/particle/sound/animation definitions
 * @param {Iterable<string>} p.namespaces the project's own namespaces; references elsewhere are not checked
 * @throws {CrystalLinkError}
 */
function linkRefs({ refs, defs = [], pack = {}, namespaces }) {
    const known = packDefs(pack);
    for (const d of defs) known.get(d.kind)?.add(d.id);
    const own = new Set(namespaces);
    const problems = [];
    for (const ref of refs) {
        if (!own.has(ref.ns)) continue;
        const kinds = ref.kind === "blockOrItem" ? ["block", "item"] : [ref.kind];
        if (kinds.some(k => known.get(k)?.has(ref.id))) continue;
        const pool = kinds.flatMap(k => [...(known.get(k) ?? [])]);
        const hint = suggest(ref.id, pool);
        const where = ref.file ? `${ref.file}:${ref.line ?? 1}:${ref.col ?? 1}: ` : "";
        const frame = ref.source ? `\n${new CrystalSyntaxError("", ref.source, ref.line, ref.col, null).frame}` : "";
        problems.push(`${where}unknown ${ref.kind === "blockOrItem" ? "block or item" : ref.kind} @${ref.ns}:${ref.id.replace(/^animation\.[^.]+\./, "").replace(/^[^:]+:/, "")}${hint ? ` - did you mean @${ref.ns}:${hint.replace(/^animation\.[^.]+\./, "").replace(/^[^:]+:/, "")}?` : ""}${frame}`);
    }
    if (problems.length) throw new CrystalLinkError(problems);
    return { checked: refs.filter(r => own.has(r.ns)).length };
}

module.exports = { KINDS, resolveRef, packDefs, linkRefs, CrystalLinkError, suggest };
