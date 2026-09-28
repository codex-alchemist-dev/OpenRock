// Generates the real, proven "slot pool" entity JSON pieces for
// @openrock/pathfinding's navigateToCoordinate() technique: N component
// groups (one minecraft:behavior.follow_mob per slot, filtered via a real
// Minecraft Filter on a distinct has_tag value - a filter's tag value must
// be baked into the entity JSON at author time, it can't be a different
// runtime string per instance), plus the environment_sensor triggers and
// events that add/remove each slot's component group based on whether the
// entity currently carries that slot's OWN "navigating" tag
// (openrock_navigating_slot_i, from @openrock/pathfinding's slotFilterTag()).
//
// A pure function, deliberately - the real, checked-in demo entity JSON
// (mods/pathfinding-demo/bp/entities/nav_test.json) is one call of this at
// a small N for real in-game testing; OR-Track K's eventual full-scale
// (10,000-slot) shared runtime addon is meant to be the SAME generator
// called at the real production N, never a hand-maintained multi-MB file.
//
// See "OR-Track L", Part 2, in the project plan document.
"use strict";

/**
 * @param {number} slotCount
 * @param {object} [opts]
 * @param {string} [opts.anchorTagPrefix="openrock_anchor_slot_"] - must match @openrock/pathfinding's slotTag().
 * @param {string} [opts.navigatingTagPrefix="openrock_navigating_slot_"] - must match slotFilterTag().
 * @param {string} [opts.groupPrefix="openrock:slot_"]
 * @param {object} [opts.followMobDefaults] - passed through into every slot's follow_mob component.
 * @returns {{componentGroups: object, environmentSensorTrigger: object, events: object}}
 */
function generateNavSlots(slotCount, opts = {}) {
    if (!Number.isInteger(slotCount) || slotCount <= 0) {
        throw new Error(`genNavSlots: slotCount must be a positive integer, got ${slotCount}`);
    }
    const anchorTagPrefix = opts.anchorTagPrefix ?? "openrock_anchor_slot_";
    const navigatingTagPrefix = opts.navigatingTagPrefix ?? "openrock_navigating_slot_";
    const groupPrefix = opts.groupPrefix ?? "openrock:slot_";
    const followMobDefaults = opts.followMobDefaults ?? { priority: 1, speed_multiplier: 1.0, stop_distance: 1, search_range: 64 };

    const componentGroups = {};
    const triggers = [];
    const events = {};

    for (let i = 0; i < slotCount; i++) {
        const groupName = `${groupPrefix}${i}`;
        const anchorTag = `${anchorTagPrefix}${i}`;
        const navigatingTag = `${navigatingTagPrefix}${i}`;
        const activateEvent = `openrock:activate_slot_${i}`;
        const deactivateEvent = `openrock:deactivate_slot_${i}`;

        componentGroups[groupName] = {
            "minecraft:behavior.follow_mob": {
                ...followMobDefaults,
                filters: { test: "has_tag", subject: "other", value: anchorTag },
            },
        };

        // Fires (repeatedly, harmlessly - add/remove component_group is
        // idempotent) whenever this entity's own navigating-slot tag is
        // present/absent, switching the matching follow_mob group on/off.
        triggers.push({ filters: { test: "has_tag", subject: "self", value: navigatingTag }, event: activateEvent });
        triggers.push({ filters: { test: "has_tag", subject: "self", value: navigatingTag, operator: "!=" }, event: deactivateEvent });

        events[activateEvent] = { add: { component_groups: [groupName] } };
        events[deactivateEvent] = { remove: { component_groups: [groupName] } };
    }

    return { componentGroups, environmentSensorTrigger: { triggers }, events };
}

module.exports = { generateNavSlots };
