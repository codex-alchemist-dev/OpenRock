// Crystal FMBE parser: `.fmbe` source -> AST. Same line-and-brace style as Crystal Cinema (and its lexer; durations like
// `4s`/`20t`/`500ms` and numbers come from there; a `px` after a number means 1/16 block).
//
//   scene "altar" persist {
//     display base block "minecraft:stone" at (0, 0, 0) scale 0.9
//     group ring at (0, 1, 0) {
//       display gem item "minecraft:diamond" at (1, 0, 0) rot (0, 45, 0) scale 0.5 system advanced
//     }
//     anim spin on ring tween rot (0, 360, 0) over 4s loop repeat auto
//   }
//
// AST:
//   Program { scenes: Scene[] }
//   Scene   { id, persist, line, col, body: Node[] }
//   Node    { type:"display", name, kind, item, props, line, col }
//         | { type:"group", name, props, body: Node[], line, col }
//         | { type:"anim",  name, target, channels, opts, line, col }
"use strict";

const { lex } = require("../crystal/lexer.js");
const { CrystalSyntaxError } = require("../crystal/errors.js");
const { textOf } = require("../crystal/text.js");
const { resolveRef } = require("../crystal/refs.js");

const PUNCT = { "(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE", ",": "COMMA" };

const KINDS = ["block", "block2d", "item"];
const LEGACY_PROPS = { scalexz: "scaleXZ", scaley: "scaleY" };

