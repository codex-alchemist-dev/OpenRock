// @openrock/help - In-game docs/tutorial pages from markdown: searchable and localized.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    registerPage() { throw new Error("@openrock/help: registerPage is not implemented"); },
    search() { throw new Error("@openrock/help: search is not implemented"); },
    open() { throw new Error("@openrock/help: open is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
