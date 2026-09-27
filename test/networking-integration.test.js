#!/usr/bin/env node
// Integration test: @openrock/networking loaded for real through
// libLoader.js's loadLibraries(), proving two independent library entries
// share one networking instance via ctx.dependencies and can genuinely
// request/respond across that shared instance.
// Run: node test/networking-integration.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { loadLibraries } = require("../src/libLoader.js");

let passed = 0;
const asyncTests = [];
function test(name, fn) {
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
}

const networkingEntry = {
    manifest: require(path.join(__dirname, "..", "libs", "networking", "openrock.library.json")),
    register: require(path.join(__dirname, "..", "libs", "networking", "src", "register.js")),
};

function createFakeBus() {
    const subscribers = [];
    return {
        send: (id, message) => { for (const cb of subscribers) cb({ id, message }); },
        subscribe: cb => subscribers.push(cb),
    };
}

function consumerEntry(name, capture) {
    return {
        manifest: { openrockVersion: 1, kind: "library", name, version: "1.0.0", entry: "x", dependsOn: { "@openrock/networking": { type: "library" } } },
        register: (kernel, ctx) => { capture(ctx.dependencies["@openrock/networking"]); return { api: {} }; },
    };
}

test("loadLibraries: two libraries in the SAME load share one @openrock/networking instance via ctx.dependencies", () => {
    let apiFromA, apiFromB;
    loadLibraries([networkingEntry, consumerEntry("consumer-a", api => { apiFromA = api; }), consumerEntry("consumer-b", api => { apiFromB = api; })]);
    assert.strictEqual(apiFromA, apiFromB, "both consumers must receive the exact same networking instance, not two separate ones");
});

test("loadLibraries: two SEPARATE loads (simulating client and server script environments) each get their own instance that can genuinely talk over a shared bus", async () => {
    // Real Bedrock client/server scripting IS two separate running
    // processes, each with their own module state - this is the realistic
    // shape request/response actually needs (see the self-echo guard in
    // register.js: a single shared instance can't meaningfully
    // request/respond to itself, by design).
    let clientApi, serverApi;
    loadLibraries([networkingEntry, consumerEntry("client-lib", api => { clientApi = api; })]);
    loadLibraries([networkingEntry, consumerEntry("server-lib", api => { serverApi = api; })]);

    const bus = createFakeBus();
    clientApi.bindTransport(bus);
    serverApi.bindTransport(bus);
    serverApi.registerHandler("openrock:ping", () => "pong");
    const result = await clientApi.request("openrock:ping", {});
    assert.strictEqual(result, "pong");
});

Promise.all(asyncTests).then(() => console.log(`\n${passed} passed`));
