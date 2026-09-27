// @openrock/networking - an addressable namespace:channel request/response
// API over Bedrock's own /scriptevent mechanism
// (system.sendScriptEvent/system.afterEvents.scriptEventReceive), with a
// chunked-JSON-payload convention: a real scriptevent message has a length
// ceiling that's varied across Bedrock versions, so any payload is split
// into CHUNK_SIZE-sized pieces and reassembled on the receiving end before
// being handed to a handler - callers never see chunking at all.
//
// Three shapes:
//   - send(channel, payload) - fire-and-forget, no response expected.
//   - request(channel, payload, {timeoutMs}) - returns a Promise resolving
//     with the responder's return value (or rejecting on timeout).
//   - registerHandler(channel, fn) - fn(payload) is called for every
//     send()/request() aimed at `channel`; its return value (if any)
//     becomes the response to a request().
//
// Never imports @minecraft/server - bindTransport({send, subscribe}) is
// supplied by the real bootstrap code (real usage: `bindTransport({ send:
// (id, msg) => system.sendScriptEvent(id, msg), subscribe: cb =>
// system.afterEvents.scriptEventReceive.subscribe(ev => cb({id: ev.id,
// message: ev.message})) })`), keeping this fully unit-testable.
//
// Known simplification, stated honestly rather than silently assumed away:
// reqIds are unique per bindTransport() instance (prefixed with a random
// per-instance tag), not globally coordinated - two entirely separate
// senders racing a request on the exact same channel at the exact same
// instant could theoretically collide. Not addressed here; flagged for
// whoever eventually needs cross-instance-safe correlation.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

const CHUNK_SIZE = 1500; // conservative, well under any real scriptevent message-length ceiling

module.exports = function register() {
    const handlers = new Map(); // channel -> handlerFn(payload) => response|undefined
    const pending = new Map(); // reqId -> {resolve, reject, timer}
    const inbound = new Map(); // `${channel}|${reqId}|${kind}` -> { chunks: string[], receivedCount }
    const instanceTag = Math.random().toString(36).slice(2, 8);
    let transport = null; // { send(channel, message) }
    let nextReqId = 1;

    function registerHandler(channel, handlerFn) {
        handlers.set(channel, handlerFn);
    }

    function sendEnvelope(channel, kind, reqId, payload) {
        if (!transport) throw new Error(`@openrock/networking: no transport bound yet - call bindTransport() first`);
        const json = JSON.stringify({ value: payload });
        const total = Math.max(1, Math.ceil(json.length / CHUNK_SIZE));
        for (let seq = 0; seq < total; seq++) {
            const chunk = json.slice(seq * CHUNK_SIZE, (seq + 1) * CHUNK_SIZE);
            transport.send(channel, JSON.stringify({ reqId, seq, total, kind, chunk }));
        }
    }

    /** Fire-and-forget - no response is awaited or expected. */
    function send(channel, payload) {
        sendEnvelope(channel, "message", `${instanceTag}-${nextReqId++}`, payload);
    }

    /** @returns {Promise<any>} resolves with the responder's return value, or rejects on timeout. */
    function request(channel, payload, { timeoutMs = 5000 } = {}) {
        const reqId = `${instanceTag}-${nextReqId++}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(reqId);
                reject(new Error(`@openrock/networking: request to "${channel}" timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            pending.set(reqId, { resolve, reject, timer });
            sendEnvelope(channel, "request", reqId, payload);
        });
    }

    function onReceive({ id: channel, message }) {
        let envelope;
        try { envelope = JSON.parse(message); }
        catch (e) { console.warn(`[openrock:networking] malformed envelope on "${channel}": ${e}`); return; }
        const { reqId, seq, total, kind, chunk } = envelope;

        // Real scriptevents broadcast to EVERYONE, including the sender
        // itself - a "request" envelope this exact instance originated
        // (its reqId is a key in our own `pending` map) will bounce back to
        // us too. Without this check we'd "answer our own request" (with
        // whatever our own handler for that channel returns, or undefined
        // if we have none) and race that bogus self-answer against the
        // real responder's actual reply. A "message" envelope has no such
        // ambiguity (self-delivery of a fire-and-forget message is
        // harmless, even expected), so this guard is request-only.
        if (kind === "request" && pending.has(reqId)) return;

        const bufferKey = `${channel}|${reqId}|${kind}`;
        if (!inbound.has(bufferKey)) inbound.set(bufferKey, { chunks: new Array(total), receivedCount: 0 });
        const buf = inbound.get(bufferKey);
        if (buf.chunks[seq] === undefined) buf.receivedCount++;
        buf.chunks[seq] = chunk;
        if (buf.receivedCount < total) return; // still waiting on more chunks
        inbound.delete(bufferKey);

        let payload;
        try { payload = JSON.parse(buf.chunks.join("")).value; }
        catch (e) { console.warn(`[openrock:networking] malformed reassembled payload on "${channel}": ${e}`); return; }

        if (kind === "request") {
            const handler = handlers.get(channel);
            let response;
            try { response = handler ? handler(payload) : undefined; }
            catch (e) { console.warn(`[openrock:networking] handler for "${channel}" threw: ${e}`); response = undefined; }
            sendEnvelope(channel, "response", reqId, response);
        } else if (kind === "response") {
            const p = pending.get(reqId);
            if (p) { clearTimeout(p.timer); pending.delete(reqId); p.resolve(payload); }
        } else if (kind === "message") {
            const handler = handlers.get(channel);
            if (handler) { try { handler(payload); } catch (e) { console.warn(`[openrock:networking] handler for "${channel}" threw: ${e}`); } }
        }
    }

    /** @param {{send: (channel: string, message: string) => void, subscribe: (cb: (event: {id: string, message: string}) => void) => void}} transportImpl */
    function bindTransport({ send: sendFn, subscribe }) {
        transport = { send: sendFn };
        subscribe(onReceive);
    }

    return { api: { registerHandler, send, request, bindTransport } };
};
