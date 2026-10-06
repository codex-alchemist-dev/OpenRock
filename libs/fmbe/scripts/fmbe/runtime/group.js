// A group is a rigid assembly of displays and sub-groups: move, rotate or scale the group and everything in it follows.
// Children are given in the group's local space (blocks, degrees); transforms compose through matrix.cjs into each
// child's world pose. An FMBE offset is only reliable within a few blocks of its entity, so a child is re-anchored (its
// fox teleported to the cell nearest its world position) whenever its offset would grow past `maxOffset`.

import matrix from "../matrix.cjs";
import ease from "../ease.cjs";
import exprLib from "../expr.cjs";
import tweenLib from "../tween.cjs";
import specLib from "../spec.cjs";
import { easedProgress } from "./sample.js";

const { composeTransforms } = matrix;
const { easeTree } = ease;
const { evaluate, toMolang, vr, call, add, sub, mul, num: n } = exprLib;
const { progressAssignments } = tweenLib;
const { normalizeSpec } = specLib;

const FM_VAR = /^v\.fm_/;           // variables this library owns (animation preambles); user `vars` never match
const near0 = v => Math.abs(v) < 1e-9;
const IDENTITY = () => ({ pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 });
const lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const mix = (a, b, k) => ({ pos: lerp3(a.pos, b.pos, k), rot: lerp3(a.rot, b.rot, k), scale: a.scale + (b.scale - a.scale) * k });
const complete = t => ({ pos: t?.pos ?? [0, 0, 0], rot: t?.rot ?? [0, 0, 0], scale: t?.scale ?? 1 });
const userVars = d => (d.spec.vars ?? []).filter(([name]) => !FM_VAR.test(name));

export class Group {
    /**
     * @param {object} fmbe the manager
     * @param {{id?: string, dimension: object, local?: object, parent?: Group, owner?: string, persist?: boolean, maxOffset?: number, handedness?: 1|-1}} opts
     *   `local` is relative to `parent`, or the absolute world transform for a root group.
     */
    constructor(fmbe, opts) {
        this.fmbe = fmbe;
        this.id = opts.id ?? `g${Math.floor(Math.random() * 1e9).toString(36)}`;
        this.dimension = opts.dimension;
        this.parent = opts.parent ?? null;
        this.owner = opts.owner;
        this.persist = !!opts.persist;
        this.maxOffset = opts.maxOffset ?? 4;
        this.handedness = opts.handedness ?? 1;
        this.local = { ...IDENTITY(), ...(opts.local ?? opts.transform ?? {}) };
        this.children = [];           // { display, local }
        this.groups = [];
        this.timers = [];
        this.sweepSeq = 0;
        this.sweeping = null;         // the running analytic sweep, if any
    }

    compose(parent, child) { return composeTransforms(parent, child, { handedness: this.handedness }); }

    /** This group's world transform, optionally with `local` replaced (used while tweening). */
    world(local = this.local) { return this.parent ? this.compose(this.parent.world(), local) : local; }

    /** Adds a display at `local` = { pos, rot, scale } relative to this group (the spec's own pos/rot/scale are replaced by it). */
    add(spec, local = {}) {
        const l = complete(local);
        const world = this.compose(this.world(), l);
        const anchor = this.snap(world.pos);
        const display = this.fmbe.spawn(this.dimension, anchor, { ...spec, ...this.pose(world, anchor) }, { owner: this.owner, persist: this.persist, group: this });
        this.children.push({ display, local: l });
        return display;
    }

    /** Adds a sub-group whose transform is relative to this one. */
    addGroup(local = {}, opts = {}) {
        const g = new Group(this.fmbe, { dimension: this.dimension, owner: this.owner, persist: this.persist, maxOffset: this.maxOffset, handedness: this.handedness, ...opts, parent: this, local });
        this.groups.push(g);
        return g;
    }

    snap(p) { return { x: Math.floor(p[0]) + 0.5, y: p[1], z: Math.floor(p[2]) + 0.5 }; }
    pose(world, anchor) { return { pos: [world.pos[0] - anchor.x, world.pos[1] - anchor.y, world.pos[2] - anchor.z], rot: world.rot, scale: world.scale }; }

    /** Lays everything out under world transform `w`; with `tween` the displays animate there, otherwise they jump. */
    layout(w, tween) {
        for (const c of this.children) this.placeChild(c, this.compose(w, c.local), tween);
        for (const g of this.groups) g.layout(this.compose(w, g.local), tween);
    }

