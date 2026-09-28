#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/scan-scheduler.
// Run: node libs/scan-scheduler/test/scan-scheduler.test.js
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

test("createScanScheduler: rejects tierIntervals missing a required tier", () => {
    const { api } = registerLib();
    assert.throws(() => api.createScanScheduler({ tierIntervals: { active: 6, idle: 30 } }), /missing required tier "dormant"/);
});

test("createScanScheduler: rejects a non-positive-integer interval (except null for dormant)", () => {
    const { api } = registerLib();
    assert.throws(() => api.createScanScheduler({ tierIntervals: { active: 0, idle: 30, dormant: null } }), /must be a positive integer or null/);
    assert.doesNotThrow(() => api.createScanScheduler({ tierIntervals: { active: 6, idle: 30, dormant: null } }));
});

test("tick(): an active subject runs every `active` interval, never more often", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    let runCount = 0;
    scheduler.registerSubject("s1", { getTier: () => "active", run: () => { runCount++; } });

    scheduler.tick(0); // first run - never run before, so it runs immediately
    assert.strictEqual(runCount, 1);
    scheduler.tick(1); scheduler.tick(2); scheduler.tick(3); scheduler.tick(4); // still within the 5-tick window
    assert.strictEqual(runCount, 1);
    scheduler.tick(5); // exactly 5 ticks since last run
    assert.strictEqual(runCount, 2);
});

test("tick(): a dormant subject is NEVER run by tick(), no matter how many ticks pass", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    let runCount = 0;
    scheduler.registerSubject("s1", { getTier: () => "dormant", run: () => { runCount++; } });
    for (let t = 0; t < 10000; t += 100) scheduler.tick(t);
    assert.strictEqual(runCount, 0);
});

test("tick(): a subject's tier can change live between calls (e.g. combat starts), switching cadence immediately", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 2, idle: 100, dormant: null } });
    let tier = "idle";
    let runCount = 0;
    scheduler.registerSubject("s1", { getTier: () => tier, run: () => { runCount++; } });

    scheduler.tick(0); // lastRun becomes 0
    assert.strictEqual(runCount, 1);
    scheduler.tick(10); // still well under idle's 100-tick interval - lastRun stays 0, no run
    assert.strictEqual(runCount, 1);

    tier = "active"; // combat starts - active's interval is 2, and lastRun is still 0 from the idle run
    scheduler.tick(11); // 11 ticks since lastRun(0) >= active's 2-tick interval - runs immediately
    assert.strictEqual(runCount, 2);
    scheduler.tick(12); // only 1 tick since the tick-11 run, under the 2-tick interval
    assert.strictEqual(runCount, 2);
    scheduler.tick(13); // 2 ticks since the tick-11 run
    assert.strictEqual(runCount, 3);
});

test("tick(): throws a clear error if getTier() returns an unrecognized tier name", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    scheduler.registerSubject("s1", { getTier: () => "bogus", run: () => {} });
    assert.throws(() => scheduler.tick(0), /unknown tier "bogus"/);
});

test("forceRun(): runs a subject immediately regardless of tier/interval, and updates lastRun", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    let runCount = 0;
    scheduler.registerSubject("s1", { getTier: () => "dormant", run: () => { runCount++; } });
    scheduler.forceRun("s1", 42);
    assert.strictEqual(runCount, 1);
    assert.strictEqual(scheduler.getLastRun("s1"), 42);
});

test("forceRun(): throws a clear error for an unregistered id", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    assert.throws(() => scheduler.forceRun("nope", 0), /no such registered subject/);
});

test("unregisterSubject(): a removed subject is never run again and its lastRun is forgotten", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 1, idle: 30, dormant: null } });
    let runCount = 0;
    scheduler.registerSubject("s1", { getTier: () => "active", run: () => { runCount++; } });
    scheduler.tick(0);
    assert.strictEqual(runCount, 1);
    scheduler.unregisterSubject("s1");
    scheduler.tick(1); scheduler.tick(2);
    assert.strictEqual(runCount, 1, "no further runs after unregistering");
    assert.strictEqual(scheduler.getLastRun("s1"), undefined);
});

test("registerSubject(): requires real getTier and run functions", () => {
    const { api } = registerLib();
    const scheduler = api.createScanScheduler({ tierIntervals: { active: 5, idle: 30, dormant: null } });
    assert.throws(() => scheduler.registerSubject("s1", { getTier: null, run: () => {} }), /requires opts\.getTier/);
    assert.throws(() => scheduler.registerSubject("s1", { getTier: () => "active", run: null }), /requires opts\.run/);
});

console.log(`\n${passed} passed`);
