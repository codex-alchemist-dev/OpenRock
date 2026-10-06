// The FMBE runtime: spawns displays (vanilla foxes), keeps them alive, pinned, animated, quiet and cleaned up.
//
//   import { world, system } from "@minecraft/server";
//   import { createFmbe } from "@openrock/fmbe";
//   const fmbe = createFmbe({ world, system, namespace: "mymod" });
//   const d = fmbe.spawn(dim, { x: 10.5, y: 70, z: 4.5 }, { item: "minecraft:grass_block", scale: 0.9 });
//   d.tween({ rot: [0, 360, 0] }, { ticks: 100, loop: "repeat" });
//
// Nothing here imports the game: `world`/`system` are injected, which is also what lets the whole thing run under Node.

import specLib from "../spec.cjs";
import { namesFor } from "../names.cjs";
import { Display } from "./display.js";
import { Group } from "./group.js";
import { copyBlockToDisplay } from "./blockSource.js";
import { runSpawnQueue, detectLost, pinEntities, reapplyStale, stepGlides, muteFoxes } from "./maintenance.js";

const { normalizeSpec } = specLib;
const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };

const DEFAULTS = {
    namespace: "fmbe",
    maxSpawnPerTick: 8,       // spawning is the expensive part
    maxAttempts: 20,          // a display that cannot spawn (chunk not loaded, no such item) is dropped after this many tries
    maxPinPerTick: 24,
    pinTolerance: 0.05,
    reapplyTicks: 100,
    maxReapplyPerTick: 6,
    muteTicks: 20,
    keepAlive: true,          // respawn a display whose entity was killed or unloaded away
    orphanPolicy: "sweep",    // displays found in the world that this runtime does not know: "sweep" removes them, "adopt" re-attaches persisted ones
    ownerAlive: null,         // (ownerId) => boolean; displays of a dead owner are swept (default: owner counts as alive while it has displays)
};

