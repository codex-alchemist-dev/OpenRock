// Server-side sampling of a client-side tween: the same easing tree the client evaluates, evaluated in JS, so the
// server always knows where a display is without asking the client.

import ease from "../ease.cjs";
import exprLib from "../expr.cjs";
import specLib from "../spec.cjs";
import cmds from "../commands.cjs";

const { easeTree } = ease;
const { evaluate } = exprLib;
const { normalizeSpec } = specLib;
const { specAssignments } = cmds;

const TICKS_PER_SECOND = 20;

/** Progress (0..1) of a tween after `elapsedTicks`, honouring loop modes. */
export function tweenProgress({ ticks, loop = "none" }, elapsedTicks) {
    const e = elapsedTicks / ticks;
    if (loop === "repeat") return e - Math.floor(e);
    if (loop === "pingpong") return 1 - Math.abs(e - 2 * Math.floor(e / 2) - 1);
    return Math.min(1, Math.max(0, e));
}

/** Eased progress (0..1, ease curve applied) of a tween-like { ticks, ease, loop } after `elapsedTicks`. */
export function easedProgress(tween, elapsedTicks) {
    return evaluate(easeTree(tween.ease ?? "linear"), { u: tweenProgress(tween, elapsedTicks) });
}

/** @returns {Map<string, number>} variable -> value of every channel the tween animates */
export function tweenSample(tween, elapsedTicks) {
    const u = tweenProgress(tween, elapsedTicks);
    const shaped = evaluate(easeTree(tween.ease ?? "linear"), { u });
    const out = new Map();
    for (const [variable, from, to] of tween.channels) out.set(variable, from + (to - from) * shaped);
    return out;
}

/** Rebuilds a normalized spec from `base` with some variable values overridden (variable units: 1/16 block, degrees). */
export function specWithVariables(base, values) {
    const v = new Map(specAssignments(base));
    for (const [name, value] of values) v.set(name, value);
    const num = (n, fallback) => (typeof v.get(n) === "number" ? v.get(n) : fallback);
    const next = { ...base };
    next.pos = ["v.xpos", "v.ypos", "v.zpos"].map((n, i) => num(n, base.pos[i] * 16) / 16);
    next.basepos = ["v.xbasepos", "v.ybasepos", "v.zbasepos"].map((n, i) => num(n, base.basepos[i] * 16) / 16);
    next.rot = ["v.xrot", "v.yrot", "v.zrot"].map((n, i) => num(n, base.rot[i]));
    next.scale = num("v.scale", base.scale);
    if (base.scaleXZ !== undefined) next.scaleXZ = num("v.xzscale", base.scaleXZ);
    if (base.scaleY !== undefined) next.scaleY = num("v.yscale", base.scaleY);
    if (base.extend) next.extend = { scale: num("v.extend_scale", base.extend.scale), xrot: num("v.extend_xrot", base.extend.xrot), yrot: num("v.extend_yrot", base.extend.yrot) };
    return normalizeSpec(next);
}

export { TICKS_PER_SECOND };
