// @openrock/perception - line-of-sight plus decaying threat memory, a real
// reusable primitive generalized from this project's own proven approach:
// losing sight of a threat means "investigate the last-known spot," never
// instant omniscience (seeing through walls) or instant amnesia (forgetting
// the moment LOS breaks). The actual raycast is dependency-injected (needs
// a real @minecraft/server dimension), so this stays fully unit-testable.
//
// See "OR-Track L", Part 1, item 8, in the project plan document.
//
// OR-Track N (2026-09-28): hoisted to real top-level module.exports (see
// @openrock/pathfinding's header for the full rationale).
"use strict";

/**
 * @param {{x:number,y:number,z:number}} from
 * @param {{x:number,y:number,z:number}} to
 * @param {(from,to)=>boolean} raycastFn - returns true if the ray from
 *   `from` toward `to` is BLOCKED before reaching it (a real
 *   implementation wraps dimension.getBlockFromRay()).
 */
function hasLineOfSight(from, to, raycastFn) {
    if (typeof raycastFn !== "function") throw new Error("@openrock/perception: hasLineOfSight() requires a real raycastFn(from, to) => blocked:boolean");
    return !raycastFn(from, to);
}

/**
 * @param {object} [opts]
 * @param {number} [opts.decayMs=5000] - how long a threat's last-known
 *   position stays queryable after the last time it was actually seen.
 */
function createThreatMemory({ decayMs = 5000 } = {}) {
    const entries = new Map(); // threatId -> { location, lastSeenAt }

    /** Records that `threatId` was genuinely seen at `location` at time `now`. */
    function observe(threatId, location, now) {
        entries.set(threatId, { location: { ...location }, lastSeenAt: now });
    }

    /**
     * Returns the threat's last-known position, or null if it's never
     * been observed OR the decay window has fully elapsed - this is
     * the "investigate the last-known spot, then genuinely forget"
     * behavior, not indefinite memory.
     */
    function getKnown(threatId, now) {
        const entry = entries.get(threatId);
        if (!entry) return null;
        const age = now - entry.lastSeenAt;
        if (age > decayMs) return null;
        return { location: entry.location, lastSeenAt: entry.lastSeenAt, age };
    }

    /** Explicitly forgets a threat immediately (e.g. it was killed). */
    function forget(threatId) { entries.delete(threatId); }

    /** Actually removes entries past their decay window - call periodically to bound memory size; getKnown() already treats them as gone without this. */
    function purgeExpired(now) {
        for (const [id, entry] of entries) {
            if (now - entry.lastSeenAt > decayMs) entries.delete(id);
        }
    }

    /** Every threat id currently still within its decay window. */
    function knownIds(now) {
        const ids = [];
        for (const id of entries.keys()) if (getKnown(id, now) !== null) ids.push(id);
        return ids;
    }

    return { observe, getKnown, forget, purgeExpired, knownIds };
}

function register() {
    return { api: { hasLineOfSight, createThreatMemory } };
}

module.exports = register;
module.exports.hasLineOfSight = hasLineOfSight;
module.exports.createThreatMemory = createThreatMemory;
