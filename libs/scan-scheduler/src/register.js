// @openrock/scan-scheduler - the tiered update-rate discipline this project
// has already been burned by not following once, generalized into a real,
// reusable primitive: NOTHING should tick unconditionally every game tick
// regardless of whether anyone is nearby. Three tiers, matching the pattern
// already proven in this project's own squad-tick design:
//   - "active"  (in combat, or a player is close): tick every few ticks.
//   - "idle"    (owner online/nearby, nothing happening): tick rarely.
//   - "dormant" (nobody around): NEVER polled - only reconciled on a real
//     event (a player joins, teleports back, opens a menu), via forceRun().
// A subject's tier is a live, dependency-injected decision (getTier()),
// re-evaluated every tick() call - a subject can move between tiers freely
// (e.g. combat starts) without ever needing to re-register.
//
// See "OR-Track L", Part 1, item 5, in the project plan document.
//
// OR-Track N (2026-09-28): hoisted to real top-level module.exports (see
// @openrock/pathfinding's header for the full rationale).
"use strict";

const KNOWN_TIERS = new Set(["active", "idle", "dormant"]);

function validateTierIntervals(tierIntervals) {
    for (const tier of KNOWN_TIERS) {
        if (!(tier in tierIntervals)) throw new Error(`@openrock/scan-scheduler: tierIntervals is missing required tier "${tier}"`);
    }
    for (const [tier, interval] of Object.entries(tierIntervals)) {
        if (!KNOWN_TIERS.has(tier)) throw new Error(`@openrock/scan-scheduler: unknown tier "${tier}" in tierIntervals - known: ${[...KNOWN_TIERS].join(", ")}`);
        if (interval === null) continue; // dormant is allowed to be null - "never polled"
        if (!Number.isInteger(interval) || interval <= 0) throw new Error(`@openrock/scan-scheduler: tierIntervals.${tier} must be a positive integer or null, got ${interval}`);
    }
}

/**
 * @param {object} [opts]
 * @param {{active:number, idle:number, dormant:number|null}} [opts.tierIntervals]
 *   Tick counts between runs per tier. `dormant: null` means "never
 *   polled at all" (the default, matching the plan's own rule that
 *   dormant subjects reconcile lazily on a real event, not a steady
 *   poll).
 */
function createScanScheduler({ tierIntervals = { active: 6, idle: 30, dormant: null } } = {}) {
    validateTierIntervals(tierIntervals);
    const subjects = new Map(); // id -> { getTier, run }
    const lastRun = new Map(); // id -> last tick run() was actually called

    function registerSubject(id, { getTier, run }) {
        if (typeof getTier !== "function") throw new Error(`@openrock/scan-scheduler: registerSubject("${id}") requires opts.getTier(id) => "active"|"idle"|"dormant"`);
        if (typeof run !== "function") throw new Error(`@openrock/scan-scheduler: registerSubject("${id}") requires opts.run(id, now)`);
        subjects.set(id, { getTier, run });
    }

    function unregisterSubject(id) {
        subjects.delete(id);
        lastRun.delete(id);
    }

    /**
     * Evaluates every registered subject once. A subject runs iff its
     * current tier has a real (non-null) interval AND enough ticks have
     * passed since its last run (or it has never run).
     */
    function tick(now) {
        const ranIds = [];
        for (const [id, subject] of subjects) {
            const tier = subject.getTier(id);
            if (!KNOWN_TIERS.has(tier)) throw new Error(`@openrock/scan-scheduler: subject "${id}"'s getTier() returned unknown tier "${tier}"`);
            const interval = tierIntervals[tier];
            if (interval === null) continue; // dormant - never polled
            const last = lastRun.get(id);
            if (last !== undefined && now - last < interval) continue;
            subject.run(id, now);
            lastRun.set(id, now);
            ranIds.push(id);
        }
        return ranIds;
    }

    /** Runs a subject unconditionally right now, bypassing its tier/interval - the real reconcile-on-event path for a dormant subject. */
    function forceRun(id, now) {
        const subject = subjects.get(id);
        if (!subject) throw new Error(`@openrock/scan-scheduler: forceRun("${id}") - no such registered subject`);
        subject.run(id, now);
        lastRun.set(id, now);
    }

    function getLastRun(id) { return lastRun.get(id); }

    return { registerSubject, unregisterSubject, tick, forceRun, getLastRun };
}

function register() {
    return { api: { createScanScheduler } };
}

module.exports = register;
module.exports.createScanScheduler = createScanScheduler;
