// Crystal FMBE compiler: AST -> scene data (see libs/fmbe/scripts/fmbe/runtime/scenes.js for how it is played), with every
// display validated against the library's own spec rules and linted by simulating its Molang.
"use strict";

const path = require("path");
const lib = name => require(path.join(__dirname, "..", "..", "libs", "fmbe", "scripts", "fmbe", name));
const { normalizeSpec, FmbeSpecError } = lib("spec.cjs");
const { easeNames } = lib("ease.cjs");
const { itemSupport } = lib("items.cjs");
const { simulate } = lib("simulate.cjs");
const { CrystalSyntaxError } = require("../crystal/errors.js");

const LOOPS = ["none", "repeat", "pingpong"];
const BIG_SCENE = 100;

/**
 * @param {{scenes: object[]}} ast
 * @param {{source?: string, filename?: string}} [ctx]
 * @returns {{scenes: object[], warnings: string[]}}
 */
function compileProgram(ast, { source = "", filename = null } = {}) {
    const warnings = [];
    const fail = (msg, node) => { throw new CrystalSyntaxError(msg, source, node.line, node.col, filename); };
    const warn = (msg, node) => warnings.push(`${filename ?? "fmbe"}:${node.line}:${node.col}: ${msg}`);

    const scenes = ast.scenes.map(scene => {
        const nodes = [];
        const anims = [];
        const names = new Map();   // display/group name -> node
        let displays = 0;

        const declare = (name, node, what) => {
            if (name === "root") fail(`"root" is reserved for the scene itself`, node);
            if (names.has(name)) fail(`${what} "${name}" is already defined in scene "${scene.id}"`, node);
            names.set(name, node);
        };

        const walk = (body, parent) => {
            for (const n of body) {
                if (n.type === "group") {
                    declare(n.name, n, "group");
                    nodes.push({ kind: "group", name: n.name, parent, local: { pos: n.props.at ?? [0, 0, 0], rot: n.props.rot ?? [0, 0, 0], scale: n.props.scale ?? 1 } });
                    walk(n.body, n.name);
                } else if (n.type === "display") {
                    declare(n.name, n, "display");
                    displays++;
                    const raw = { item: n.item, kind: n.kind, system: n.props.system };
                    if (n.props.base) raw.basepos = n.props.base;
                    if (n.props.scaleXZ !== undefined) raw.scaleXZ = n.props.scaleXZ;
                    if (n.props.scaleY !== undefined) raw.scaleY = n.props.scaleY;
                    if (n.props.extend) raw.extend = n.props.extend;
                    if (n.props.vars) raw.vars = n.props.vars;
                    if (n.props.tags) raw.tags = n.props.tags;
                    if (n.props.name) raw.name = n.props.name;
                    if (raw.system === undefined) delete raw.system;
                    const local = { pos: n.props.at ?? [0, 0, 0], rot: n.props.rot ?? [0, 0, 0], scale: n.props.scale ?? 1 };
                    let spec;
                    try { spec = normalizeSpec({ ...raw, pos: local.pos, rot: local.rot, scale: local.scale }, `display "${n.name}"`); }
                    catch (e) { if (e instanceof FmbeSpecError) fail(e.message, n); throw e; }
                    const sup = itemSupport(n.item);
                    if (sup.level === "unsupported") fail(`"${n.item}" (${sup.what}) cannot be shown with FMBE`, n);
                    if (sup.level === "exception") warn(`"${n.item}" (${sup.what}) is on the FMBE exceptions list: the fox holds it differently, so its placement will be off`, n);
                    const sim = simulate(spec);
                    if (sim.nonFinite.length) fail(`display "${n.name}" produces non-finite Molang values (${sim.nonFinite.slice(0, 3).join(", ")}): check its numbers`, n);
                    const { pos, rot, scale, ...rest } = spec;
                    nodes.push({ kind: "display", name: n.name, parent, spec: rest, local });
                }
            }
        };
        walk(scene.body, null);

        const under = (name, out = []) => {
            for (const nd of nodes) if (nd.parent === name) { if (nd.kind === "display") out.push(nd); else under(nd.name, out); }
            return out;
        };
        const allAnims = [];
        const collect = body => { for (const n of body) { if (n.type === "anim") allAnims.push(n); else if (n.type === "group") collect(n.body); } };
        collect(scene.body);
        const seen = new Set();
        for (const a of allAnims) {
            if (seen.has(a.name)) fail(`animation "${a.name}" is already defined in scene "${scene.id}"`, a);
            seen.add(a.name);
            const target = names.get(a.target);
            if (!target) fail(`animation "${a.name}" targets "${a.target}", which is not a display or group in scene "${scene.id}"`, a);
            const o = a.opts;
            if (o.ease !== undefined && !easeNames().includes(o.ease)) fail(`unknown easing "${o.ease}" - known: ${easeNames().join(", ")}`, a);
            if (o.loop !== undefined && !LOOPS.includes(o.loop)) fail(`loop must be one of ${LOOPS.join(", ")} (got "${o.loop}")`, a);
            if (o.steps !== undefined && !(Number.isInteger(o.steps) && o.steps >= 1)) fail("steps must be a whole number >= 1", a);
            if (target.type === "group") {
                for (const k of Object.keys(a.channels)) if (!["pos", "rot", "scale"].includes(k)) fail(`a group animation can only tween pos, rot and scale (not ${k}); tween the display instead`, a);
            }
            const affected = target.type === "group" ? under(a.target) : nodes.filter(nd => nd.name === a.target);
            if (affected.some(nd => nd.spec.system === "static")) fail(`animation "${a.name}" reaches a display with system static, which cannot animate - use advanced or basic`, a);
            anims.push({
                name: a.name, target: a.target, patch: a.channels, ticks: o.ticks, ease: o.ease ?? "linear", loop: o.loop ?? "none", steps: o.steps ?? 1, auto: !!o.auto,
            });
        }

        if (displays === 0) warn(`scene "${scene.id}" has no displays`, scene);
        if (displays > BIG_SCENE) warn(`scene "${scene.id}" has ${displays} displays - each is a real mob; consider the cube ghost or fewer displays`, scene);
        return { id: scene.id, persist: scene.persist, nodes, anims, stats: { displays, groups: nodes.filter(n => n.kind === "group").length, anims: anims.length } };
    });
    return { scenes, warnings };
}

module.exports = { compileProgram };
