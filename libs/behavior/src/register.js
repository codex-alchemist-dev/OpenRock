// @openrock/behavior - Behavior-tree / utility-AI runner for scripted entities; nodes registered by the mod.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    registerNode() { throw new Error("@openrock/behavior: registerNode is not implemented"); },
    defineTree() { throw new Error("@openrock/behavior: defineTree is not implemented"); },
    attach() { throw new Error("@openrock/behavior: attach is not implemented"); },
    detach() { throw new Error("@openrock/behavior: detach is not implemented"); },
    tick() { throw new Error("@openrock/behavior: tick is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
