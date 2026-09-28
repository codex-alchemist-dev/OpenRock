#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/perception.
// Run: node libs/perception/test/perception.test.js
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

test("hasLineOfSight: true when the raycast reports unblocked, false when blocked", () => {
    const { api } = registerLib();
    const from = { x: 0, y: 0, z: 0 }, to = { x: 10, y: 0, z: 0 };
    assert.strictEqual(api.hasLineOfSight(from, to, () => false), true);
    assert.strictEqual(api.hasLineOfSight(from, to, () => true), false);
});

test("hasLineOfSight: requires a real raycastFn", () => {
    const { api } = registerLib();
    assert.throws(() => api.hasLineOfSight({}, {}, null), /requires a real raycastFn/);
});

test("threat memory: observe() then getKnown() immediately returns the exact recorded location, age 0", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 5000 });
    memory.observe("zombie1", { x: 1, y: 2, z: 3 }, 1000);
    const known = memory.getKnown("zombie1", 1000);
    assert.deepStrictEqual(known.location, { x: 1, y: 2, z: 3 });
    assert.strictEqual(known.age, 0);
});

test("threat memory: a threat never observed returns null, never throws", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory();
    assert.strictEqual(memory.getKnown("nobody", 0), null);
});

test("threat memory: losing sight means 'investigate the last-known spot' - still queryable WITHIN the decay window", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 5000 });
    memory.observe("zombie1", { x: 5, y: 0, z: 5 }, 1000);
    const stillKnown = memory.getKnown("zombie1", 1000 + 4000); // 4s later, still under 5s decay
    assert.ok(stillKnown);
    assert.deepStrictEqual(stillKnown.location, { x: 5, y: 0, z: 5 });
    assert.strictEqual(stillKnown.age, 4000);
});

test("threat memory: genuinely forgets once the decay window has fully elapsed - not indefinite memory", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 5000 });
    memory.observe("zombie1", { x: 5, y: 0, z: 5 }, 1000);
    const expired = memory.getKnown("zombie1", 1000 + 5001);
    assert.strictEqual(expired, null);
});

test("threat memory: re-observing updates the location and resets the decay clock", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 5000 });
    memory.observe("zombie1", { x: 0, y: 0, z: 0 }, 1000);
    memory.observe("zombie1", { x: 100, y: 0, z: 100 }, 4000); // seen again, moved
    const known = memory.getKnown("zombie1", 4000);
    assert.deepStrictEqual(known.location, { x: 100, y: 0, z: 100 });
    assert.strictEqual(known.age, 0);
    // Still fresh 4999ms after the SECOND observation, not the first.
    assert.ok(memory.getKnown("zombie1", 4000 + 4999));
});

test("threat memory: forget() removes a threat immediately, regardless of decay window", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 5000 });
    memory.observe("zombie1", { x: 0, y: 0, z: 0 }, 0);
    memory.forget("zombie1");
    assert.strictEqual(memory.getKnown("zombie1", 0), null);
});

test("threat memory: knownIds() lists only ids still within their decay window", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 1000 });
    memory.observe("fresh", { x: 0, y: 0, z: 0 }, 0);
    memory.observe("stale", { x: 0, y: 0, z: 0 }, 0);
    assert.deepStrictEqual(memory.knownIds(500).sort(), ["fresh", "stale"]);
    memory.observe("fresh", { x: 0, y: 0, z: 0 }, 1000); // re-observed, so it's the only one still fresh at t=1500
    assert.deepStrictEqual(memory.knownIds(1500), ["fresh"]);
});

test("threat memory: purgeExpired() actually removes stale entries from internal storage", () => {
    const { api } = registerLib();
    const memory = api.createThreatMemory({ decayMs: 1000 });
    memory.observe("a", { x: 0, y: 0, z: 0 }, 0);
    memory.observe("b", { x: 0, y: 0, z: 0 }, 900); // still fresh at t=1500
    memory.purgeExpired(1500);
    assert.strictEqual(memory.getKnown("a", 1500), null, "purged - past its own decay window");
    assert.ok(memory.getKnown("b", 1500), "not purged - still within its own decay window");
});

console.log(`\n${passed} passed`);
