// @openrock/route-analysis - "cut off escape routes before engaging" needs a
// real notion of routes at the squad-tactical level, not just per-member
// pathing. This reuses @openrock/terrain's bounded flood-fill for the exact
// same reason the project plan calls out: a room's exits and a target's
// flee routes are literally the same computation, just re-centered - flood
// fill the passable area around a point, and find where that bounded area
// connects onward to a larger/different space.
//
// A frontier cell (a passable neighbor of a visited cell that itself was
// NEVER visited by the bounded flood-fill) is exactly an "exit point": if
// the flood-fill's cap wasn't reached, the search would have visited every
// reachable passable cell, so a passable-but-unvisited neighbor can only
// mean the area genuinely continues past the bounded region - a real route.
// A short dead end that fully fits inside maxBlocks naturally produces NO
// frontier cells (every direction hits a non-passable block within the
// cap), so "discard a direction that dead-ends within a short distance"
// falls out of this for free, with no separate length check needed.
//
// See "OR-Track L", Part 1, item 3, in the project plan document.
"use strict";

const OCTANTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function octantOf(dx, dz) {
    // Bedrock's +Z is south, +X is east (matches how the rest of this
    // ecosystem already treats world coordinates elsewhere in the plan).
    const angle = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; // 0 = north, clockwise
    return OCTANTS[Math.round(angle / 45) % 8];
}

function dist3D(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

module.exports = function register(kernel, ctx) {
    const terrain = ctx.dependencies["@openrock/terrain"];

    /**
     * @param {{x:number,y:number,z:number}} target
     * @param {(x:number,y:number,z:number)=>boolean} isPassable
     * @param {object} [opts]
     * @param {number} [opts.maxBlocks=200]
     * @returns {{cells: Set<string>, routes: Array<{direction:string, exitCell:{x,y,z}}>}}
     */
    function detectEscapeRoutes(target, isPassable, { maxBlocks = 200 } = {}) {
        const { cells } = terrain.floodFillPassable(target, { maxBlocks, isPassable });
        const seenOctants = new Map(); // direction -> closest exit cell found so far

        for (const k of cells) {
            const [x, y, z] = k.split(",").map(Number);
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                const nk = `${nx},${ny},${nz}`;
                if (cells.has(nk)) continue;
                if (!isPassable(nx, ny, nz)) continue;
                // A genuine frontier cell - the flood-filled area continues
                // past here. Bucket it into a compass octant relative to the
                // ORIGINAL target position, not the local cell, so routes
                // reflect real flee directions away from the target.
                const dir = octantOf(nx - target.x, nz - target.z);
                const exitCell = { x: nx, y: ny, z: nz };
                const existing = seenOctants.get(dir);
                if (!existing || dist3D(target, exitCell) < dist3D(target, existing)) {
                    seenOctants.set(dir, exitCell);
                }
            }
        }

        const routes = [...seenOctants.entries()].map(([direction, exitCell]) => ({ direction, exitCell }));
        return { cells, routes };
    }

    /**
     * Assigns blockers to routes, nearest-blocker-first, greedy. If there
     * are fewer blockers than routes, prioritizes the routes earlier in
     * `routes` (caller's job to order by "worse outcome if left open" per
     * the plan's own priority note) and leaves the rest unblocked rather
     * than trying to cover everything ("a collapsing net," per spec).
     * @param {Array<{direction:string, exitCell:{x,y,z}}>} routes
     * @param {Array<object>} blockers - each with a `.location` field.
     * @returns {{assignments: Array<{route, blocker}>, unblockedRoutes: Array}}
     */
    function assignBlockers(routes, blockers) {
        const available = [...blockers];
        const assignments = [];
        const unblockedRoutes = [];

        for (const route of routes) {
            if (available.length === 0) { unblockedRoutes.push(route); continue; }
            let bestIdx = 0, bestDist = Infinity;
            for (let i = 0; i < available.length; i++) {
                const d = dist3D(available[i].location, route.exitCell);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            const [blocker] = available.splice(bestIdx, 1);
            assignments.push({ route, blocker });
        }
        return { assignments, unblockedRoutes };
    }

    return { api: { detectEscapeRoutes, assignBlockers } };
};
