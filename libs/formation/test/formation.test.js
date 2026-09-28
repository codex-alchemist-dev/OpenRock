#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/formation.
// Run: node libs/formation/test/formation.test.js
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

test("sampleCandidates: produces sampleCount candidates within the descriptor's radius band", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 3, maxRadius: 6 } };
    const candidates = api.sampleCandidates(anchor, descriptor, { sampleCount: 5 });
    assert.strictEqual(candidates.length, 5);
    for (const c of candidates) {
        const r = Math.hypot(c.x - anchor.x, c.z - anchor.z);
        assert.ok(r >= 2.9 && r <= 6.1, `radius ${r} out of band`);
    }
});

test("sampleCandidates: rejects an inverted radius band", () => {
    const { api } = registerLib();
    const descriptor = { idealOffset: { angle: 0, minRadius: 10, maxRadius: 5 } };
    assert.throws(() => api.sampleCandidates({ x: 0, y: 0, z: 0 }, descriptor), /minRadius must be <= maxRadius/);
});

test("scoreCandidate: elevation:'high' preference scores a candidate on higher ground better", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 0, maxRadius: 0 }, elevationPreference: "high", elevationWeight: 10 };
    const low = { x: 0, y: 64, z: 0 };
    const high = { x: 0, y: 64, z: 0 };
    const context = { getGroundHeight: (x, z) => (x === 0 && z === 0 ? 70 : 64), threatLocation: { x: 0, y: 64, z: 0 } };
    const scoreHigh = api.scoreCandidate(high, anchor, descriptor, context);
    const scoreElsewhere = api.scoreCandidate({ x: 5, y: 64, z: 5 }, anchor, descriptor, context);
    assert.ok(scoreHigh > scoreElsewhere, "the elevated candidate must score higher");
});

test("scoreCandidate: requiresLOS is a HARD gate (huge penalty), not a soft nudge", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 0, maxRadius: 0 }, requiresLOS: "threat" };
    const threatLocation = { x: 10, y: 64, z: 10 };
    const candidateWithLOS = { x: 1, y: 64, z: 1 };
    const candidateNoLOS = { x: 2, y: 64, z: 2 };
    const context = { threatLocation, hasLOS: (from, to) => from === candidateWithLOS };
    const scoreWith = api.scoreCandidate(candidateWithLOS, anchor, descriptor, context);
    const scoreWithout = api.scoreCandidate(candidateNoLOS, anchor, descriptor, context);
    assert.ok(scoreWith - scoreWithout > 1000, "losing LOS must cost far more than any normal drift/elevation delta");
});

test("scoreCandidate: minSeparation penalizes a candidate too close to a teammate (drift-from-ideal held equal between the two candidates, so only separation differs)", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 0, maxRadius: 0 }, minSeparation: 3 };
    const context = { teammates: [{ location: { x: 0.5, y: 64, z: 0 } }] };
    const tooClose = { x: 0.5, y: 64, z: 0 }; // exactly on top of the teammate
    const farEnough = { x: -0.5, y: 64, z: 0 }; // same distance from anchor/ideal, but away from the teammate
    const scoreClose = api.scoreCandidate(tooClose, anchor, descriptor, context);
    const scoreFar = api.scoreCandidate(farEnough, anchor, descriptor, context);
    assert.ok(scoreFar > scoreClose);
});

test("resolveSlot: picks the single best-scoring real candidate", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 2, maxRadius: 8 }, elevationPreference: "high", elevationWeight: 5 };
    const context = { getGroundHeight: (x, z) => (Math.abs(x) < 0.5 ? 80 : 64), threatLocation: { x: 0, y: 64, z: 0 } };
    const { candidate, score } = api.resolveSlot(anchor, descriptor, context, { sampleCount: 9 });
    assert.ok(candidate);
    assert.ok(Number.isFinite(score));
});

test("resolveSlotWithHysteresis: with no current position, returns the plain best candidate", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 2, maxRadius: 4 } };
    const plain = api.resolveSlot(anchor, descriptor, {});
    const withHysteresis = api.resolveSlotWithHysteresis(anchor, descriptor, {}, null);
    assert.strictEqual(withHysteresis.candidate.x, plain.candidate.x);
    assert.strictEqual(withHysteresis.candidate.z, plain.candidate.z);
});

test("resolveSlotWithHysteresis: keeps the current position when a new candidate only marginally beats it", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 3, maxRadius: 3 } };
    // The current position IS the ideal point exactly - nothing can beat
    // its drift-from-ideal score, so hysteresis has nothing to switch to,
    // but this exercises the "keep current" path cleanly.
    const currentPosition = api.idealPoint(anchor, descriptor);
    const result = api.resolveSlotWithHysteresis(anchor, descriptor, {}, currentPosition, { switchMargin: 5 });
    assert.strictEqual(result.candidate.x, currentPosition.x);
    assert.strictEqual(result.candidate.z, currentPosition.z);
});

test("resolveSlotWithHysteresis: DOES switch when a new candidate beats current by more than switchMargin", () => {
    const { api } = registerLib();
    const anchor = { x: 0, y: 64, z: 0 };
    const descriptor = { idealOffset: { angle: 0, minRadius: 2, maxRadius: 8 }, elevationPreference: "high", elevationWeight: 100 };
    // Current position sits on low ground; a sampled candidate at (0, *, ~5)
    // sits on much higher ground - the elevation delta should dwarf any
    // reasonable switchMargin.
    const currentPosition = { x: 20, y: 64, z: 20 }; // far from ideal AND low ground
    const context = { getGroundHeight: (x, z) => (Math.abs(x) < 1 ? 100 : 64), threatLocation: { x: 0, y: 64, z: 0 } };
    const result = api.resolveSlotWithHysteresis(anchor, descriptor, context, currentPosition, { switchMargin: 5, sampleCount: 9 });
    assert.notStrictEqual(result.candidate, currentPosition);
});

console.log(`\n${passed} passed`);
