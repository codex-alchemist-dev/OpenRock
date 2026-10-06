"use strict";

// Builds the command strings that make a vanilla fox display an item/block, from a normalized spec (spec.cjs). Pure:
// strings in, strings out; the runtime runs them with entity.runCommand.
//
// Two shapes:
//   render chain  the wiki's Molang "systems" (wikiSystems.cjs). Static per entity; (re)send after spawn / chunk reload.
//   variables     ONE playanimation whose Molang assigns v.xpos/v.scale/... - the client re-evaluates it every frame, so
//                 a value may be a formula (a tween) and costs the server nothing per tick.
//   static        the wiki's compressed 3-command version with the numbers baked in (no tweens, fewest commands).

const { SYSTEMS, WIKI_SELECTOR } = require("./wikiSystems.cjs");
const { KINDS } = require("./spec.cjs");
const { toMolang, fmtNum } = require("./expr.cjs");

const VARS_ANIMATION = "animation.player.attack.positions"; // the wiki's "Editing Values" command
const FIRST_CONTROLLER = "controller.animation.fox.move";    // the wiki: the first command's controller must be exactly this
const FOX_SOUNDS = Object.freeze(["spit", "sniff", "sleep", "screech", "hurt", "eat", "death", "bite", "ambient", "aggro"]);

/** Effects that keep a display fox in place, alive and quiet. [effect, amplifier] */
const IMMOBILIZE_EFFECTS = Object.freeze([
    ["slowness", 255], ["resistance", 255], ["fire_resistance", 0], ["weakness", 255], ["slow_falling", 0],
]);

const valueText = v => (typeof v === "number" ? fmtNum(v) : typeof v === "string" ? v : toMolang(v));

/** Channel name -> [molang variable, scale from spec units to the variable's units] for every spec channel. */
const CHANNELS = Object.freeze({
    pos: [["v.xpos", 16], ["v.ypos", 16], ["v.zpos", 16]],
    basepos: [["v.xbasepos", 16], ["v.ybasepos", 16], ["v.zbasepos", 16]],
    rot: [["v.xrot", 1], ["v.yrot", 1], ["v.zrot", 1]],
});

const scaled = (value, k) => (k === 1 ? value : typeof value === "number" ? value * k : `(${valueText(value)})*${k}`);

/** Ordered [variable, value] pairs a spec sets. */
function specAssignments(spec) {
    const out = (spec.vars ?? []).map(([n, v]) => [n, v]);
    for (const ch of ["pos", "basepos", "rot"]) spec[ch].forEach((v, i) => out.push([CHANNELS[ch][i][0], scaled(v, CHANNELS[ch][i][1])]));
    out.push(["v.scale", spec.scale]);
    if (spec.scaleXZ !== undefined) out.push(["v.xzscale", spec.scaleXZ]);
    if (spec.scaleY !== undefined) out.push(["v.yscale", spec.scaleY]);
    if (spec.extend) { out.push(["v.extend_scale", spec.extend.scale], ["v.extend_xrot", spec.extend.xrot], ["v.extend_yrot", spec.extend.yrot]); }
    return out;
}

const renameController = (controller, ns) => (controller.startsWith("wiki.") ? `${ns}.${controller.slice(5)}` : controller);

function playAnimation(selector, c, expr, ns) {
    return `playanimation ${selector} ${c.anim} ${c.next} ${c.blend} "${expr}" ${renameController(c.controller, ns)}`;
}

function systemKey(spec) {
    if (spec.system === "basic") return "basic";
    if (spec.system === "static") return "compressed";
    return KINDS[spec.kind];
}

/** The render chain as commands (without the variable assignments). */
function renderCommands(spec, { selector = "@s", ns = "fmbe" } = {}) {
    return SYSTEMS[systemKey(spec)].map(c => playAnimation(selector, c, c.expr, ns));
}

