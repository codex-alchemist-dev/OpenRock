// Dummy library - throws AT register() TIME (a load-time contract
// violation), not when one of its hooks is later invoked. Used to prove
// loadLibraries() fails the whole load loudly for this, unlike a throwing
// hook invocation (which createRegistry().invoke() catches and logs).
"use strict";

module.exports = function register() {
    throw new Error("intentional register()-time failure");
};
