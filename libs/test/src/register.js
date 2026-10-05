// @openrock/test - Reusable BDS harness: spawn-all/place-all/use-all driver and content-log error collector, generalizing OR-Track Q.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    bootServer() { throw new Error("@openrock/test: bootServer is not implemented"); },
    spawnAll() { throw new Error("@openrock/test: spawnAll is not implemented"); },
    placeAll() { throw new Error("@openrock/test: placeAll is not implemented"); },
    useAll() { throw new Error("@openrock/test: useAll is not implemented"); },
    collectErrors() { throw new Error("@openrock/test: collectErrors is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