    placeChild(child, world, tween, extra = {}) {
        const d = child.display;
        let anchor = d.anchor;
        const rel = [world.pos[0] - anchor.x, world.pos[1] - anchor.y, world.pos[2] - anchor.z];
        if (Math.max(...rel.map(Math.abs)) > this.maxOffset) { anchor = this.snap(world.pos); d.moveTo(anchor); }
        const patch = { ...this.pose(world, anchor), vars: userVars(d), ...extra };
        if (tween) d.tween(patch, tween); else d.set(patch);
    }

    /**
     * Changes one child. pos/rot/scale are in this group's local space; anything else (item, extend, ...) goes to the display.
     * Both land in ONE tween so a single animation moves it.
     */
    updateChild(display, patch, tween) {
        const child = this.children.find(c => c.display === display);
        if (!child) throw new Error("that display is not a direct child of this group");
        const spatial = {}, rest = {};
        for (const [k, v] of Object.entries(patch)) (k === "pos" || k === "rot" || k === "scale" ? spatial : rest)[k] = v;
        child.local = { ...child.local, ...spatial };
        this.placeChild(child, this.compose(this.world(), child.local), tween, rest);
    }

    /** Sets (part of) this group's transform now. */
    set(patch) {
        this.cancel();
        this.sweeping = null;
        this.local = { ...this.local, ...patch };
        this.layout(this.world());
        return this;
    }

    /** True when this transform and every ancestor only rotate about the vertical axis (what the analytic sweep expresses exactly). */
    yawOnly(local = this.local) {
        return near0(local.rot[0]) && near0(local.rot[2]) && (!this.parent || this.parent.yawOnly(this.parent.local));
    }

    /**
     * Animates this group to `patch` on the client (zero server cost while it runs).
     *  - Yaw rotations (turntables, swings, full 360s, loops) are exact for any angle: every descendant's position and
     *    rotation becomes a Molang formula of the group's animated yaw, so children travel on true circles.
     *  - Other rotations animate as `steps` straight pieces (automatically one per 90 degrees) which approximate arcs;
     *    looping those is not supported.
     * @param {{ticks?: number, ease?: string, loop?: "none"|"repeat"|"pingpong", steps?: number}} [opts]
     */
    tween(patch, { ticks = 20, ease: easing = "linear", steps = 1, loop = "none" } = {}) {
        this.cancel();
        this.sweeping = null;
        const from = this.local;
        const to = { pos: patch.pos ?? from.pos, rot: patch.rot ?? from.rot, scale: patch.scale ?? from.scale };
        const rotDelta = Math.max(...to.rot.map((v, i) => Math.abs(v - from.rot[i])));
        const onlyYaw = near0(to.rot[0] - from.rot[0]) && near0(to.rot[2] - from.rot[2]) && this.yawOnly(from) && this.yawOnly(to);
        if (rotDelta > 0 && onlyYaw) return this.sweep(from, to, { ticks, ease: easing, loop });
        if (loop !== "none" && rotDelta > 0) throw new Error("looping a group rotation needs a yaw-only group (rotation about the vertical axis); use steps for one-off tilts");

        const pieces = Math.max(steps, Math.ceil(rotDelta / 90), 1);
        this.local = to;
        const shaped = easeTree(easing);
        const segTicks = Math.max(1, Math.round(ticks / pieces));
        const run = k => {
            const t = pieces === 1 ? to : mix(from, to, evaluate(shaped, { u: k / pieces }));
            this.layout(this.world(t), { ticks: segTicks, ease: pieces === 1 ? easing : "linear", loop: pieces === 1 ? loop : "none" });
            if (k < pieces) this.timers.push(this.fmbe.later(segTicks, () => run(k + 1)));
        };
        run(1);
        return this;
    }

    /** Every display below this group with its transform relative to the group: [{ display, rel }]. */
    descendants(rel = IDENTITY(), out = []) {
        for (const c of this.children) out.push({ display: c.display, rel: this.compose(rel, c.local) });
        for (const g of this.groups) g.descendants(this.compose(rel, g.local), out);
        return out;
    }