/** The variables command for a set of [variable, value] pairs (value: number | Molang string | expr tree). */
function variablesCommand(assignments, { selector = "@s", ns = "fmbe" } = {}) {
    for (const [name] of assignments) if (!/^v\.[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) throw new Error(`bad Molang variable name "${name}"`);
    const expr = assignments.map(([n, v]) => `${n}=${valueText(v)};`).join("");
    if (expr.includes('"')) throw new Error("Molang values must not contain double quotes");
    return `playanimation ${selector} ${VARS_ANIMATION} none 0 "${expr}" ${ns}.setvariable`;
}

/** Replaces `name=<anything>;` inside a baked template, throwing if the template has no such assignment. */
function bake(expr, values) {
    let out = expr;
    for (const [name, value] of Object.entries(values)) {
        const re = new RegExp(`${name.replace(/\./g, "\.")}=[^;]*;`);
        if (!re.test(out)) throw new Error(`static template has no assignment for ${name}`);
        out = out.replace(re, `${name}=${value};`);
    }
    return out;
}

/** The wiki's compressed 3-command version with every number baked in. Valid only for number-only specs. */
function staticCommands(spec, { selector = "@s", ns = "fmbe" } = {}) {
    const values = {};
    for (const [name, value] of specAssignments(spec)) {
        if (typeof value !== "number") throw new Error(`static commands need numbers (${name})`);
        values[name] = fmtNum(value);
    }
    const [c0, c1, c2] = SYSTEMS.compressed;
    // the template derives v.adscale/v.adscaled from v.scale and spells the rotations as `q.life_time*0`
    const baked1 = bake(c1.expr, {
        "v.scale": values["v.scale"], "v.xbasepos": values["v.xbasepos"], "v.ybasepos": values["v.ybasepos"], "v.zbasepos": values["v.zbasepos"],
        "v.xpos": values["v.xpos"], "v.ypos": values["v.ypos"], "v.zpos": values["v.zpos"],
        "v.xrot": values["v.xrot"], "v.yrot": values["v.yrot"], "v.zrot": values["v.zrot"],
    });
    return [playAnimation(selector, c0, c0.expr, ns), playAnimation(selector, c1, baked1, ns), playAnimation(selector, c2, c2.expr, ns)];
}

/**
 * Everything needed to show a spec.
 * @returns {{render: string[], vars: string|null}} `render` first, then `vars` (null for the static system, which bakes them).
 */
function commandsFor(spec, opts = {}) {
    if (spec.system === "static") return { render: staticCommands(spec, opts), vars: null };
    return { render: renderCommands(spec, opts), vars: variablesCommand(specAssignments(spec), opts) };
}

// ---- entity / world commands around a display ----
const summonFoxCommand = (x, y, z, { yaw = 0, pitch = 0, name } = {}) =>
    `summon fox ${fmtNum(x)} ${fmtNum(y)} ${fmtNum(z)} ${fmtNum(yaw)} ${fmtNum(pitch)} minecraft:as_adult${name ? ` "${name}"` : ""}`;
const replaceItemCommand = (item, { selector = "@s", slot = 0 } = {}) => `replaceitem entity ${selector} slot.weapon.mainhand ${slot} ${item}`;
const stopSoundCommands = (target = "@a") => FOX_SOUNDS.map(s => `stopsound ${target} mob.fox.${s}`);
/** The wiki's "Changing FMBE Block Display Dynamically": a stand holding a silk-touch pickaxe mines the block at `at` into the fox's hand. */
const lootMineCommand = ({ standSelector, foxSelector, offset = "~ ~-1 ~" }) =>
    `execute as ${standSelector} at ${foxSelector} run loot replace entity @n slot.weapon.mainhand 0 mine ${offset} mainhand`;
const structureSaveCommand = (name, selector = "@n[tag=fmbe]") => `execute at ${selector} run structure save ${name} ~~~ ~~~ true disk false`;
const structureLoadCommand = (name, x, y, z) => `structure load ${name} ${fmtNum(x)} ${fmtNum(y)} ${fmtNum(z)}`;

module.exports = {
    renderCommands, variablesCommand, staticCommands, commandsFor, specAssignments, valueText,
    summonFoxCommand, replaceItemCommand, stopSoundCommands, lootMineCommand, structureSaveCommand, structureLoadCommand,
    FOX_SOUNDS, IMMOBILIZE_EFFECTS, VARS_ANIMATION, FIRST_CONTROLLER, WIKI_SELECTOR,
};
