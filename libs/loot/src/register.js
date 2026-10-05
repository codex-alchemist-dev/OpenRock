// @openrock/loot - Weighted/conditional loot tables beyond vanilla, with pity and per-subject seeds; datagen emitter.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineTable() { throw new Error("@openrock/loot: defineTable is not implemented"); },
    roll() { throw new Error("@openrock/loot: roll is not implemented"); },
    setPity() { throw new Error("@openrock/loot: setPity is not implemented"); },
    emitDatagen() { throw new Error("@openrock/loot: emitDatagen is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
