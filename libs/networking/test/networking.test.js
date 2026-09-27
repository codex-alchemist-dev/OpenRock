#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/networking.
// Run: node libs/networking/test/networking.test.js
"use strict";

const assert = require("assert");
const registerLib = require("../src/register.js");

let passed = 0;
const asyncTests = [];
function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === "function") {
            asyncTests.push(result.then(
                () => { passed++; console.log(`ok - ${name}`); },
                e => { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
            ));
            return;
        }
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

// A fake scriptevent bus: send() broadcasts synchronously to every
// subscriber, including the sender itself - matching real Bedrock
// scriptevent's actual world-wide broadcast behavior.
function createFakeBus() {
    const subscribers = [];
    return {
        send: (id, message) => { for (const cb of subscribers) cb({ id, message }); },
        subscribe: cb => subscribers.push(cb),
    };
}

test("send/registerHandler: a fire-and-forget message reaches the handler", () => {
    const bus = createFakeBus();
    const { api: sender } = registerLib();
    const { api: receiver } = registerLib();
    sender.bindTransport(bus);
    receiver.bindTransport(bus);

    let received;
    receiver.registerHandler("openrock:greet", payload => { received = payload; });
    sender.send("openrock:greet", { name: "World" });
    assert.deepStrictEqual(received, { name: "World" });
});

test("request/registerHandler: a request resolves with the handler's return value", async () => {
    const bus = createFakeBus();
    const { api: client } = registerLib();
    const { api: server } = registerLib();
    client.bindTransport(bus);
    server.bindTransport(bus);

    server.registerHandler("openrock:add", ({ a, b }) => a + b);
    const result = await client.request("openrock:add", { a: 2, b: 3 });
    assert.strictEqual(result, 5);
});

test("request: times out and rejects if nothing ever responds", async () => {
    const bus = createFakeBus();
    const { api: client } = registerLib();
    client.bindTransport(bus);
    // No responder registered on any channel at all.
    await assert.rejects(() => client.request("openrock:nobody-home", {}, { timeoutMs: 20 }), /timed out/);
});

test("request: a handler that throws still resolves the requester with undefined, doesn't hang", async () => {
    const bus = createFakeBus();
    const { api: client } = registerLib();
    const { api: server } = registerLib();
    client.bindTransport(bus);
    server.bindTransport(bus);
    server.registerHandler("openrock:boom", () => { throw new Error("boom"); });
    const result = await client.request("openrock:boom", {}, { timeoutMs: 200 });
    assert.strictEqual(result, undefined);
});

test("chunking: a payload larger than one chunk round-trips correctly", async () => {
    const bus = createFakeBus();
    const { api: client } = registerLib();
    const { api: server } = registerLib();
    client.bindTransport(bus);
    server.bindTransport(bus);

    const bigString = "x".repeat(5000); // several chunks at CHUNK_SIZE=1500
    server.registerHandler("openrock:echo", payload => payload);
    const result = await client.request("openrock:echo", { big: bigString, tag: "end-marker" });
    assert.strictEqual(result.big, bigString);
    assert.strictEqual(result.tag, "end-marker");
});

test("request: a requester's own self-broadcast (real scriptevent behavior) never answers its own request", async () => {
    // Regression test for a real bug caught while writing these tests:
    // since a fake/real scriptevent bus delivers every send() to every
    // subscriber INCLUDING the sender, the client used to "answer its own
    // request" (with undefined, having no handler for the channel) and
    // race that bogus self-answer against the real responder's reply.
    const bus = createFakeBus();
    const { api: client } = registerLib();
    const { api: server } = registerLib();
    client.bindTransport(bus); // subscribed BEFORE server, so self-delivery would win any race
    server.bindTransport(bus);
    server.registerHandler("openrock:add", ({ a, b }) => a + b);
    const result = await client.request("openrock:add", { a: 10, b: 20 });
    assert.strictEqual(result, 30);
});

test("send: a channel with no registered handler is a safe no-op", () => {
    const bus = createFakeBus();
    const { api } = registerLib();
    api.bindTransport(bus);
    assert.doesNotThrow(() => api.send("openrock:nobody-listening", { x: 1 }));
});

test("bindTransport not called yet: send()/request() throw a clear error instead of a cryptic one", () => {
    const { api } = registerLib();
    assert.throws(() => api.send("x", {}), /no transport bound yet/);
});

Promise.all(asyncTests).then(() => console.log(`\n${passed} passed`));
