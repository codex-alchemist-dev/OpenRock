// @openrock/relations - Open-ended pairwise relationship tracks between any two ids; track names and growth rules defined by the mod.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineTrack() { throw new Error("@openrock/relations: defineTrack is not implemented"); },
    get() { throw new Error("@openrock/relations: get is not implemented"); },
    adjust() { throw new Error("@openrock/relations: adjust is not implemented"); },
    partnersOf() { throw new Error("@openrock/relations: partnersOf is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
