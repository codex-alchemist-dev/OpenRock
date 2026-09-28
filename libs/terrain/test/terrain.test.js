#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/terrain.
// Run: node libs/terrain/test/terrain.test.js
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

// A fake voxel grid: a Set of "x,y,z" strings that are passable, everything
// else solid. y is fixed at 0 for these 2D-shaped test layouts (real usage
// varies y too, but the algorithms themselves don't special-case it).
function makeGrid(coords) {
    const set = new Set(coords.map(([x, z]) => `${x},0,${z}`));
    return (x, y, z) => y === 0 && set.has(`${x},0,${z}`);
}

function rect(x0, x1, z0, z1) {
    const out = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push([x, z]);
    return out;
}

test("floodFillPassable: finds every connected passable cell in an open room, none outside it", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 4, 0, 4)); // a 5x5 room
    const { cells, truncated } = api.floodFillPassable({ x: 2, y: 0, z: 2 }, { maxBlocks: 100, isPassable });
    assert.strictEqual(cells.size, 25);
    assert.strictEqual(truncated, false);
    assert.ok(cells.has("0,0,0"));
    assert.ok(!cells.has("5,0,0"), "outside the room, never visited");
});

test("floodFillPassable: respects maxBlocks - never exceeds the cap, always terminates", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 20, 0, 20)); // a big 21x21 open area
    const { cells, truncated } = api.floodFillPassable({ x: 10, y: 0, z: 10 }, { maxBlocks: 30, isPassable });
    assert.ok(cells.size <= 30, `expected <= 30 cells, got ${cells.size}`);
    assert.strictEqual(truncated, true);
});

test("floodFillPassable: an isolated single cell with no passable neighbors returns just itself", () => {
    const { api } = registerLib();
    const isPassable = makeGrid([[5, 5]]);
    const { cells } = api.floodFillPassable({ x: 5, y: 0, z: 5 }, { maxBlocks: 50, isPassable });
    assert.deepStrictEqual([...cells], ["5,0,5"]);
});

test("floodFillPassable: requires isPassable, throws a clear error otherwise", () => {
    const { api } = registerLib();
    assert.throws(() => api.floodFillPassable({ x: 0, y: 0, z: 0 }, { maxBlocks: 10 }), /requires opts\.isPassable/);
});

test("detectChokePoints: finds a real 1-wide corridor connecting two wide rooms", () => {
    const { api } = registerLib();
    // Room A: x 0-4, z 0-4. Corridor: x 5-7, z 2 (1-wide). Room B: x 8-12, z 0-4.
    const coords = [...rect(0, 4, 0, 4), [5, 2], [6, 2], [7, 2], ...rect(8, 12, 0, 4)];
    const isPassable = makeGrid(coords);
    const { cells } = api.floodFillPassable({ x: 2, y: 0, z: 2 }, { maxBlocks: 200, isPassable });
    const chokePoints = api.detectChokePoints(cells, isPassable, { narrowWidth: 1, wideWidth: 3, checkDistance: 2 });
    assert.ok(chokePoints.length > 0, "expected at least one choke point candidate in the corridor");
    assert.ok(chokePoints.some(cp => cp.x === 6 && cp.z === 2), "the corridor's middle cell should be flagged");
});

test("detectChokePoints: a wide-open field has zero choke points", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 10, 0, 10));
    const { cells } = api.floodFillPassable({ x: 5, y: 0, z: 5 }, { maxBlocks: 200, isPassable });
    const chokePoints = api.detectChokePoints(cells, isPassable, { narrowWidth: 2, wideWidth: 3, checkDistance: 2 });
    assert.deepStrictEqual(chokePoints, []);
});

test("defineRoom/markSweepCoverage/updateRoomSafety: a fully-swept room with no hostiles is safe", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 3, 0, 3)); // a 4x4 room
    const room = api.defineRoom("room1", { x: 1, y: 0, z: 1 }, isPassable, { maxBlocks: 100, cellSize: 2 });
    assert.strictEqual(room.safe, false, "starts unsafe - nothing swept yet");
    for (const key of room.coverageGrid.keys()) {
        const [gx, gz] = key.split(",").map(Number);
        api.markSweepCoverage(room, gx * room.cellSize, gz * room.cellSize, "seen-clear");
    }
    const safe = api.updateRoomSafety(room, { liveHostilesInBounds: 0, threshold: 0.9, now: 42 });
    assert.strictEqual(safe, true);
    assert.strictEqual(room.safe, true);
    assert.strictEqual(room.lastUpdated, 42);
});

test("updateRoomSafety: a live hostile in bounds keeps the room unsafe even at full coverage", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 3, 0, 3));
    const room = api.defineRoom("room2", { x: 1, y: 0, z: 1 }, isPassable, { maxBlocks: 100, cellSize: 2 });
    for (const key of room.coverageGrid.keys()) room.coverageGrid.set(key, "seen-clear");
    const safe = api.updateRoomSafety(room, { liveHostilesInBounds: 1, threshold: 0.9 });
    assert.strictEqual(safe, false);
});

test("updateRoomSafety: partial coverage below threshold stays unsafe", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 5, 0, 5)); // more coarse cells
    const room = api.defineRoom("room3", { x: 2, y: 0, z: 2 }, isPassable, { maxBlocks: 100, cellSize: 2 });
    const keys = [...room.coverageGrid.keys()];
    // Mark only half as seen-clear.
    for (let i = 0; i < Math.floor(keys.length / 2); i++) room.coverageGrid.set(keys[i], "seen-clear");
    const safe = api.updateRoomSafety(room, { liveHostilesInBounds: 0, threshold: 0.9 });
    assert.strictEqual(safe, false);
});

test("markSweepCoverage: rejects an invalid status", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 2, 0, 2));
    const room = api.defineRoom("room4", { x: 1, y: 0, z: 1 }, isPassable, { maxBlocks: 50 });
    assert.throws(() => api.markSweepCoverage(room, 0, 0, "bogus"), /"seen-clear" or "threat"/);
});

test("getRoomCorners: returns a real bounding box over the room's flood-filled bounds", () => {
    const { api } = registerLib();
    const isPassable = makeGrid(rect(0, 4, 0, 6));
    const room = api.defineRoom("room5", { x: 2, y: 0, z: 3 }, isPassable, { maxBlocks: 100 });
    const corners = api.getRoomCorners(room);
    assert.deepStrictEqual(corners.min, { x: 0, y: 0, z: 0 });
    assert.deepStrictEqual(corners.max, { x: 4, y: 0, z: 6 });
});

console.log(`\n${passed} passed`);
