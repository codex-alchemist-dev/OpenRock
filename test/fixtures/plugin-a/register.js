// Dummy plugin A - registers one "greeting" hook and exports a tiny API.
// Load order and ctx.dependencies wiring for plugin-b (which depends on
// this) are asserted in test/kernel.test.js.
"use strict";

module.exports = function register(kernel, ctx) {
    const greeting = kernel.registry("greeting");
    greeting.register("hello", name => `Hello, ${name}!`);
    return { api: { shout: name => `${name.toUpperCase()}!` } };
};
