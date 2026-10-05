// @openrock/debug - In-game debug overlay: per-subsystem tick cost, entity counts, property sizes vs limits.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    registerProbe() { throw new Error("@openrock/debug: registerProbe is not implemented"); },
    toggleOverlay() { throw new Error("@openrock/debug: toggleOverlay is not implemented"); },
    report() { throw new Error("@openrock/debug: report is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
