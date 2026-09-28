// @openrock/terrain - "Bedrock has no native concept of a room, a
// connected area, or a choke point" is a real, repeatedly-hit gap this
// project has had to solve from scratch more than once. This library
// generalizes the proven bounded-flood-fill + choke-point-heuristic +
// room-coverage-tracking technique into a pure, dimension-agnostic set of
// algorithms - every real-world side effect (is this block passable? what
// hostiles are nearby?) is dependency-injected, so this library is fully
// unit-testable against a fake grid, never against a real @minecraft/server.
//
// The bounded-flood-fill cap (maxBlocks) is not a performance nicety - it's
// the actual fix for a real lag bug this project already hit once
// (an uncapped/repeated scan). Every entry point here is capped by
// construction; there is no unbounded variant.
//
// See "OR-Track L", Part 1, item 2, in the project plan document.
"use strict";

function key(x, y, z) { return `${x},${y},${z}`; }
function parseKey(k) { return k.split(",").map(Number); }
const NEIGHBOR_OFFSETS = [
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], // horizontal
    [0, 1, 0], [0, -1, 0], // one step up/down (matches the native pathfinder's own step-height behavior)
];

module.exports = function register() {
    /**
     * Bounded BFS over passable blocks starting at `origin`. Never explores
     * past `maxBlocks` cells - always terminates, by construction.
     * @param {{x:number,y:number,z:number}} origin
     * @param {object} opts
     * @param {number} [opts.maxBlocks=500]
     * @param {(x:number,y:number,z:number)=>boolean} opts.isPassable
     * @returns {{cells: Set<string>, truncated: boolean}}
     */
    function floodFillPassable(origin, { maxBlocks = 500, isPassable }) {
        if (typeof isPassable !== "function") throw new Error("@openrock/terrain: floodFillPassable() requires opts.isPassable");
        const start = key(origin.x, origin.y, origin.z);
        const visited = new Set([start]);
        const queue = [[origin.x, origin.y, origin.z]];
        let truncated = false;

        while (queue.length > 0) {
            if (visited.size >= maxBlocks) { truncated = queue.length > 0; break; }
            const [x, y, z] = queue.shift();
            for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                const nk = key(nx, ny, nz);
                if (visited.has(nk)) continue;
                if (!isPassable(nx, ny, nz)) continue;
                if (visited.size >= maxBlocks) { truncated = true; break; }
                visited.add(nk);
                queue.push([nx, ny, nz]);
            }
        }
        return { cells: visited, truncated };
    }

    // Counts contiguous passable cells along `perpAxis` centered on (x,y,z),
    // stopping at the first non-passable cell in either direction (or after
    // `maxScan` steps, so a wide-open field never scans forever).
    function measureWidth(x, y, z, perpAxis, isPassable, maxScan) {
        let width = isPassable(x, y, z) ? 1 : 0;
        for (const dir of [1, -1]) {
            for (let d = 1; d <= maxScan; d++) {
                const px = perpAxis === "x" ? x + dir * d : x;
                const pz = perpAxis === "z" ? z + dir * d : z;
                if (!isPassable(px, y, pz)) break;
                width++;
            }
        }
        return width;
    }

    /**
     * Finds candidate choke points within a flood-filled area: a cell where
     * the passage narrows to <= narrowWidth blocks (flanked by solid
     * blocks), with clearly wider space a real distance before AND after -
     * per the plan's own worked description (Section 8.4). Checks both
     * horizontal corridor axes at every cell in `cells`.
     * @param {Set<string>} cells - from floodFillPassable().
     * @param {(x:number,y:number,z:number)=>boolean} isPassable
     */
    function detectChokePoints(cells, isPassable, opts = {}) {
        const narrowWidth = opts.narrowWidth ?? 2;
        const wideWidth = opts.wideWidth ?? 3;
        const checkDistance = opts.checkDistance ?? 2;
        const results = [];

        for (const k of cells) {
            const [x, y, z] = parseKey(k);
            for (const axis of ["x", "z"]) {
                const perpAxis = axis === "x" ? "z" : "x";
                const width = measureWidth(x, y, z, perpAxis, isPassable, narrowWidth + 2);
                if (width > narrowWidth) continue;

                const beforeX = axis === "x" ? x - checkDistance : x;
                const beforeZ = axis === "z" ? z - checkDistance : z;
                const afterX = axis === "x" ? x + checkDistance : x;
                const afterZ = axis === "z" ? z + checkDistance : z;
                const beforeWidth = measureWidth(beforeX, y, beforeZ, perpAxis, isPassable, wideWidth + 2);
                const afterWidth = measureWidth(afterX, y, afterZ, perpAxis, isPassable, wideWidth + 2);

                if (beforeWidth >= wideWidth && afterWidth >= wideWidth) {
                    results.push({ x, y, z, axis, width });
                }
            }
        }
        return results;
    }

    function coarseKeyFor(x, z, cellSize) { return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`; }

    /**
     * Runs floodFillPassable() ONCE and buckets the result into a coarse
     * floor grid for coverage tracking - never call per-tick, this is
     * explicitly a once-per-room-entry operation.
     */
    function defineRoom(roomId, origin, isPassable, { maxBlocks = 500, cellSize = 2 } = {}) {
        const { cells, truncated } = floodFillPassable(origin, { maxBlocks, isPassable });
        const coverageGrid = new Map();
        for (const k of cells) {
            const [x, , z] = parseKey(k);
            const ck = coarseKeyFor(x, z, cellSize);
            if (!coverageGrid.has(ck)) coverageGrid.set(ck, "unseen");
        }
        return { roomId, bounds: cells, coverageGrid, cellSize, truncated, safe: false, lastUpdated: 0 };
    }

    /** Marks the coarse cell containing (x, z) as swept - "seen-clear" or "threat". */
    function markSweepCoverage(room, x, z, status) {
        if (status !== "seen-clear" && status !== "threat") {
            throw new Error(`@openrock/terrain: markSweepCoverage(): status must be "seen-clear" or "threat", got "${status}"`);
        }
        const ck = coarseKeyFor(x, z, room.cellSize);
        if (room.coverageGrid.has(ck)) room.coverageGrid.set(ck, status);
    }

    /**
     * A room flips "safe" when coverage crosses `threshold` (default 90%
     * seen-clear, never literally 100% - real clearing doesn't x-ray every
     * inch) AND there are zero live hostiles currently in its bounds.
     */
    function updateRoomSafety(room, { liveHostilesInBounds = 0, threshold = 0.9, now = 0 } = {}) {
        const total = room.coverageGrid.size;
        const seenClear = [...room.coverageGrid.values()].filter(v => v === "seen-clear").length;
        const coverage = total === 0 ? 1 : seenClear / total;
        room.safe = coverage >= threshold && liveHostilesInBounds === 0;
        room.lastUpdated = now;
        return room.safe;
    }

    /** A rough bounding-box reduction of a room's bounds, for corner-relative playbooks. */
    function getRoomCorners(room) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const k of room.bounds) {
            const [x, y, z] = parseKey(k);
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
    }

    return {
        api: {
            floodFillPassable, detectChokePoints,
            defineRoom, markSweepCoverage, updateRoomSafety, getRoomCorners,
        },
    };
};
