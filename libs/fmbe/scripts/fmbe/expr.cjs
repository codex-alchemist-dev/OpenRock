"use strict";

// A tiny expression tree that renders to Molang (what the client evaluates every frame) AND evaluates in JS (so every
// Molang formula this library generates is unit-testable and can be previewed/simulated on the server). Trig is in
// DEGREES, exactly like Molang.

const num = value => ({ t: "num", value });
const vr = name => ({ t: "var", name });
const bin = (op, a, b) => ({ t: "bin", op, a: lift(a), b: lift(b) });
const call = (fn, ...args) => ({ t: "call", fn, args: args.map(lift) });
const cond = (test, yes, no) => ({ t: "cond", test: lift(test), yes: lift(yes), no: lift(no) });
const lift = x => (typeof x === "number" ? num(x) : typeof x === "string" ? vr(x) : x);

const add = (a, b) => bin("+", a, b), sub = (a, b) => bin("-", a, b), mul = (a, b) => bin("*", a, b), div = (a, b) => bin("/", a, b);
const lt = (a, b) => bin("<", a, b);
const clamp = (x, lo, hi) => call("math.clamp", x, lo, hi);
const lerp = (a, b, u) => add(a, mul(sub(b, a), u));

const PREC = { "<": 1, "+": 2, "-": 2, "*": 3, "/": 3 };
const fmtNum = n => {
    if (!Number.isFinite(n)) throw new Error(`expr: non-finite number ${n}`);
    const s = String(Math.round(n * 1e6) / 1e6);
    return s === "-0" ? "0" : s;
};

/** Molang source for a tree. `v.`-prefixed variable names are emitted as written. */
function toMolang(node, parentPrec = 0) {
    switch (node.t) {
        case "num": return node.value < 0 && parentPrec > 0 ? `(${fmtNum(node.value)})` : fmtNum(node.value);
        case "var": return node.name;
        case "call": return `${node.fn}(${node.args.map(a => toMolang(a)).join(",")})`;
        case "cond": return `(${toMolang(node.test)}?${toMolang(node.yes)}:${toMolang(node.no)})`;
        case "bin": {
            const p = PREC[node.op];
            const left = toMolang(node.a, p);
            const right = toMolang(node.b, p + 1);
            const s = `${left}${node.op}${right}`;
            return p < parentPrec ? `(${s})` : s;
        }
        default: throw new Error(`expr: unknown node ${node.t}`);
    }
}

const RAD = Math.PI / 180;
const FUNCS = {
    "math.sin": x => Math.sin(x * RAD), "math.cos": x => Math.cos(x * RAD),
    "math.asin": x => Math.asin(x) / RAD, "math.acos": x => Math.acos(x) / RAD,
    "math.atan2": (y, x) => Math.atan2(y, x) / RAD,
    "math.sqrt": Math.sqrt, "math.pow": Math.pow, "math.abs": Math.abs, "math.min": Math.min, "math.max": Math.max,
    "math.clamp": (x, lo, hi) => Math.min(Math.max(x, lo), hi),
    "math.mod": (a, b) => (b === 0 ? 0 : a - b * Math.floor(a / b)), "math.floor": Math.floor, "math.ceil": Math.ceil, "math.exp": Math.exp, "math.ln": Math.log,
};

/** Evaluates a tree in JS; `env` maps variable names to numbers. */
function evaluate(node, env = {}) {
    switch (node.t) {
        case "num": return node.value;
        case "var": {
            if (!(node.name in env)) throw new Error(`expr: variable ${node.name} not in env`);
            return env[node.name];
        }
        case "call": {
            const f = FUNCS[node.fn];
            if (!f) throw new Error(`expr: unknown function ${node.fn}`);
            return f(...node.args.map(a => evaluate(a, env)));
        }
        case "cond": return evaluate(node.test, env) ? evaluate(node.yes, env) : evaluate(node.no, env);
        case "bin": {
            const a = evaluate(node.a, env), b = evaluate(node.b, env);
            switch (node.op) { case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return a / b; case "<": return a < b ? 1 : 0; }
        }
    }
    throw new Error(`expr: cannot evaluate ${node.t}`);
}

module.exports = { num, vr, bin, call, cond, lift, add, sub, mul, div, lt, clamp, lerp, toMolang, evaluate, fmtNum, FUNCS };
