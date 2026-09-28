#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/entity-safety.
// Run: node libs/entity-safety/test/entity-safety.test.js
"use strict";

const assert = require("assert");
const registerLib = require("../src/register.js");

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

test("safeDimensionChangeAction: always defers via scheduleFn, never calls fn synchronously", () => {
    const { api } = registerLib();
    let ran = false;
    let scheduled = null;
    api.safeDimensionChangeAction(cb => { scheduled = cb; }, () => { ran = true; });
    assert.strictEqual(ran, false, "must not have run yet - it was only scheduled");
    scheduled();
    assert.strictEqual(ran, true);
});

test("safeDimensionChangeAction: rejects a non-function scheduleFn or fn with a clear error", () => {
    const { api } = registerLib();
    assert.throws(() => api.safeDimensionChangeAction(null, () => {}), /requires a real scheduleFn/);
    assert.throws(() => api.safeDimensionChangeAction(fn => fn(), null), /requires a real fn/);
});

test("resolveActualLocation: reads player.location directly, not any event field", () => {
    const { api } = registerLib();
    const player = { location: { x: 1, y: 2, z: 3 } };
    assert.deepStrictEqual(api.resolveActualLocation(player), { x: 1, y: 2, z: 3 });
});

test("resolveActualLocation: throws a clear error for a player-shaped object with no real location", () => {
    const { api } = registerLib();
    assert.throws(() => api.resolveActualLocation({}), /requires a real player/);
    assert.throws(() => api.resolveActualLocation(null), /requires a real player/);
});

test("describeLocationDrift: reports the real difference between the event's toLocation and the player's actual location", () => {
    const { api } = registerLib();
    const player = { location: { x: 10, y: 65, z: 10 } };
    const event = { toLocation: { x: 10, y: 64, z: 10 } }; // the real ~1-block Y difference this project observed
    const drift = api.describeLocationDrift(player, event);
    assert.deepStrictEqual(drift.actual, { x: 10, y: 65, z: 10 });
    assert.deepStrictEqual(drift.reported, { x: 10, y: 64, z: 10 });
    assert.deepStrictEqual(drift.drift, { x: 0, y: 1, z: 0 });
});

test("describeLocationDrift: no event/toLocation reports null drift instead of throwing", () => {
    const { api } = registerLib();
    const player = { location: { x: 0, y: 0, z: 0 } };
    assert.deepStrictEqual(api.describeLocationDrift(player, null), { actual: { x: 0, y: 0, z: 0 }, reported: null, drift: null });
    assert.deepStrictEqual(api.describeLocationDrift(player, {}), { actual: { x: 0, y: 0, z: 0 }, reported: null, drift: null });
});

test("getDimensionYBounds: returns the real, narrower Nether bounds distinct from the Overworld's", () => {
    const { api } = registerLib();
    assert.deepStrictEqual(api.getDimensionYBounds("nether"), { min: 0, max: 128 });
    assert.deepStrictEqual(api.getDimensionYBounds("overworld"), { min: -64, max: 320 });
    assert.notDeepStrictEqual(api.getDimensionYBounds("nether"), api.getDimensionYBounds("overworld"));
});

test("getDimensionYBounds: an unknown dimension id throws a clear, named error", () => {
    const { api } = registerLib();
    assert.throws(() => api.getDimensionYBounds("bogus_dimension"), /unknown dimensionId "bogus_dimension"/);
});

test("clampToDimensionBounds: an Overworld-valid Y that's out of Nether bounds gets clamped, x/z untouched", () => {
    const { api } = registerLib();
    const overworldLocation = { x: 100, y: 200, z: -50 }; // valid in the Overworld, way out of the Nether's 0-128
    const clamped = api.clampToDimensionBounds(overworldLocation, "nether");
    assert.deepStrictEqual(clamped, { x: 100, y: 128, z: -50 });
});

test("clampToDimensionBounds: a Y already in bounds is left exactly unchanged", () => {
    const { api } = registerLib();
    const location = { x: 5, y: 64, z: 5 };
    assert.deepStrictEqual(api.clampToDimensionBounds(location, "overworld"), location);
});

test("clampToDimensionBounds: clamps a negative Y up to a dimension's real floor too, not just the ceiling", () => {
    const { api } = registerLib();
    const location = { x: 0, y: -50, z: 0 }; // valid Overworld depth, below the Nether's floor of 0
    assert.deepStrictEqual(api.clampToDimensionBounds(location, "nether"), { x: 0, y: 0, z: 0 });
});

console.log(`\n${passed} passed`);
