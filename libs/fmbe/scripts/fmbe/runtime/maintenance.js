// The per-tick upkeep of live displays, each step budgeted so a thousand displays never cost a thousand commands in one
// tick. Pure functions over (displays, options, host); the manager decides when to call them.

import cmds from "../commands.cjs";
import easeLib from "../ease.cjs";
import exprLib from "../expr.cjs";
import { tweenProgress } from "./sample.js";

const { stopSoundCommands } = cmds;
const { easeTree } = easeLib;
const { evaluate } = exprLib;

const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };

/** Spawns pending displays, at most `budget` per tick; a display that keeps failing is dropped after `maxAttempts`. */
export function runSpawnQueue(pending, budget, maxAttempts, host) {
    let spawned = 0;
    for (const d of pending) {
        if (spawned >= budget) break;
        if (d.state !== "pending") continue;
        try { d.materialize(); spawned++; }
        catch (e) {
            d.attempts++;
            if (d.attempts >= maxAttempts) { host.fail(new Error(`${d.label()}: gave up spawning after ${d.attempts} attempts (${e?.message ?? e})`)); d.remove(); }
        }
    }
    return spawned;
}

/** Notices displays whose entity vanished (killed, unloaded, /kill) and queues them for respawn. */
export function detectLost(displays, keepAlive, host) {
    for (const d of displays) {
        if (d.state !== "live") continue;
        if (attempt(() => d.entity.isValid, false)) continue;
        d.entity = null;
        if (keepAlive) { d.state = "pending"; d.attempts = 0; } else d.remove();
        host.onLost?.(d);
    }
}

/** A display fox is a real mob and falls or drifts; teleport any that moved more than `tolerance` back to its anchor. */
export function pinEntities(displays, budget, tolerance) {
    let fixed = 0;
    for (const d of displays) {
        if (fixed >= budget) break;
        if (!d.isLive) continue;
        attempt(() => {
            const at = d.entity.location;
            if (Math.abs(at.x - d.anchor.x) > tolerance || Math.abs(at.y - d.anchor.y) > tolerance || Math.abs(at.z - d.anchor.z) > tolerance) { d.entity.teleport(d.anchor); fixed++; }
        });
    }
    return fixed;
}

/** Client animation state can reset when a chunk reloads: re-send the chain to the stalest displays, a few per tick. */
export function reapplyStale(displays, now, every, budget) {
    let sent = 0;
    const stale = displays.filter(d => d.isLive && now - d.appliedAt >= every).sort((a, b) => a.appliedAt - b.appliedAt);
    for (const d of stale) {
        if (sent >= budget) break;
        attempt(() => { d.sendAll(); sent++; });
    }
    return sent;
}

/** Steps every gliding display one tick along its waypoint path. */
export function stepGlides(displays, now) {
    for (const d of displays) {
        const g = d.glide;
        if (!g) continue;
        const segments = g.points.length - 1;
        const elapsed = now - g.start;
        const total = segments * g.ticksPerSegment;
        const raw = Math.min(elapsed, total);
        const index = Math.min(segments - 1, Math.floor(raw / g.ticksPerSegment));
        const u = tweenProgress({ ticks: g.ticksPerSegment }, raw - index * g.ticksPerSegment);
        const eased = evaluate(easeTree(g.ease), { u });
        const a = g.points[index], b = g.points[index + 1];
        d.anchor = { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased, z: a.z + (b.z - a.z) * eased };
        if (d.isLive) attempt(() => d.entity.teleport(d.anchor));
        if (raw >= total) { d.glide = null; g.onDone?.(d); }
    }
}

/** Fox noises, muted for everyone (the wiki's stopsound list). */
export function muteFoxes(dimension) {
    for (const c of stopSoundCommands()) attempt(() => dimension.runCommand(c));
}
