"use strict";

// Easing curves as expression trees over a progress variable `u` in [0,1] (see expr.cjs): the same curve renders to
// Molang for the client and evaluates in JS for the server. Names follow easings.net.
const { num, vr, add, sub, mul, div, lt, call, cond } = require("./expr.cjs");

const u = vr("u");
const pow = (a, n) => call("math.pow", a, n);
const sin = x => call("math.sin", x);
const cos = x => call("math.cos", x);
const oneMinus = x => sub(1, x);
const half = x => mul(x, 0.5);

// In-curves; out/inOut are derived mechanically from them so every family is guaranteed consistent.
const IN = {
    linear: x => x,
    quad: x => pow(x, 2), cubic: x => pow(x, 3), quart: x => pow(x, 4), quint: x => pow(x, 5),
    sine: x => sub(1, cos(mul(x, 90))),
    expo: x => cond(lt(0, x), pow(2, mul(10, sub(x, 1))), 0),
    circ: x => sub(1, call("math.sqrt", sub(1, pow(x, 2)))),
    back: x => { const c1 = 1.70158; return sub(mul(c1 + 1, pow(x, 3)), mul(c1, pow(x, 2))); },
    elastic: x => {
        const c4 = 120; // (2*pi)/3 in degrees
        return cond(lt(0, x), cond(lt(x, 1), mul(mul(-1, pow(2, mul(10, sub(x, 1)))), sin(mul(sub(mul(x, 10), 10.75), c4))), 1), 0);
    },
    bounce: x => sub(1, bounceOut(oneMinus(x))),
};

function bounceOut(x) {
    const n1 = 7.5625, d1 = 2.75;
    const seg = (c, k) => add(mul(n1, mul(sub(x, c / d1), sub(x, c / d1))), k);
    // piecewise on x; written as nested conditionals so it stays a single Molang expression
    return cond(lt(x, 1 / d1), mul(n1, mul(x, x)),
        cond(lt(x, 2 / d1), seg(1.5, 0.75),
            cond(lt(x, 2.5 / d1), seg(2.25, 0.9375), seg(2.625, 0.984375))));
}

/** Substitutes the progress variable inside a built tree. */
function subst(node, replacement) {
    switch (node.t) {
        case "var": return node.name === "u" ? replacement : node;
        case "num": return node;
        case "call": return { ...node, args: node.args.map(a => subst(a, replacement)) };
        case "cond": return { ...node, test: subst(node.test, replacement), yes: subst(node.yes, replacement), no: subst(node.no, replacement) };
        case "bin": return { ...node, a: subst(node.a, replacement), b: subst(node.b, replacement) };
    }
    return node;
}

const FAMILIES = Object.keys(IN);

/** @returns {string[]} every accepted easing name, e.g. "linear", "inQuad", "outCubic", "inOutBack". */
function easeNames() {
    const names = ["linear"];
    for (const f of FAMILIES) if (f !== "linear") for (const m of ["in", "out", "inOut"]) names.push(m + f[0].toUpperCase() + f.slice(1));
    return names;
}

function parseName(name) {
    if (name === "linear") return { mode: "in", family: "linear" };
    const m = /^(inOut|in|out)([A-Z][a-z]+)$/.exec(name);
    if (!m) return null;
    const family = m[2][0].toLowerCase() + m[2].slice(1);
    return IN[family] && family !== "linear" ? { mode: m[1], family } : null;
}

/** Easing tree over `x` (a node, default the variable `u`). Throws on unknown names. */
function easeTree(name, x = u) {
    const p = parseName(name);
    if (!p) throw new Error(`unknown easing "${name}" (known: ${easeNames().join(", ")})`);
    const f = IN[p.family];
    if (p.mode === "in") return f(x);
    if (p.mode === "out") return oneMinus(subst(f(vr("u")), oneMinus(x)));
    // inOut: first half eases in, second half eases out
    const lo = half(subst(f(vr("u")), mul(2, x)));
    const hi = add(0.5, half(oneMinus(subst(f(vr("u")), oneMinus(mul(2, sub(x, 0.5)) )))));
    return cond(lt(x, 0.5), lo, hi);
}

module.exports = { easeTree, easeNames, FAMILIES };
