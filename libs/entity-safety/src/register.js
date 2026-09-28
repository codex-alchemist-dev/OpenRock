// @openrock/entity-safety - real, hand-hit timing/bounds traps around
// entity lifecycle and dimension changes, generalized into safe wrappers so
// every mod gets the fix instead of re-discovering the bug independently.
// Three real, previously-reproduced findings (documented at length in this
// project's own CW/Claude-Waifus session history):
//
// 1. Calling entity.remove()/dimension.spawnEntity() SYNCHRONOUSLY inside a
//    playerDimensionChange callback silently "succeeds" (no thrown error)
//    but neither mutation actually takes effect - confirmed via a real
//    `/execute as @e[...]` reproduction returning no targets either way.
//    Deferring both calls into the next tick (system.run()-equivalent) is
//    the real, confirmed fix.
// 2. PlayerDimensionChangeAfterEvent's own `toLocation` field is confirmed
//    to sometimes differ meaningfully from the player's actual final
//    `player.location` (a real ~1-block Y difference was observed on a real
//    Nether portal transition) - it appears to be a pre-safety-adjustment
//    coordinate. Respawn/positioning logic should read `player.location`
//    directly, never trust the event's own location fields.
// 3. Dimensions have real, DIFFERENT vertical bounds - the Nether's is
//    narrower (Y 0-128, confirmed via a real LocationOutOfWorldBoundariesError
//    reproduction) than the Overworld's extended range. Any cross-dimension
//    coordinate needs bounds-clamping regardless of source dimension.
//
// See "OR-Track L", Part 1, item 4, in the project plan document.
"use strict";

// Current documented Bedrock world-height bounds per dimension. The Nether
// entry is the one this project has itself reproduced a real crash against;
// Overworld/End are the standard documented values, not separately
// re-verified in-game by this pass.
const DIMENSION_Y_BOUNDS = {
    overworld: { min: -64, max: 320 },
    nether: { min: 0, max: 128 },
    the_end: { min: 0, max: 256 },
};

module.exports = function register() {
    /**
     * Runs `fn` deferred via `scheduleFn` (real usage: `system.run`) rather
     * than synchronously - the confirmed fix for entity.remove()/
     * dimension.spawnEntity() silently no-op'ing when called synchronously
     * from inside a playerDimensionChange handler. Always defers,
     * unconditionally - there is no "safe to call synchronously" case this
     * helper tries to detect, since the failure is silent or would need to
     * be to catch it.
     */
    function safeDimensionChangeAction(scheduleFn, fn) {
        if (typeof scheduleFn !== "function") {
            throw new Error("@openrock/entity-safety: safeDimensionChangeAction() requires a real scheduleFn (e.g. system.run)");
        }
        if (typeof fn !== "function") {
            throw new Error("@openrock/entity-safety: safeDimensionChangeAction() requires a real fn to run");
        }
        scheduleFn(fn);
    }

    /**
     * The confirmed-correct source of a player's post-dimension-change
     * location - `player.location` directly, never a dimension-change
     * event's own `toLocation` field (which can genuinely differ from
     * where the player actually ended up, by a real, observed amount).
     */
    function resolveActualLocation(player) {
        if (!player || typeof player.location !== "object") {
            throw new Error("@openrock/entity-safety: resolveActualLocation() requires a real player with a .location");
        }
        return player.location;
    }

    /**
     * Diagnostic helper: compares a dimension-change event's own
     * `toLocation` against the player's real, current `.location`, for
     * logging/debugging drift - never a source of truth to build logic on
     * (resolveActualLocation() is that), just visibility into how much they
     * diverged this time.
     */
    function describeLocationDrift(player, event) {
        const actual = resolveActualLocation(player);
        const reported = event?.toLocation ?? null;
        if (!reported) return { actual, reported: null, drift: null };
        return {
            actual, reported,
            drift: { x: actual.x - reported.x, y: actual.y - reported.y, z: actual.z - reported.z },
        };
    }

    /** @returns {{min:number, max:number}} the real Y bounds for a known dimension id. */
    function getDimensionYBounds(dimensionId) {
        const bounds = DIMENSION_Y_BOUNDS[dimensionId];
        if (!bounds) {
            throw new Error(`@openrock/entity-safety: unknown dimensionId "${dimensionId}" - known: ${Object.keys(DIMENSION_Y_BOUNDS).join(", ")}`);
        }
        return bounds;
    }

    /**
     * Clamps `location.y` into the real bounds of `dimensionId`, leaving
     * x/z untouched (Bedrock's documented, reproduced Y-bounds violation is
     * specifically vertical - e.g. a valid Overworld Y coordinate handed
     * straight to a Nether teleport can genuinely throw
     * LocationOutOfWorldBoundariesError without this).
     */
    function clampToDimensionBounds(location, dimensionId) {
        const { min, max } = getDimensionYBounds(dimensionId);
        return { ...location, y: Math.min(max, Math.max(min, location.y)) };
    }

    return {
        api: {
            safeDimensionChangeAction,
            resolveActualLocation,
            describeLocationDrift,
            getDimensionYBounds,
            clampToDimensionBounds,
        },
    };
};