    /** The analytic yaw sweep (see tween). */
    sweep(from, to, { ticks, ease: easing, loop }) {
        const parentWorld = this.parent ? this.parent.world() : IDENTITY();
        const phi = parentWorld.rot[1] * Math.PI / 180;
        const cP = Math.cos(phi), sP = Math.sin(phi);
        const id = `g${++this.sweepSeq}`;
        const prog = progressAssignments(id, { ticks, ease: easing, loop });
        const e = vr(prog.e);
        const lerpE = (a, b) => (a === b ? n(a) : add(n(a), mul(n(b - a), e)));

        // The group origin, yaw and scale in the world as functions of the eased progress e (the parent chain is pure yaw).
        const gx = lerpE(from.pos[0], to.pos[0]), gy = lerpE(from.pos[1], to.pos[1]), gz = lerpE(from.pos[2], to.pos[2]);
        const ps = n(parentWorld.scale);
        const V = k => `v.fm_${k}${id}`;
        const shared = [
            [V("yw"), toMolang(add(n(parentWorld.rot[1]), lerpE(from.rot[1], to.rot[1])))],
            [V("sw"), toMolang(mul(ps, lerpE(from.scale, to.scale)))],
            [V("gx"), toMolang(add(n(parentWorld.pos[0]), mul(ps, sub(mul(n(cP), gx), mul(n(sP), gz)))))],
            [V("gy"), toMolang(add(n(parentWorld.pos[1]), mul(ps, gy)))],
            [V("gz"), toMolang(add(n(parentWorld.pos[2]), mul(ps, add(mul(n(sP), gx), mul(n(cP), gz)))))],
        ];
        const cy = call("math.cos", vr(V("yw"))), sy = call("math.sin", vr(V("yw")));

        const items = this.descendants();
        // Worst-case offset of each display from its entity over the whole sweep: a swing too wide for FMBE fails loudly
        // instead of the display silently vanishing out of view.
        for (const { display, rel } of items) {
            for (let i = 0; i <= 16; i++) {
                const w = this.compose(parentWorld, mix(from, to, easedProgress({ ticks, ease: easing, loop: "none" }, ticks * i / 16)));
                const cw = this.compose(w, rel);
                const far = Math.max(...[cw.pos[0] - display.anchor.x, cw.pos[1] - display.anchor.y, cw.pos[2] - display.anchor.z].map(Math.abs));
                if (far > this.maxOffset) throw new Error(`group sweep: "${display.label()}" would swing ${far.toFixed(1)} blocks from its entity (limit ${this.maxOffset}); split the motion or raise maxOffset`);
            }
        }
        for (const { display, rel } of items) {
            const [lx, ly, lz] = rel.pos;
            const X = add(vr(V("gx")), mul(vr(V("sw")), sub(mul(n(lx), cy), mul(n(lz), sy))));
            const Y = add(vr(V("gy")), mul(vr(V("sw")), n(ly)));
            const Z = add(vr(V("gz")), mul(vr(V("sw")), add(mul(n(lx), sy), mul(n(lz), cy))));
            const spec = normalizeSpec({
                ...display.spec,
                pos: [toMolang(sub(X, n(display.anchor.x))), toMolang(sub(Y, n(display.anchor.y))), toMolang(sub(Z, n(display.anchor.z)))],
                rot: [rel.rot[0], `math.mod(${V("yw")}+${rel.rot[1]},360)`, rel.rot[2]],
                scale: toMolang(mul(vr(V("sw")), n(rel.scale))),
                vars: [...userVars(display), ...prog.assignments, ...shared],
            }, display.label());
            display.running = null;
            display.become(spec);
        }
        const run = { from, to, ticks, ease: easing, loop, start: this.fmbe.now() };
        this.sweeping = run;
        this.local = to;
        if (loop === "none") this.timers.push(this.fmbe.later(ticks + 1, () => { if (this.sweeping === run) { this.sweeping = null; this.layout(this.world()); } }));
        return this;
    }

    /** Where a running sweep is right now, as a group transform (server clock). */
    sweepNow() {
        const s = this.sweeping;
        return mix(s.from, s.to, easedProgress(s, this.fmbe.now() - s.start));
    }

    /** Freezes whatever this group is animating where it is (plain numbers replace the client formulas). */
    stop() {
        this.cancel();
        if (this.sweeping) { this.local = this.sweepNow(); this.sweeping = null; this.layout(this.world()); }
        else for (const c of this.children) c.display.stop();
        for (const g of this.groups) g.stop();
        return this;
    }

    cancel() { for (const t of this.timers) t.cancel(); this.timers = []; }

    remove() {
        this.cancel();
        for (const c of this.children) c.display.remove();
        for (const g of this.groups) g.remove();
        this.children = [];
        this.groups = [];
    }
}
