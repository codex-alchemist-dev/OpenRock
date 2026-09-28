#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for tools/lib/genNavSlots.js.
// Run: node test/genNavSlots.test.js
"use strict";

const assert = require("assert");
const { generateNavSlots } = require("../tools/lib/genNavSlots.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

test("generateNavSlots: rejects a non-positive-integer slot count", () => {
    assert.throws(() => generateNavSlots(0), /slotCount must be a positive integer/);
    assert.throws(() => generateNavSlots(-1), /slotCount must be a positive integer/);
    assert.throws(() => generateNavSlots(1.5), /slotCount must be a positive integer/);
});

test("generateNavSlots: produces exactly one component group per slot, keyed by index", () => {
    const { componentGroups } = generateNavSlots(3);
    assert.deepStrictEqual(Object.keys(componentGroups).sort(), ["openrock:slot_0", "openrock:slot_1", "openrock:slot_2"]);
});

test("generateNavSlots: each component group's follow_mob filter targets a DISTINCT anchor tag matching @openrock/pathfinding's slotTag() convention", () => {
    const { componentGroups } = generateNavSlots(3);
    const tags = Object.values(componentGroups).map(g => g["minecraft:behavior.follow_mob"].filters.value);
    assert.deepStrictEqual(tags, ["openrock_anchor_slot_0", "openrock_anchor_slot_1", "openrock_anchor_slot_2"]);
    assert.strictEqual(new Set(tags).size, 3, "every slot's anchor tag must be unique - zero cross-talk between slots");
});

test("generateNavSlots: two activate/deactivate triggers per slot, keyed to slotFilterTag()'s convention", () => {
    const { environmentSensorTrigger } = generateNavSlots(2);
    assert.strictEqual(environmentSensorTrigger.triggers.length, 4);
    const activateFor0 = environmentSensorTrigger.triggers.find(t => t.event === "openrock:activate_slot_0");
    assert.deepStrictEqual(activateFor0.filters, { test: "has_tag", subject: "self", value: "openrock_navigating_slot_0" });
    const deactivateFor0 = environmentSensorTrigger.triggers.find(t => t.event === "openrock:deactivate_slot_0");
    assert.strictEqual(deactivateFor0.filters.operator, "!=");
});

test("generateNavSlots: events add/remove exactly the matching component group, nothing else", () => {
    const { events } = generateNavSlots(2);
    assert.deepStrictEqual(events["openrock:activate_slot_1"], { add: { component_groups: ["openrock:slot_1"] } });
    assert.deepStrictEqual(events["openrock:deactivate_slot_1"], { remove: { component_groups: ["openrock:slot_1"] } });
});

test("generateNavSlots: custom tag/group prefixes are honored end to end", () => {
    const { componentGroups, environmentSensorTrigger } = generateNavSlots(1, {
        anchorTagPrefix: "cw_anchor_",
        navigatingTagPrefix: "cw_nav_",
        groupPrefix: "cw:s_",
    });
    assert.deepStrictEqual(Object.keys(componentGroups), ["cw:s_0"]);
    assert.strictEqual(componentGroups["cw:s_0"]["minecraft:behavior.follow_mob"].filters.value, "cw_anchor_0");
    assert.strictEqual(environmentSensorTrigger.triggers[0].filters.value, "cw_nav_0");
});

test("generateNavSlots: followMobDefaults are merged into every slot's follow_mob component", () => {
    const { componentGroups } = generateNavSlots(1, { followMobDefaults: { priority: 5, speed_multiplier: 2.0, stop_distance: 3, search_range: 32 } });
    const followMob = componentGroups["openrock:slot_0"]["minecraft:behavior.follow_mob"];
    assert.strictEqual(followMob.priority, 5);
    assert.strictEqual(followMob.speed_multiplier, 2.0);
    assert.strictEqual(followMob.filters.value, "openrock_anchor_slot_0", "the filter itself is never overridable by followMobDefaults");
});

test("generateNavSlots: scales cleanly to a larger real pool with no duplicate keys anywhere", () => {
    const { componentGroups, events } = generateNavSlots(200);
    assert.strictEqual(Object.keys(componentGroups).length, 200);
    assert.strictEqual(Object.keys(events).length, 400); // activate + deactivate per slot
});

console.log(`\n${passed} passed`);
