// @openrock/formation - terrain-aware slot-descriptor resolution: a "slot"
// is never a literal fixed coordinate, it's a descriptor (a rough polar
// offset from an anchor, plus elevation/cover/LOS/separation preferences)
// resolved fresh against real terrain every time it's asked for. Every
// terrain fact (ground height, line-of-sight, nearby cover) is
// dependency-injected, so this stays fully unit-testable against a fake
// world.
//
// The anti-jank hysteresis rule matters as much as the scoring itself: if a
// caller rescored every cycle with no memory of the CURRENT position,
// near-tied candidates would flip-flop visibly every tick. A candidate only
// wins if it beats the current position's own (re-scored, on today's
// terrain) score by a real margin.
//
// See "OR-Track L", Part 1, item 7, in the project plan document.
"use strict";

function polarOffset(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    // 0deg = north (-z), clockwise, matching @openrock/route-analysis's own convention.
    return { dx: Math.sin(rad) * radius, dz: -Math.cos(rad) * radius };
}

function dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

module.exports = function register() {
    /**
     * @param {{x:number,y:number,z:number}} anchor
     * @param {{idealOffset:{angle:number,minRadius:number,maxRadius:number}}} descriptor
     * @param {object} [opts]
     * @param {number} [opts.sampleCount=8]
     * @param {number} [opts.spreadDeg=30]
     */
    function sampleCandidates(anchor, descriptor, { sampleCount = 8, spreadDeg = 30 } = {}) {
        const { angle, minRadius, maxRadius } = descriptor.idealOffset;
        if (!(minRadius <= maxRadius)) throw new Error("@openrock/formation: idealOffset.minRadius must be <= maxRadius");
        const candidates = [];
        for (let i = 0; i < sampleCount; i++) {
            const frac = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
            const a = angle - spreadDeg + frac * (spreadDeg * 2);
            const r = minRadius + frac * (maxRadius - minRadius);
            const off = polarOffset(a, r);
            candidates.push({ x: anchor.x + off.dx, y: anchor.y, z: anchor.z + off.dz, angle: a, radius: r });
        }
        return candidates;
    }

    function idealPoint(anchor, descriptor) {
        const { angle, minRadius, maxRadius } = descriptor.idealOffset;
        const off = polarOffset(angle, (minRadius + maxRadius) / 2);
        return { x: anchor.x + off.dx, y: anchor.y, z: anchor.z + off.dz };
    }

    /**
     * Scores one candidate position. `context` supplies every real-world
     * fact: getGroundHeight(x,z), hasLOS(from,to), isCoverNearby(loc),
     * teammates ([{location}]), threatLocation. All optional - an omitted
     * fact simply contributes nothing to the score (never throws).
     */
    function scoreCandidate(candidate, anchor, descriptor, context = {}) {
        let score = 0;

        if (descriptor.elevationPreference && descriptor.elevationWeight && context.getGroundHeight) {
            const groundY = context.getGroundHeight(candidate.x, candidate.z);
            if (descriptor.elevationPreference === "high") {
                const referenceY = context.threatLocation ? context.threatLocation.y : anchor.y;
                score += (groundY - referenceY) * descriptor.elevationWeight;
            } else if (descriptor.elevationPreference === "match-anchor") {
                score -= Math.abs(groundY - anchor.y) * descriptor.elevationWeight;
            }
        }

        if (descriptor.requiresLOS && context.hasLOS) {
            const target = descriptor.requiresLOS === "threat" ? context.threatLocation : anchor;
            if (target && !context.hasLOS(candidate, target)) score -= 10000; // a hard gate, not a nudge
        }

        if (descriptor.coverPreference && context.isCoverNearby?.(candidate)) {
            score += descriptor.coverPreference;
        }

        score -= dist2D(candidate, idealPoint(anchor, descriptor)); // soft drift-from-ideal-geometry penalty

        if (descriptor.minSeparation && context.teammates) {
            for (const mate of context.teammates) {
                const d = dist2D(candidate, mate.location);
                if (d < descriptor.minSeparation) score -= (descriptor.minSeparation - d) * 5;
            }
        }

        return score;
    }

    /** Samples candidates and returns the single best-scoring one. */
    function resolveSlot(anchor, descriptor, context = {}, opts = {}) {
        const candidates = sampleCandidates(anchor, descriptor, opts);
        let best = null, bestScore = -Infinity;
        for (const candidate of candidates) {
            const score = scoreCandidate(candidate, anchor, descriptor, context);
            if (score > bestScore) { bestScore = score; best = candidate; }
        }
        return { candidate: best, score: bestScore };
    }

    /**
     * Like resolveSlot(), but only switches away from `currentPosition` if
     * a fresh candidate beats the CURRENT position's own re-scored value
     * by `switchMargin` - the real anti-jank fix. Pass `currentPosition:
     * null` for a member's first-ever slot assignment (nothing to compare
     * against, so the plain best candidate wins).
     */
    function resolveSlotWithHysteresis(anchor, descriptor, context, currentPosition, opts = {}) {
        const switchMargin = opts.switchMargin ?? 5;
        const resolved = resolveSlot(anchor, descriptor, context, opts);
        if (!currentPosition) return resolved;
        const currentScore = scoreCandidate(currentPosition, anchor, descriptor, context);
        if (resolved.score > currentScore + switchMargin) return resolved;
        return { candidate: currentPosition, score: currentScore };
    }

    return { api: { sampleCandidates, idealPoint, scoreCandidate, resolveSlot, resolveSlotWithHysteresis } };
};
