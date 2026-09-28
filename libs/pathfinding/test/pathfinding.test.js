#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/pathfinding.
// Run: node libs/pathfinding/test/pathfinding.test.js
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

function fakeHooks() {
    const calls = [];
    const anchors = [];
    return {
        calls,
        anchors,
        spawnAnchor: (loc, dim) => { const a = { id: `anchor${anchors.length}`, loc, dim }; anchors.push(a); calls.push(["spawnAnchor", loc]); return a; },
        teleportAnchor: (a, loc) => { a.loc = loc; calls.push(["teleportAnchor", a.id, loc]); },
        removeAnchor: a => calls.push(["removeAnchor", a.id]),
        tagEntity: (e, tag) => calls.push(["tagEntity", e.id ?? e, tag]),
        untagEntity: (e, tag) => calls.push(["untagEntity", e.id ?? e, tag]),
    };
}

test("createSlotPool: acquire returns distinct slots, release makes them reusable", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(3);
    const a = pool.acquire(), b = pool.acquire(), c = pool.acquire();
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(b, c);
    assert.strictEqual(pool.acquire(), null, "pool of 3 is exhausted after 3 acquires");
    pool.release(a);
    assert.strictEqual(pool.available(), 1);
    assert.strictEqual(pool.acquire(), a, "a released slot is handed back out again");
});

test("createSlotPool: rejects a non-positive-integer size", () => {
    const { api } = registerLib();
    assert.throws(() => api.createSlotPool(0), /positive integer/);
    assert.throws(() => api.createSlotPool(-1), /positive integer/);
    assert.throws(() => api.createSlotPool(1.5), /positive integer/);
});

test("createSlotPool: release() of a slot never acquired is a safe no-op", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(2);
    assert.doesNotThrow(() => pool.release(99));
    assert.strictEqual(pool.available(), 2);
});

test("navigateToCoordinate: spawns an anchor at the target, tags both anchor and entity with the SAME slot number", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(5);
    const hooks = fakeHooks();
    const entity = { id: "waifu1" };
    const handle = api.navigateToCoordinate(pool, entity, { x: 1, y: 2, z: 3 }, "overworld", hooks);

    assert.ok(handle);
    assert.strictEqual(hooks.anchors[0].loc.x, 1);
    assert.deepStrictEqual(hooks.calls[0], ["spawnAnchor", { x: 1, y: 2, z: 3 }]);
    const anchorTagCall = hooks.calls.find(c => c[0] === "tagEntity" && c[1] === "anchor0");
    const entityTagCall = hooks.calls.find(c => c[0] === "tagEntity" && c[1] === "waifu1");
    assert.strictEqual(anchorTagCall[2], api.slotTag(handle.slot));
    assert.strictEqual(entityTagCall[2], api.slotFilterTag(handle.slot));
});

test("navigateToCoordinate: pool exhaustion returns null instead of throwing or silently reusing a slot", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(1);
    const hooks = fakeHooks();
    const first = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    assert.ok(first);
    const second = api.navigateToCoordinate(pool, { id: "b" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    assert.strictEqual(second, null);
});

test("cancel(): removes the anchor, untags the entity, and releases the slot back to the pool", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(2);
    const hooks = fakeHooks();
    const handle = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    assert.strictEqual(pool.available(), 1);
    handle.cancel();
    assert.strictEqual(pool.available(), 2, "the slot is returned to the pool");
    assert.ok(hooks.calls.some(c => c[0] === "removeAnchor"));
    assert.ok(hooks.calls.some(c => c[0] === "untagEntity"));
});

test("cancel(): idempotent - calling it twice never double-releases the slot", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(1);
    const hooks = fakeHooks();
    const handle = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    handle.cancel();
    handle.cancel();
    assert.strictEqual(pool.available(), 1, "still only 1 - the second cancel() didn't over-release");
});

test("retarget(): teleports the SAME anchor rather than spawning a new one", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(2);
    const hooks = fakeHooks();
    const handle = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    handle.retarget({ x: 5, y: 5, z: 5 });
    assert.strictEqual(hooks.anchors.length, 1, "no second anchor was spawned");
    assert.deepStrictEqual(hooks.anchors[0].loc, { x: 5, y: 5, z: 5 });
});

test("retarget(): throws a clear error if called after cancel()", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(1);
    const hooks = fakeHooks();
    const handle = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    handle.cancel();
    assert.throws(() => handle.retarget({ x: 1, y: 1, z: 1 }), /after cancel/);
});

test("two simultaneous navigations get non-colliding slot/filter tags (proves zero cross-talk up to pool size)", () => {
    const { api } = registerLib();
    const pool = api.createSlotPool(10);
    const hooks = fakeHooks();
    const h1 = api.navigateToCoordinate(pool, { id: "a" }, { x: 0, y: 0, z: 0 }, "overworld", hooks);
    const h2 = api.navigateToCoordinate(pool, { id: "b" }, { x: 1, y: 1, z: 1 }, "overworld", hooks);
    assert.notStrictEqual(h1.slot, h2.slot);
    assert.notStrictEqual(api.slotTag(h1.slot), api.slotTag(h2.slot));
    assert.notStrictEqual(api.slotFilterTag(h1.slot), api.slotFilterTag(h2.slot));
});

console.log(`\n${passed} passed`);
