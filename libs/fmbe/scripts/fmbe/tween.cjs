"use strict";

// Client-side tweens. The variables command (commands.cjs) is a Molang string the client re-evaluates every frame, so a
// value that is a FORMULA animates for free: no server tick, no per-frame command. A tween becomes
//   v.fm_t<N> = v.fm_t<N> ?? q.life_time          (its start time, latched on the first frame)
//   v.fm_u<N> = clamp((q.life_time - v.fm_t<N>) / seconds, 0, 1)
//   <channel> = from + (to - from) * ease(v.fm_u<N>)
// N is unique per tween so a new tween never inherits an old start time; after it ends, the runtime "settles" the
// display by re-sending plain numbers.

const { vr, num, sub, div, clamp, lerp, mul, add, toMolang } = require("./expr.cjs");
const { easeTree } = require("./ease.cjs");
const { CHANNELS, specAssignments } = require("./commands.cjs");

const TICKS_PER_SECOND = 20;

/**
 * The shared head of every client-side animation: start latch, progress and eased progress.
 * @returns {{assignments: Array<[string,string]>, t0: string, u: string, e: string}} e is the eased progress variable
 */
function progressAssignments(id, { ticks, ease = "linear", loop = "none" }) {
    if (!(ticks > 0)) throw new Error("tween needs ticks > 0");
    const t0 = `v.fm_t${id}`, u = `v.fm_u${id}`, e = `v.fm_e${id}`;
    const elapsed = div(sub(vr("q.life_time"), vr(t0)), ticks / TICKS_PER_SECOND);
    let progress;
    if (loop === "repeat") progress = sub(elapsed, call1("math.floor", elapsed));
    else if (loop === "pingpong") progress = sub(1, call1("math.abs", sub(sub(elapsed, mul(2, call1("math.floor", div(elapsed, 2)))), 1))); // triangle wave 0 -> 1 -> 0
    else progress = clamp(elapsed, 0, 1);
    return { t0, u, e, assignments: [[t0, `${t0}??q.life_time`], [u, toMolang(progress)], [e, toMolang(easeTree(ease, vr(u)))]] };
}

/**
 * @param {number} id unique tween id on the entity
 * @param {Array<[string, number, number]>} channels [variable, from, to] (variable units, e.g. v.ypos in 1/16 block)
 * @param {{ticks: number, ease?: string, loop?: "none"|"repeat"|"pingpong"}} opts
 * @returns {Array<[string, string]>} assignments to feed variablesCommand
 */
function tweenAssignments(id, channels, opts) {
    const p = progressAssignments(id, opts);
    const out = [...p.assignments];
    for (const [variable, from, to] of channels) out.push([variable, toMolang(lerp(num(from), num(to), vr(p.e)))]);
    return out;
}
const call1 = (fn, x) => ({ t: "call", fn, args: [typeof x === "number" ? num(x) : x] });

/**
 * Channels that differ between two specs, as tween channels (variable units). Only numeric channels can tween.
 * @returns {Array<[string, number, number]>}
 */
function diffChannels(fromSpec, toSpec) {
    const a = new Map(specAssignments(fromSpec)), out = [];
    for (const [name, value] of specAssignments(toSpec)) {
        const prev = a.get(name);
        if (typeof value === "number" && typeof prev === "number" && value !== prev) out.push([name, prev, value]);
    }
    return out;
}

module.exports = { progressAssignments, tweenAssignments, diffChannels, TICKS_PER_SECOND, CHANNELS };
