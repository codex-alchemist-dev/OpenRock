// @openrock/events - a pub/sub layer over Bedrock's own
// world.beforeEvents/afterEvents. OpenRock, not each mod, makes the ONE
// real .subscribe() call per underlying native event (bindNativeEvent());
// every mod/library instead registers a named handler (on()) and gets
// fanned out to by dispatch(), each wrapped in its own try/catch - a
// throwing handler never breaks another mod's handler for the same event,
// matching kernel.js's own invoke() soft-catch philosophy.
//
// Handler order is registration order, which - since every library's
// register() call already runs in libLoader.js's topologically-sorted
// dependency order - IS dependency-graph order for free, no separate
// sorting needed.
//
// This module never imports @minecraft/server (kept fully unit-testable,
// matching this whole project's convention) - bindNativeEvent() takes a
// `subscribeFn(callback)` supplied by the actual Bedrock bootstrap code
// (real usage: `bindNativeEvent("entityHurt", cb =>
// world.afterEvents.entityHurt.subscribe(cb))`), never touches
// `@minecraft/server` itself.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

module.exports = function register() {
    const handlersByEvent = new Map(); // eventName -> [{name, fn}]
    const boundEvents = new Set(); // eventName -> already has a native subscribe call

    /** Registers a handler for `eventName`, run whenever dispatch(eventName, ...) fires. */
    function on(eventName, handlerName, fn) {
        if (!handlersByEvent.has(eventName)) handlersByEvent.set(eventName, []);
        handlersByEvent.get(eventName).push({ name: handlerName, fn });
    }

    /** Removes a single previously-registered handler by name. */
    function off(eventName, handlerName) {
        const list = handlersByEvent.get(eventName);
        if (!list) return;
        handlersByEvent.set(eventName, list.filter(h => h.name !== handlerName));
    }

    /**
     * Fans `eventData` out to every handler registered for `eventName`, in
     * registration order, each isolated by its own try/catch - one
     * handler's throw is logged and skipped, never propagated to the next
     * handler or the caller.
     */
    function dispatch(eventName, eventData) {
        for (const { name, fn } of handlersByEvent.get(eventName) ?? []) {
            try { fn(eventData); }
            catch (e) { console.warn(`[openrock:events] handler "${name}" for "${eventName}" threw: ${e}`); }
        }
    }

    /**
     * The ONE real native subscribe call for `eventName` - idempotent, so
     * calling this more than once for the same eventName (e.g. two
     * libraries both wanting "entityHurt" wired up) is a safe no-op after
     * the first. `subscribeFn(callback)` is expected to call
     * `callback(data)` every time the underlying native event fires.
     */
    function bindNativeEvent(eventName, subscribeFn) {
        if (boundEvents.has(eventName)) return;
        boundEvents.add(eventName);
        subscribeFn(data => dispatch(eventName, data));
    }

    return { api: { on, off, dispatch, bindNativeEvent } };
};
