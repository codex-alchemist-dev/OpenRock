// @openrock/schedule - Time-of-day/calendar task scheduler for any subjects with catch-up semantics for unloaded chunks.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    schedule() { throw new Error("@openrock/schedule: schedule is not implemented"); },
    cancel() { throw new Error("@openrock/schedule: cancel is not implemented"); },
    runDue() { throw new Error("@openrock/schedule: runDue is not implemented"); },
    catchUp() { throw new Error("@openrock/schedule: catchUp is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
