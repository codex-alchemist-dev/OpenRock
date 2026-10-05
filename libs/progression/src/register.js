// @openrock/progression - Generic named values, xp curves and prerequisite/cost unlock graphs; derived values from registered formulas. No built-in stats.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineValue() { throw new Error("@openrock/progression: defineValue is not implemented"); },
    defineCurve() { throw new Error("@openrock/progression: defineCurve is not implemented"); },
    defineNode() { throw new Error("@openrock/progression: defineNode is not implemented"); },
    grant() { throw new Error("@openrock/progression: grant is not implemented"); },
    unlock() { throw new Error("@openrock/progression: unlock is not implemented"); },
    registerFormula() { throw new Error("@openrock/progression: registerFormula is not implemented"); },
    recompute() { throw new Error("@openrock/progression: recompute is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
