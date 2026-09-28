#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/route-analysis.
// Run: node libs/route-analysis/test/route-analysis.test.js
"use strict";

const assert = require("assert");
const registerTerrain = require("../../terrain/src/register.js");
const registerRouteAnalysis = require("../src/register.js");

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

function makeApi() {
    const { api: terrainApi } = registerTerrain();
    const { api } = registerRouteAnalysis(null, { dependencies: { "@openrock/terrain": terrainApi } });
    return api;
}

test("detectEscapeRoutes: a capped flood-fill from a plus-shaped clearing reports the directions that never got explored", () => {
    // Deterministic by construction: NEIGHBOR_OFFSETS visits E, W, S(+z),
    // N(-z), up, down in that fixed order. With maxBlocks=3, the target's
    // own expansion visits E then W then hits the cap exactly on S - N,
    // up, down are never even queued, even though N is a real passable
    // cell, so both N and S end up "passable but never visited" = routes.
    const passable = new Set(["0,0,0", "1,0,0", "-1,0,0", "0,0,1", "0,0,-1"]); // target + E + W + S + N
    const isPassable = (x, y, z) => passable.has(`${x},${y},${z}`);
    const api = makeApi();

    const { cells, routes } = api.detectEscapeRoutes({ x: 0, y: 0, z: 0 }, isPassable, { maxBlocks: 3 });
    assert.strictEqual(cells.size, 3);
    const directions = routes.map(r => r.direction).sort();
    assert.deepStrictEqual(directions, ["N", "S"]);
});

test("detectEscapeRoutes: a fully-enclosed pocket (no way out at all) reports zero routes", () => {
    const passable = new Set(["0,0,0", "1,0,0", "-1,0,0"]); // a 3-cell dead-end pocket, nothing more
    const isPassable = (x, y, z) => passable.has(`${x},${y},${z}`);
    const api = makeApi();

    const { routes } = api.detectEscapeRoutes({ x: 0, y: 0, z: 0 }, isPassable, { maxBlocks: 200 });
    assert.deepStrictEqual(routes, []);
});

test("assignBlockers: assigns the nearest available blocker to each route", () => {
    const api = makeApi();
    const routes = [
        { direction: "N", exitCell: { x: 0, y: 0, z: -10 } },
        { direction: "S", exitCell: { x: 0, y: 0, z: 10 } },
    ];
    const blockers = [
        { id: "far-from-both", location: { x: 100, y: 0, z: 100 } },
        { id: "near-north", location: { x: 0, y: 0, z: -9 } },
        { id: "near-south", location: { x: 0, y: 0, z: 9 } },
    ];
    const { assignments, unblockedRoutes } = api.assignBlockers(routes, blockers);
    assert.strictEqual(assignments.length, 2);
    assert.strictEqual(unblockedRoutes.length, 0);
    const northAssignment = assignments.find(a => a.route.direction === "N");
    assert.strictEqual(northAssignment.blocker.id, "near-north");
    const southAssignment = assignments.find(a => a.route.direction === "S");
    assert.strictEqual(southAssignment.blocker.id, "near-south");
});

test("assignBlockers: fewer blockers than routes leaves the later routes genuinely unblocked, not double-assigned", () => {
    const api = makeApi();
    const routes = [
        { direction: "N", exitCell: { x: 0, y: 0, z: -10 } },
        { direction: "S", exitCell: { x: 0, y: 0, z: 10 } },
        { direction: "E", exitCell: { x: 10, y: 0, z: 0 } },
    ];
    const blockers = [{ id: "only-one", location: { x: 0, y: 0, z: -9 } }];
    const { assignments, unblockedRoutes } = api.assignBlockers(routes, blockers);
    assert.strictEqual(assignments.length, 1);
    assert.strictEqual(assignments[0].route.direction, "N");
    assert.strictEqual(unblockedRoutes.length, 2);
});

test("assignBlockers: no blockers at all leaves every route unblocked, never throws", () => {
    const api = makeApi();
    const routes = [{ direction: "N", exitCell: { x: 0, y: 0, z: -10 } }];
    const { assignments, unblockedRoutes } = api.assignBlockers(routes, []);
    assert.deepStrictEqual(assignments, []);
    assert.strictEqual(unblockedRoutes.length, 1);
});

console.log(`\n${passed} passed`);