export function createFmbe({ world, system, server = {}, onError, ...options }) {
    const cfg = { ...DEFAULTS, ...options };
    const names = namesFor(cfg.namespace);
    const displays = new Map();    // id -> Display
    const idBase = Math.floor(Math.random() * 36 ** 4).toString(36);
    let seq = 0;
    let runId = null;
    let loadSub = null;
    let lastMute = 0;

    const host = {
        names,
        now: () => system.currentTick,
        later: (ticks, fn) => system.runTimeout(fn, ticks),
        wake: () => start(),
        fail: err => (onError ? onError(err) : console.warn(`[fmbe] ${err?.message ?? err}`)),
        spawnFox: (dimension, at) => dimension.spawnEntity(names.FOX_SPAWN, at),
        markEntity(fox, d) {
            fox.addTag(names.tag);
            fox.addTag(names.idTag(d.id));
            for (const t of d.extraTags) fox.addTag(t);
            fox.setDynamicProperty(names.idProp, d.id);
            if (d.owner !== null) fox.setDynamicProperty(names.ownerProp, String(d.owner));
            host.persistSpec(d, fox);
        },
        persistSpec(d, fox = d.entity) {
            if (!d.persist || !fox) return;
            attempt(() => fox.setDynamicProperty(names.specProp, JSON.stringify({ spec: d.spec, group: d.group?.id ?? null })));
            attempt(() => fox.setDynamicProperty(names.persistProp, true));
        },
        forget(d) { displays.delete(d.id); },
    };

    // ---- the one tick loop (started on demand, stopped when there is nothing to maintain) ----
    function tick() {
        const list = [...displays.values()];
        const now = system.currentTick;
        detectLost(list, cfg.keepAlive, host);
        runSpawnQueue(list.filter(d => d.state === "pending"), cfg.maxSpawnPerTick, cfg.maxAttempts, host);
        stepGlides(list.filter(d => d.glide), now);
        pinEntities(list.filter(d => !d.glide), cfg.maxPinPerTick, cfg.pinTolerance);
        reapplyStale(list, now, cfg.reapplyTicks, cfg.maxReapplyPerTick);
        if (cfg.muteTicks && now - lastMute >= cfg.muteTicks && list.some(d => d.isLive)) {
            lastMute = now;
            attempt(() => muteFoxes(world.getDimension("overworld")));
        }
        if (displays.size === 0) stop();
    }
    function start() {
        if (runId === null) runId = system.runInterval(tick, 1);
        if (loadSub === null) subscribeLoads();
    }
    function stop() {
        if (runId !== null) { attempt(() => system.clearRun(runId)); runId = null; }
    }

    // ---- foxes found in the world that this runtime does not know (crash, /reload, chunk reload, restart) ----
    function subscribeLoads() {
        loadSub = attempt(() => world.afterEvents.entityLoad.subscribe(ev => {
            const e = ev.entity;
            if (e?.typeId === names.FOX && attempt(() => e.hasTag(names.tag), false)) system.run(() => reconcile(e));
        }), false);
    }

    function reconcile(entity) {
        if (!attempt(() => entity.isValid, false)) return;
        const id = attempt(() => entity.getDynamicProperty(names.idProp));
        const known = id && displays.get(id);
        if (known) {
            if (known.entity?.id === entity.id) attempt(() => known.sendAll()); // a chunk reload: the client forgot the animation
            else if (!known.entity || !known.entity.isValid) { known.entity = entity; known.state = "live"; attempt(() => known.sendAll()); }
            else attempt(() => entity.remove());                               // a duplicate
            return;
        }
        const persisted = attempt(() => entity.getDynamicProperty(names.persistProp), false);
        const owner = attempt(() => entity.getDynamicProperty(names.ownerProp), null);
        if (cfg.orphanPolicy === "adopt" && persisted && (!cfg.ownerAlive || cfg.ownerAlive(owner))) {
            if (adopt(entity, id, owner)) return;
        }
        attempt(() => entity.remove());
    }

    function adopt(entity, id, owner) {
        const saved = attempt(() => JSON.parse(entity.getDynamicProperty(names.specProp)));
        if (!saved) return false;
        const spec = attempt(() => normalizeSpec(saved.spec, "adopted display"));
        if (!spec) return false;
        const d = new Display(host, id ?? nextId(), entity.dimension, entity.location, spec, { owner, persist: true });
        d.entity = entity;
        d.state = "live";
        displays.set(d.id, d);
        attempt(() => d.sendAll());
        start();
        return true;
    }

    const nextId = () => `${idBase}${(++seq).toString(36)}`;

    const api = {
        names,
        config: cfg,

        /**
         * Shows `spec` at `location`. Returns immediately; the fox spawns within the per-tick budget (`display.state`).
         * @param {object} dimension
         * @param {{x:number,y:number,z:number}} location where the fox stands; spec.pos/basepos are offsets from here
         * @param {object} spec see spec.cjs
         * @param {{owner?: string, persist?: boolean, tags?: string[], group?: object}} [opts]
         */
        spawn(dimension, location, spec, opts = {}) {
            const d = new Display(host, nextId(), dimension, location, normalizeSpec(spec), opts);
            displays.set(d.id, d);
            start();
            return d;
        },
        now: () => system.currentTick,
        group: opts => new Group(api, opts),
        /** A cancellable system.runTimeout. */
        later(ticks, fn) { let live = true; system.runTimeout(() => { if (live) fn(); }, ticks); return { cancel() { live = false; } }; },
        get: id => displays.get(id) ?? null,
        all: () => [...displays.values()],
        ofOwner: owner => [...displays.values()].filter(d => d.owner === owner),
        /** Removes every display of an owner (a player leaving, a feature switching off). */
        releaseOwner(owner) { for (const d of api.ofOwner(owner)) d.remove(); },
        clear() { for (const d of [...displays.values()]) d.remove(); },

        /** Removes foxes of this namespace that no live display owns (call once at startup; also runs on chunk loads). */
        sweepOrphans() {
            let removed = 0;
            for (const dimId of ["overworld", "nether", "the_end"]) {
                const dim = attempt(() => world.getDimension(dimId));
                if (!dim) continue;
                for (const e of attempt(() => dim.getEntities({ type: names.FOX, tags: [names.tag] }), [])) {
                    const before = displays.size;
                    reconcile(e);
                    if (displays.size === before && !attempt(() => e.isValid, false)) removed++;
                }
            }
            return removed;
        },

        /** Displays as plain data: store with MCLite (or anything), `restore` after a restart. */
        snapshot(filter = () => true) {
            return [...displays.values()].filter(filter).map(d => ({
                dimension: attempt(() => d.dimension.id, null), anchor: { ...d.anchor }, spec: d.current(), owner: d.owner, persist: d.persist, tags: d.extraTags,
            }));
        },
        restore(snapshot) {
            return snapshot.map(s => api.spawn(world.getDimension(String(s.dimension).replace(/^minecraft:/, "")), s.anchor, s.spec, { owner: s.owner, persist: s.persist, tags: s.tags }));
        },

        /** Makes `display` show whatever block stands at `blockLocation` (states, modded blocks and all). Needs `server` pieces, see blockSource.js. */
        copyBlock: (display, blockLocation) => copyBlockToDisplay({ server, names, display, blockLocation }),

        stats() {
            const list = [...displays.values()];
            return { total: list.length, live: list.filter(d => d.state === "live").length, pending: list.filter(d => d.state === "pending").length, running: runId !== null };
        },
        stop,
    };
    return api;
}
