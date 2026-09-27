// Dummy library B - depends on lib-a (proves load order + ctx.dependencies
// wiring), registers a second "greeting" hook alongside A's (proves the
// registry is genuinely shared across libraries), and one hook that throws
// when INVOKED (not at register time) to prove invoke() stays soft.
"use strict";

module.exports = function register(kernel, ctx) {
    const shoutedHello = ctx.dependencies["lib-a"].shout("world");
    const greeting = kernel.registry("greeting");
    greeting.register("bonjour", name => `Bonjour, ${name}!`);
    greeting.register("broken", () => { throw new Error("intentional test failure"); });
    return { api: { shoutedHello } };
};
