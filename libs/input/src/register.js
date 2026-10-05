// @openrock/input - Unified keybind/controller/touch abstraction over inputInfo for custom modes.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    bind() { throw new Error("@openrock/input: bind is not implemented"); },
    unbind() { throw new Error("@openrock/input: unbind is not implemented"); },
    onAction() { throw new Error("@openrock/input: onAction is not implemented"); },
    currentScheme() { throw new Error("@openrock/input: currentScheme is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
