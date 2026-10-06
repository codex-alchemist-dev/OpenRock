"use strict";

// A small Molang interpreter - just enough for the expressions FMBE systems use (assignments, `??`, `?:`, `||`, `&&`,
// comparisons, arithmetic, nested assignment, math.* functions, q.life_time). It exists so the library can SIMULATE a
// display chain on the server: lint generated commands for variables read before they are set, preview what a spec
// renders as, and unit-test the formulas. Trig is in degrees (Molang). Unset variables read as undefined (0 in arithmetic).

const { FUNCS } = require("./expr.cjs");

const canon = name => name.toLowerCase().replace(/^variable\./, "v.").replace(/^query\./, "q.");

function tokenize(src) {
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_.]*)|(\?\?|\|\||&&|==|!=|<=|>=|[-+*\/<>?:;(),=!]))/gy;
    let m;
    let last = 0;
    while (last < src.length && (m = re.exec(src))) {
        last = re.lastIndex;
        if (m[1] !== undefined) toks.push({ t: "num", v: Number(m[1]) });
        else if (m[2] !== undefined) toks.push({ t: "id", v: m[2] });
        else toks.push({ t: "op", v: m[3] });
    }
    if (src.slice(last).trim()) throw new Error(`molang: cannot tokenize near "${src.slice(last, last + 20)}"`);
    return toks;
}

function parse(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    const eat = v => { const t = toks[i]; if (!t || t.v !== v || t.t !== "op") throw new Error(`molang: expected "${v}" near token ${i} of "${src.slice(0, 60)}"`); i++; };
    const is = v => toks[i] && toks[i].t === "op" && toks[i].v === v;

    function statement() { return assign(); }
    function assign() {
        const left = ternary();
        if (is("=")) {
            if (left.k !== "var") throw new Error("molang: can only assign to a variable");
            i++;
            return { k: "set", name: left.name, value: assign() };
        }
        return left;
    }
    function ternary() {
        const test = coalesce();
        if (is("?")) {
            i++;
            const yes = assign();
            eat(":");
            return { k: "cond", test, yes, no: assign() };
        }
        return test;
    }
    const level = (ops, next) => () => {
        let a = next();
        while (toks[i] && toks[i].t === "op" && ops.includes(toks[i].v)) { const op = toks[i++].v; a = { k: "bin", op, a, b: next() }; }
        return a;
    };
    function unary() {
        if (is("-")) { i++; return { k: "neg", a: unary() }; }
        if (is("!")) { i++; return { k: "not", a: unary() }; }
        return primary();
    }
    function primary() {
        const t = toks[i++];
        if (!t) throw new Error(`molang: unexpected end of "${src.slice(0, 60)}"`);
        if (t.t === "num") return { k: "num", v: t.v };
        if (t.t === "op" && t.v === "(") { const e = assign(); eat(")"); return e; }
        if (t.t === "id") {
            if (is("(")) {
                i++;
                const args = [];
                if (!is(")")) { do { args.push(assign()); } while (is(",") && ++i); }
                eat(")");
                return { k: "call", fn: t.v.toLowerCase(), args };
            }
            return { k: "var", name: canon(t.v) };
        }
        throw new Error(`molang: unexpected "${t.v}" in "${src.slice(0, 60)}"`);
    }
    const mulLevel = level(["*", "/"], unary);
    const addLevel = level(["+", "-"], mulLevel);
    const relLevel = level(["<", ">", "<=", ">="], addLevel);
    const eqLevel = level(["==", "!="], relLevel);
    const andLevel = level(["&&"], eqLevel);
    const orLevel = level(["||"], andLevel);
    const coalesceLevel = level(["??"], orLevel);
    function coalesce() { return coalesceLevel(); }

    const stmts = [];
    while (i < toks.length) {
        if (is(";")) { i++; continue; }
        stmts.push(statement());
        if (i < toks.length) eat(";");
    }
    return stmts;
}

/**
 * Runs `source` against `vars` (mutated in place; keys are canonical lower-case names like "v.xpos").
 * @param {{query?: object, undefinedReads?: Set<string>}} [opts] query: q.* values (q.life_time...). undefinedReads collects names read while unset.
 * @returns {number} value of the last statement
 */
function run(source, vars, opts = {}) {
    const stmts = parse(source);
    const query = opts.query ?? {};
    const num = x => (x === undefined ? 0 : x);
    function ev(n) {
        switch (n.k) {
            case "num": return n.v;
            case "var": {
                if (n.name.startsWith("q.")) return query[n.name.slice(2)] ?? 0;
                if (!(n.name in vars)) opts.undefinedReads?.add(n.name);
                return vars[n.name];
            }
            case "set": { const v = num(ev(n.value)); vars[n.name] = v; return v; }
            case "neg": return -num(ev(n.a));
            case "not": return num(ev(n.a)) ? 0 : 1;
            case "cond": return num(ev(n.test)) ? ev(n.yes) : ev(n.no);
            case "call": {
                const f = FUNCS[n.fn];
                if (!f) throw new Error(`molang: unknown function ${n.fn}`);
                return f(...n.args.map(a => num(ev(a))));
            }
            case "bin": {
                if (n.op === "??") { const l = ev(n.a); return l === undefined ? ev(n.b) : l; }
                if (n.op === "||") return num(ev(n.a)) ? 1 : (num(ev(n.b)) ? 1 : 0);
                if (n.op === "&&") return num(ev(n.a)) && num(ev(n.b)) ? 1 : 0;
                const a = num(ev(n.a)), b = num(ev(n.b));
                switch (n.op) {
                    case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return b === 0 ? 0 : a / b;
                    case "<": return a < b ? 1 : 0; case ">": return a > b ? 1 : 0; case "<=": return a <= b ? 1 : 0; case ">=": return a >= b ? 1 : 0;
                    case "==": return a === b ? 1 : 0; case "!=": return a !== b ? 1 : 0;
                }
            }
        }
        throw new Error(`molang: cannot evaluate ${n.k}`);
    }
    let last = 0;
    for (const s of stmts) last = ev(s);
    return last;
}

/** Extracts the quoted Molang string from a `playanimation ... "<expr>" <controller>` command. */
function expressionOf(command) {
    const m = /"([^"]*)"/.exec(command);
    if (!m) throw new Error(`no quoted expression in: ${command.slice(0, 60)}`);
    return m[1];
}

module.exports = { run, parse, expressionOf };
