// One FMBE display: a spec (what it shows and how it is placed) and, once spawned, the vanilla fox that renders it.
// All Bedrock access goes through `host` (the manager's internals, see manager.js), so this file is plain logic and
// runs under Node tests with a fake host.

import specLib from "../spec.cjs";
import cmds from "../commands.cjs";
import tweenLib from "../tween.cjs";
import { tweenSample, specWithVariables } from "./sample.js";

const { normalizeSpec } = specLib;
const { commandsFor, variablesCommand, specAssignments, replaceItemCommand, IMMOBILIZE_EFFECTS } = cmds;
const { tweenAssignments, diffChannels } = tweenLib;

/** The game has no item form for the display's block/item: retrying cannot help. */
export class FmbeItemError extends Error {
    constructor(item) { super(`no item for "${item}"`); this.name = "FmbeItemError"; this.item = item; }
}

const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };

export class Display {
    constructor(host, id, dimension, anchor, spec, opts) {
        this.host = host;
        this.id = id;
        this.dimension = dimension;
        this.anchor = { x: anchor.x, y: anchor.y, z: anchor.z };
        this.spec = spec;             // the TARGET spec: what it shows now, or will once a running tween finishes
        this.owner = opts.owner ?? null;
        this.group = opts.group ?? null;
        this.persist = !!opts.persist;
        this.onGiveUp = opts.onGiveUp ?? null;   // (display, error) when it can never be spawned (no item for the block, too many failed attempts)
        this.extraTags = opts.tags ?? [];
        this.state = "pending";       // pending -> live -> removed (a lost entity goes back to pending when it is respawned)
        this.entity = null;
        this.attempts = 0;
        this.appliedAt = -Infinity;   // tick the animation commands were last sent
        this.running = null;          // the active client-side tween { id, start, ticks, ease, loop, channels }
        this.tweenSeq = 0;
        this.glide = null;            // server-stepped movement, owned by the manager's scheduler
    }

    get isLive() { return this.state === "live" && !!this.entity && attempt(() => this.entity.isValid, false); }

    // ---- spawn / respawn (called by the manager within its per-tick budget) ----
    materialize() {
        const fox = this.host.spawnFox(this.dimension, this.anchor);
        try {
            this.host.markEntity(fox, this);
            for (const [effect, amplifier] of IMMOBILIZE_EFFECTS) attempt(() => fox.addEffect(effect, 20000000, { amplifier, showParticles: false }));
            this.entity = fox;
            if (!this.giveItem(this.spec.item)) throw new FmbeItemError(this.spec.item);
            this.state = "live";
            this.sendAll();
        } catch (e) {
            attempt(() => fox.remove());
            this.entity = null;
            this.state = "pending";
            throw e;
        }
    }

    /** Puts the block/item in the fox's hand. @returns {boolean} false when the game has no such item. */
    giveItem(item) {
        try {
            const r = this.entity.runCommand(replaceItemCommand(item));
            return !(r && r.successCount === 0);
        } catch (e) { return false; }
    }

    // ---- animation commands ----
    /** (Re)sends the render chain and the variables: after a spawn, a chunk reload, or a system/kind change. */
    sendAll() {
        const { render, vars } = commandsFor(this.spec, { ns: this.host.names.controllerNs });
        for (const c of render) this.entity.runCommand(c);
        if (vars) this.entity.runCommand(this.variablesNow());
        this.appliedAt = this.host.now();
    }

    /** The variables command: plain numbers, with the running tween's formulas substituted for the channels it animates. */
    variablesNow() {
        const assignments = new Map(specAssignments(this.spec));
        if (this.running) for (const [name, value] of tweenAssignments(this.running.id, this.running.channels, this.running)) assignments.set(name, value);
        return variablesCommand([...assignments.entries()], { ns: this.host.names.controllerNs });
    }

    sendVars() {
        if (!this.isLive) return;
        if (this.spec.system === "static") { this.sendAll(); return; } // the static system bakes numbers into its render chain
        this.entity.runCommand(this.variablesNow());
        this.appliedAt = this.host.now();
    }

    // ---- public API ----
    /** The spec as it is displayed right now (samples a running tween with the server clock). */
    current() {
        if (!this.running) return this.spec;
        return specWithVariables(this.spec, tweenSample(this.running, this.host.now() - this.running.start));
    }

    /** Changes the display immediately. `patch` takes any spec field (pos, rot, scale, item, ...). */
    set(patch) {
        const next = normalizeSpec({ ...this.current(), ...patch }, this.label());
        this.running = null;
        this.become(next);
        return this;
    }

    /**
     * Animates to `patch` on the client: zero server cost while it runs. Numeric channels animate; anything else jumps.
     * @param {{ticks?: number, ease?: string, loop?: "none"|"repeat"|"pingpong"}} [opts]
     */
    tween(patch, { ticks = 20, ease = "linear", loop = "none" } = {}) {
        if (this.spec.system === "static") throw new Error(`${this.label()}: the static system cannot animate; use system "advanced" or "basic"`);
        const from = this.current();
        const target = normalizeSpec({ ...from, ...patch }, this.label());
        const channels = diffChannels(from, target);
        const run = channels.length ? { id: ++this.tweenSeq, start: this.host.now(), ticks, ease, loop, channels } : null;
        this.running = run;
        this.become(target);
        if (run && loop === "none") this.host.later(ticks + 1, () => { if (this.running === run) this.settle(); });
        return this;
    }

    /** Ends a running tween on its target and sends plain numbers (the client has already finished animating). */
    settle() {
        if (!this.running) return this;
        this.running = null;
        this.sendVars();
        return this;
    }

    /** Freezes a looping/running tween where it is. */
    stop() {
        if (!this.running) return this;
        this.spec = this.current();
        this.running = null;
        this.sendVars();
        this.host.persistSpec(this);
        return this;
    }

    become(next) {
        const itemChanged = next.item !== this.spec.item;
        const shapeChanged = next.system !== this.spec.system || next.kind !== this.spec.kind || ("extend" in next) !== ("extend" in this.spec);
        this.spec = next;
        if (!this.isLive) return;
        if (itemChanged && !this.giveItem(next.item)) this.host.fail(new Error(`${this.label()}: no item for "${next.item}"`));
        if (shapeChanged) this.sendAll(); else this.sendVars();
        this.host.persistSpec(this);
    }

    /** Moves the whole display (the entity) to a new anchor; spec offsets stay relative to it. */
    moveTo(location) {
        this.anchor = { x: location.x, y: location.y, z: location.z };
        this.glide = null;
        if (this.isLive) attempt(() => this.entity.teleport(this.anchor));
        this.host.persistSpec(this);
        return this;
    }

    /**
     * Server-stepped movement along waypoints (the client cannot move an entity by itself, so this costs one teleport per
     * tick while it runs; prefer tween({pos}) for movements inside a block or two).
     * @param {Array<{x:number,y:number,z:number}>} points
     * @param {{ticksPerSegment?: number, ease?: string, onDone?: Function}} [opts]
     */
    glideTo(points, { ticksPerSegment = 20, ease = "linear", onDone } = {}) {
        this.glide = { points: [{ ...this.anchor }, ...points], ticksPerSegment, ease, start: this.host.now(), onDone };
        this.host.wake();
        return this;
    }

    label() { return this.spec?.id ?? this.spec?.name ?? `display ${this.id}`; }

    remove() {
        if (this.state === "removed") return;
        this.state = "removed";
        this.host.forget(this);
        if (this.entity) attempt(() => this.entity.remove());
        this.entity = null;
    }
}
