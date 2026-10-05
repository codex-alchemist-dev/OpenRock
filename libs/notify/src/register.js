// @openrock/notify - Toast/action-bar/title queue with priorities and dedupe; localization-aware.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    notify() { throw new Error("@openrock/notify: notify is not implemented"); },
    clear() { throw new Error("@openrock/notify: clear is not implemented"); },
    setChannelPolicy() { throw new Error("@openrock/notify: setChannelPolicy is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
