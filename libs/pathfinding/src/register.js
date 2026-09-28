// @openrock/pathfinding - the real, hard-won answer to "Bedrock's native
// pathfinder has no query API." Generalizes the proven technique this
// ecosystem already discovered the hard way (documented at length in the
// project plan's CW/Claude-Waifus section): minecraft:behavior.follow_parent
// REQUIRES the follower and its "parent" to be the SAME entity type - it does
// NOT work via a shared family tag between two different custom entity
// types, contrary to what the AC-era code assumed. The real, working
// mechanism is minecraft:behavior.follow_mob, filtered via a real Minecraft
// Filter (has_tag) - and since a filter's tag value is baked into the entity
// JSON at author time (can't be a different runtime string per instance),
// the entity itself must pre-author N "slot" component groups, each with its
// own hardcoded follow_mob filter for a distinct tag.
//
// This library owns ONLY the JS-side slot-pool bookkeeping (allocate a free
// slot number for one navigation's duration, tag the real anchor entity with
// that slot's matching tag, release the slot when navigation ends) - the
// actual entity-JSON component groups (the "cw:navigating_slot_i"-shaped
// array) are a real, shared, generated ASSET, not JS, and live in OR-Track
// K's runtime addon so no consuming mod has to re-author its own multi-MB
// copy. Every side effect (spawning/teleporting/removing the anchor entity,
// tagging the navigating entity) is dependency-injected, so this library
// stays fully unit-testable without a real @minecraft/server.
//
// See "OR-Track L", Part 1, item 1, in the project plan document.
"use strict";

module.exports = function register() {
    /**
     * @param {number} size - total slot count (OR-Track K ships a
     *   machine-generated pool sized to the true worst case, e.g. 10,000).
     */
    function createSlotPool(size) {
        if (!Number.isInteger(size) || size <= 0) {
            throw new Error(`@openrock/pathfinding: createSlotPool(size): size must be a positive integer, got ${size}`);
        }
        const free = [];
        for (let i = size - 1; i >= 0; i--) free.push(i); // pop() gives slot 0 first
        const inUse = new Set();
        return {
            size,
            acquire() {
                if (free.length === 0) return null; // pool exhausted - caller decides how to handle it
                const slot = free.pop();
                inUse.add(slot);
                return slot;
            },
            release(slot) {
                if (!inUse.has(slot)) return; // double-release is a safe no-op, never throws
                inUse.delete(slot);
                free.push(slot);
            },
            available() { return free.length; },
            inUseCount() { return inUse.size; },
        };
    }

    function slotTag(slot) { return `openrock_anchor_slot_${slot}`; }
    function slotFilterTag(slot) { return `openrock_navigating_slot_${slot}`; }

    /**
     * Begins navigating `entity` toward (x, y, z) in `dimension`, using a
     * borrowed slot from `pool`. Returns null (no slot available - pool
     * exhausted) or a real handle: { slot, cancel() }.
     *
     * @param {object} pool - from createSlotPool().
     * @param {object} entity - the navigating entity (real API surface: has
     *   whatever `hooks.tagEntity`/`hooks.untagEntity` needs to identify it).
     * @param {{x:number,y:number,z:number}} target
     * @param {object} dimension
     * @param {object} hooks - dependency-injected side effects:
     *   spawnAnchor(location, dimension) => anchorHandle
     *   teleportAnchor(anchor, location) => void
     *   removeAnchor(anchor) => void
     *   tagEntity(entity, tag) => void
     *   untagEntity(entity, tag) => void
     */
    function navigateToCoordinate(pool, entity, target, dimension, hooks) {
        const slot = pool.acquire();
        if (slot === null) return null;

        const anchor = hooks.spawnAnchor(target, dimension);
        hooks.tagEntity(anchor, slotTag(slot));
        hooks.tagEntity(entity, slotFilterTag(slot));

        let cancelled = false;
        return {
            slot,
            retarget(newTarget) {
                if (cancelled) throw new Error("@openrock/pathfinding: retarget() called after cancel()");
                hooks.teleportAnchor(anchor, newTarget);
            },
            cancel() {
                if (cancelled) return; // idempotent
                cancelled = true;
                hooks.untagEntity(entity, slotFilterTag(slot));
                hooks.removeAnchor(anchor);
                pool.release(slot);
            },
        };
    }

    return { api: { createSlotPool, slotTag, slotFilterTag, navigateToCoordinate } };
};
