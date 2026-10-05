// @openrock/waypoints - Markers, HUD pointers and an optional travel graph.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    addMarker() { throw new Error("@openrock/waypoints: addMarker is not implemented"); },
    removeMarker() { throw new Error("@openrock/waypoints: removeMarker is not implemented"); },
    pointerFor() { throw new Error("@openrock/waypoints: pointerFor is not implemented"); },
    linkNodes() { throw new Error("@openrock/waypoints: linkNodes is not implemented"); },
    route() { throw new Error("@openrock/waypoints: route is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
