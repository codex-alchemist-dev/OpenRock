// @openrock/counters - Sharded two-level counters (category -> subject) with size accounting vs the 32KB property limit and batched flush.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    increment() { throw new Error("@openrock/counters: increment is not implemented"); },
    get() { throw new Error("@openrock/counters: get is not implemented"); },
    flush() { throw new Error("@openrock/counters: flush is not implemented"); },
    sizeReport() { throw new Error("@openrock/counters: sizeReport is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