function parse(source, filename, { ns = null } = {}) {
    const tokens = lex(source, { filename, punct: PUNCT });
    const links = [];
    let p = 0;
    const peek = (o = 0) => tokens[p + o];
    const next = () => tokens[p++];
    const fail = (msg, tok = peek()) => { throw new CrystalSyntaxError(msg, source, tok.line, tok.col, filename); };
    const describe = t => (t.type === "EOF" ? "end of file" : t.type === "NEWLINE" ? "end of line" : JSON.stringify(t.value));
    const expect = (type, what) => { const t = peek(); if (t.type !== type) fail(`expected ${what ?? type} but found ${describe(t)}`); return next(); };
    const skipNewlines = () => { while (peek().type === "NEWLINE") p++; };
    const endStatement = () => {
        const t = peek();
        if (t.type !== "NEWLINE" && t.type !== "EOF" && t.type !== "RBRACE") fail(`unexpected ${describe(t)} - expected end of line`);
        if (t.type === "NEWLINE") p++;
    };
    /** A block/item id: `@ns:name` (a checked Crystal Ref) or a quoted string. */
    function itemId(what) {
        const t = peek();
        if (t.type === "STR") {
            const text = next().value;
            if (ns && text.startsWith(`${ns}:`)) {
                links.push({ kind: "blockOrItem", ns, id: text, file: filename ?? null, line: t.line, col: t.col, source });
                tokens.warnings.push({ line: t.line, col: t.col, message: `"${text}" names this project's block or item: write @:${text.slice(ns.length + 1)} (checked at build time)` });
            }
            return text;
        }
        if (t.type !== "REF") return fail(`expected ${what}: @namespace:name or a quoted id, but found ${describe(t)}`);
        next();
        let r;
        try { r = resolveRef(t.value, "blockOrItem", ns); } catch (e) { return fail(e.message, t); }
        links.push({ kind: "blockOrItem", ns: r.ns, id: r.id, file: filename ?? null, line: t.line, col: t.col, source });
        return r.value;
    }
    const isWord = (t, w) => t.type === "IDENT" && t.value === w;

    /** A number, optionally with `px` (1/16 block), or a quoted Molang expression (a client-side formula). */
    function number({ molang = false, pxOk = true, what = "a number" } = {}) {
        const t = peek();
        if (t.type === "STR" && molang) { next(); return textOf(t); }
        const n = expect("NUM", what + (molang ? " or a quoted Molang expression" : "")).value;
        if (isWord(peek(), "px")) { if (!pxOk) fail("px is not valid here"); next(); return n / 16; }
        return n;
    }
    function vec3(opts) {
        expect("LPAREN", "\"(\" starting a vector");
        const x = number(opts); expect("COMMA", "\",\"");
        const y = number(opts); expect("COMMA", "\",\"");
        const z = number(opts); expect("RPAREN", "\")\"");
        return [x, y, z];
    }

    const PROP_PARSERS = {
        at: () => vec3({ what: "a coordinate" }),
        base: () => vec3({ molang: true, what: "a coordinate" }),
        rot: () => vec3({ pxOk: false, what: "an angle in degrees" }),
        scale: () => number({ pxOk: false }),
        scaleXZ: () => number({ molang: true, pxOk: false }),
        scaleY: () => number({ molang: true, pxOk: false }),
        system: () => expect("IDENT", "a system name (advanced, basic or static)").value,
        tag: () => expect("STR", "a tag").value,
        name: () => expect("STR", "a name").value,
        var: () => { const k = expect("STR", "a Molang variable name like \"v.speed\""); return { name: k.value, value: number({ molang: true, pxOk: false }) }; },
        extend: () => {
            const e = {};
            for (;;) {
                const t = peek();
                if (!(t.type === "IDENT" && ["scale", "xrot", "yrot"].includes(t.value))) break;
                next();
                if (e[t.value] !== undefined) fail(`extend ${t.value} given twice`, t);
                e[t.value] = number({ molang: true, pxOk: false });
            }
            if (!Object.keys(e).length) fail("extend needs at least one of: scale, xrot, yrot");
            return e;
        },
    };

    /** Reads `key value` pairs until the end of the line or `{`. */
    function props(allowed, ctx) {
        const out = {};
        while (peek().type === "IDENT") {
            const k = peek();
            if (LEGACY_PROPS[k.value] && allowed.includes(LEGACY_PROPS[k.value])) {
                tokens.warnings.push({ line: k.line, col: k.col, message: `\`${k.value}\` is deprecated - write \`${LEGACY_PROPS[k.value]}\` (Crystal keywords are camelCase)` });
                k.value = LEGACY_PROPS[k.value];
            }
            if (!allowed.includes(k.value)) fail(`"${k.value}" is not valid for ${ctx} - valid: ${allowed.join(", ")}`);
            next();
            const value = PROP_PARSERS[k.value]();
            if (k.value === "tag") (out.tags ??= []).push(value);
            else if (k.value === "var") (out.vars ??= []).push([value.name, value.value]);
            else { if (out[k.value] !== undefined) fail(`"${k.value}" given twice`, k); out[k.value] = value; }
        }
        return out;
    }

    const DISPLAY_PROPS = ["at", "base", "rot", "scale", "scaleXZ", "scaleY", "system", "extend", "tag", "var", "name"];
    const GROUP_PROPS = ["at", "rot", "scale"];

    function display() {
        const head = next();
        const name = expect("IDENT", "a name for the display").value;
        const kind = expect("IDENT", `a kind (${KINDS.join(", ")})`);
        if (!KINDS.includes(kind.value)) fail(`"${kind.value}" is not a display kind - use one of: ${KINDS.join(", ")}`, kind);
        const item = itemId("the block or item");
        const pr = props(DISPLAY_PROPS, "a display");
        endStatement();
        return { type: "display", name, kind: kind.value, item, props: pr, line: head.line, col: head.col };
    }

    function group() {
        const head = next();
        const name = expect("IDENT", "a name for the group").value;
        const pr = props(GROUP_PROPS, "a group");
        expect("LBRACE", "\"{\"");
        if (peek().type === "NEWLINE") p++;
        const body = nodes(head);
        return { type: "group", name, props: pr, body, line: head.line, col: head.col };
    }

    function anim() {
        const head = next();
        const name = expect("IDENT", "a name for the animation").value;
        const on = expect("IDENT", "\"on\""); if (on.value !== "on") fail(`expected "on" but found ${describe(on)}`, on);
        const target = expect("IDENT", "the display or group to animate").value;
        const tw = expect("IDENT", "\"tween\""); if (tw.value !== "tween") fail(`expected "tween" but found ${describe(tw)}`, tw);
        const channels = {};
        const opts = {};
        let sawChannel = false;
        while (peek().type === "IDENT") {
            const k = peek();
            if (["pos", "at"].includes(k.value)) { next(); channels.pos = vec3({ what: "a coordinate" }); sawChannel = true; }
            else if (k.value === "rot") { next(); channels.rot = vec3({ pxOk: false, what: "an angle" }); sawChannel = true; }
            else if (k.value === "scale") { next(); channels.scale = number({ pxOk: false }); sawChannel = true; }
            else if (k.value === "base") { next(); channels.basepos = vec3({ what: "a coordinate" }); sawChannel = true; }
            else if (k.value === "extend") { next(); channels.extend = PROP_PARSERS.extend(); sawChannel = true; }
            else if (k.value === "item") { next(); channels.item = itemId("an item"); sawChannel = true; }
            else if (k.value === "over") { next(); opts.ticks = expect("DUR", "a duration like 2s, 20t or 500ms").value; }
            else if (k.value === "ease") { next(); opts.ease = expect("IDENT", "an easing name").value; }
            else if (k.value === "loop") { next(); opts.loop = expect("IDENT", "none, repeat or pingpong").value; }
            else if (k.value === "steps") { next(); opts.steps = expect("NUM", "a step count").value; }
            else if (k.value === "auto") { next(); opts.auto = true; }
            else fail(`"${k.value}" is not valid in an animation - channels: pos, rot, scale, base, extend, item; options: over, ease, loop, steps, auto`, k);
        }
        if (!sawChannel) fail("an animation needs at least one channel to tween (pos, rot, scale, base, extend or item)", head);
        if (opts.ticks === undefined) fail("an animation needs a duration: over <time>", head);
        endStatement();
        return { type: "anim", name, target, channels, opts, line: head.line, col: head.col };
    }

    /** Statements until the matching `}`. */
    function nodes(open) {
        const body = [];
        skipNewlines();
        while (peek().type !== "RBRACE") {
            if (peek().type === "EOF") fail("missing closing \"}\"", open);
            const t = peek();
            if (isWord(t, "display")) body.push(display());
            else if (isWord(t, "group")) body.push(group());
            else if (isWord(t, "anim")) body.push(anim());
            else fail(`unexpected ${describe(t)} - expected display, group, anim or "}"`);
            skipNewlines();
        }
        next();
        if (peek().type === "NEWLINE") p++;
        return body;
    }

    function scene() {
        const head = next();
        const id = expect("STR", "the scene id in quotes").value;
        let persist = false;
        if (isWord(peek(), "persist")) { next(); persist = true; }
        expect("LBRACE", "\"{\"");
        if (peek().type === "NEWLINE") p++;
        return { id, persist, line: head.line, col: head.col, body: nodes(head) };
    }

    const scenes = [];
    skipNewlines();
    while (peek().type !== "EOF") {
        if (!isWord(peek(), "scene")) fail(`expected "scene" but found ${describe(peek())}`);
        scenes.push(scene());
        skipNewlines();
    }
    return { scenes, warnings: tokens.warnings, links };
}

module.exports = { parse, KINDS };
