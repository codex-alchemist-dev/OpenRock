// @openrock/fx - Named effect recipes (particle + sound + animation sequences) shared by cinema and abilities.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineRecipe() { throw new Error("@openrock/fx: defineRecipe is not implemented"); },
    play() { throw new Error("@openrock/fx: play is not implemented"); },
    stop() { throw new Error("@openrock/fx: stop is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
