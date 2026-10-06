"use strict";

// A display spec is the whole description of one FMBE: what it shows and how it is placed. Positions are in BLOCKS
// (the wiki's 1/16-block variables are an internal detail) and angles in DEGREES. normalizeSpec() validates and
// fills defaults; it never touches the game, so it runs at build time (the DSL compiler) and in-world alike.

const KINDS = Object.freeze({ block: "advanced3d", block2d: "advanced2d", item: "advancedItem" });
const SYSTEM_NAMES = Object.freeze(["advanced", "basic", "static"]);
const V3 = ["pos", "basepos", "rot"];
const ALLOWED = new Set(["item", "kind", "system", "pos", "basepos", "rot", "scale", "scaleXZ", "scaleY", "extend", "id", "tags", "name", "vars"]);

class FmbeSpecError extends Error {
    constructor(message, path) { super(path ? `${path}: ${message}` : message); this.name = "FmbeSpecError"; this.path = path ?? ""; }
}

const isChannel = v => typeof v === "number" ? Number.isFinite(v) : (typeof v === "string" && v.length > 0) || (v && typeof v === "object" && typeof v.t === "string");

function vec3(value, path, fallback) {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || value.length !== 3 || !value.every(isChannel)) throw new FmbeSpecError("must be [x, y, z] (numbers, or Molang strings for client-side expressions)", path);
    return value.slice();
}

/**
 * @param {object} input
 * @param {string} [where] label used in error messages
 * @returns {object} a frozen, fully defaulted spec
 */
function normalizeSpec(input, where = "display") {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new FmbeSpecError("a display spec must be an object", where);
    for (const k of Object.keys(input)) if (!ALLOWED.has(k)) throw new FmbeSpecError(`unknown field "${k}" (known: ${[...ALLOWED].join(", ")})`, where);
    if (typeof input.item !== "string" || !input.item) throw new FmbeSpecError(`"item" (a block or item id) is required`, where);
    const kind = input.kind ?? "block";
    if (!KINDS[kind]) throw new FmbeSpecError(`kind must be one of ${Object.keys(KINDS).join(", ")} (got "${kind}")`, where);
    const system = input.system ?? "advanced";
    if (!SYSTEM_NAMES.includes(system)) throw new FmbeSpecError(`system must be one of ${SYSTEM_NAMES.join(", ")} (got "${system}")`, where);

    const out = { item: input.item, kind, system };
    for (const k of V3) out[k] = vec3(input[k], `${where}.${k}`, [0, 0, 0]);
    if (input.scale !== undefined && !isChannel(input.scale)) throw new FmbeSpecError("scale must be a number or Molang string", `${where}.scale`);
    out.scale = input.scale ?? 1;

    for (const k of ["scaleXZ", "scaleY"]) {
        if (input[k] === undefined) continue;
        if (system !== "basic") throw new FmbeSpecError(`${k} only exists in the basic system (the advanced one replaced it with "extend"; the static one has no stretch)`, `${where}.${k}`);
        if (!isChannel(input[k])) throw new FmbeSpecError(`${k} must be a number or Molang string`, `${where}.${k}`);
        out[k] = input[k];
    }
    if (input.extend !== undefined) {
        if (system !== "advanced") throw new FmbeSpecError(`"extend" only exists in the advanced system`, `${where}.extend`);
        const e = input.extend;
        if (!e || typeof e !== "object" || Object.keys(e).some(k => !["scale", "xrot", "yrot"].includes(k)) || !Object.values(e).every(isChannel)) {
            throw new FmbeSpecError(`extend must be { scale?, xrot?, yrot? }`, `${where}.extend`);
        }
        out.extend = { scale: e.scale ?? 1, xrot: e.xrot ?? -90, yrot: e.yrot ?? 0 };
    }
    if (system === "static") {
        for (const k of ["pos", "basepos", "rot", "scale"]) {
            const vals = k === "scale" ? [out.scale] : out[k];
            if (vals.some(v => typeof v !== "number")) throw new FmbeSpecError(`the static system bakes numbers into the commands; client-side expressions need the basic or advanced system`, `${where}.${k}`);
        }
    }
    if (input.vars !== undefined) {
        const pairs = Array.isArray(input.vars) ? input.vars : Object.entries(input.vars ?? {});
        if (!pairs.every(p => Array.isArray(p) && p.length === 2 && /^v\.[A-Za-z_][A-Za-z0-9_.]*$/.test(p[0]) && isChannel(p[1]))) throw new FmbeSpecError("vars must map Molang variable names (v.something) to numbers or Molang strings", `${where}.vars`);
        out.vars = pairs.map(p => [p[0], p[1]]);
    }
    if (input.id !== undefined) out.id = String(input.id);
    if (input.name !== undefined) out.name = String(input.name);
    if (input.tags !== undefined) {
        if (!Array.isArray(input.tags) || !input.tags.every(t => typeof t === "string")) throw new FmbeSpecError("tags must be a list of strings", `${where}.tags`);
        out.tags = input.tags.slice();
    }
    return Object.freeze(out);
}

module.exports = { normalizeSpec, FmbeSpecError, KINDS, SYSTEM_NAMES };
