// @openrock/saves - A/B-slot copy-validate-commit persistence with checksums, mirror recovery and soft-delete windows, generic over record kinds.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    write() { throw new Error("@openrock/saves: write is not implemented"); },
    read() { throw new Error("@openrock/saves: read is not implemented"); },
    recover() { throw new Error("@openrock/saves: recover is not implemented"); },
    softDelete() { throw new Error("@openrock/saves: softDelete is not implemented"); },
    restore() { throw new Error("@openrock/saves: restore is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
