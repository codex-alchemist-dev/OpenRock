#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/events.
// Run: node libs/events/test/events.test.js
"use strict";

const assert = require("assert");
const registerLib = require("../src/register.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

test("on/dispatch: a handler fires with the dispatched data", () => {
    const { api } = registerLib();
    let received;
    api.on("entityHurt", "test-handler", data => { received = data; });
    api.dispatch("entityHurt", { damage: 5 });
    assert.deepStrictEqual(received, { damage: 5 });
});

test("dispatch: multiple handlers for the same event all fire, in registration order", () => {
    const { api } = registerLib();
    const order = [];
    api.on("x", "first", () => order.push("first"));
    api.on("x", "second", () => order.push("second"));
    api.dispatch("x", {});
    assert.deepStrictEqual(order, ["first", "second"]);
});

test("dispatch: a throwing handler is caught and logged, other handlers still run", () => {
    const { api } = registerLib();
    let secondRan = false;
    api.on("x", "throws", () => { throw new Error("boom"); });
    api.on("x", "survives", () => { secondRan = true; });
    assert.doesNotThrow(() => api.dispatch("x", {}));
    assert.strictEqual(secondRan, true);
});

test("dispatch: an event with no registered handlers is a safe no-op", () => {
    const { api } = registerLib();
    assert.doesNotThrow(() => api.dispatch("nobody-listening", {}));
});

test("off: removes exactly the named handler, leaves others intact", () => {
    const { api } = registerLib();
    const order = [];
    api.on("x", "a", () => order.push("a"));
    api.on("x", "b", () => order.push("b"));
    api.off("x", "a");
    api.dispatch("x", {});
    assert.deepStrictEqual(order, ["b"]);
});

test("bindNativeEvent: wires a real subscribeFn callback to dispatch()", () => {
    const { api } = registerLib();
    let capturedCallback;
    const fakeSubscribeFn = cb => { capturedCallback = cb; };
    api.bindNativeEvent("entityHurt", fakeSubscribeFn);
    let received;
    api.on("entityHurt", "listener", data => { received = data; });
    capturedCallback({ damage: 10 }); // simulate the native event firing
    assert.deepStrictEqual(received, { damage: 10 });
});

test("bindNativeEvent: calling it twice for the same event only subscribes once", () => {
    const { api } = registerLib();
    let subscribeCallCount = 0;
    const fakeSubscribeFn = () => { subscribeCallCount++; };
    api.bindNativeEvent("entityHurt", fakeSubscribeFn);
    api.bindNativeEvent("entityHurt", fakeSubscribeFn); // a second library wiring the same native event
    assert.strictEqual(subscribeCallCount, 1);
});

console.log(`\n${passed} passed`);
