// OpenRock's manifest DSL JSX pragma target (OR-Track O) - the same
// classic-pragma pattern as src/entityDsl/jsx-runtime.js and MinUI's own
// jsx-runtime.ts, producing the same canonical { tag, attrs, children, line }
// node shape. A separate copy (not a shared require) rather than reusing
// entityDsl's file directly - the manifest DSL is its own IR per the plan
// ("a separate, differently-shaped IR" - declarative, not imperative), and
// keeping each DSL's pragma target self-contained means neither can be
// broken by a change intended for the other.
"use strict";

const Fragment = Symbol.for("openrock.manifest.fragment");

function flattenChildren(children) {
    const out = [];
    const walk = c => {
        if (c === null || c === undefined || c === false || c === true) return;
        if (Array.isArray(c)) { for (const x of c) walk(x); return; }
        out.push(c);
    };
    walk(children);
    return out;
}

function jsx(type, props) {
    const { children, ...attrs } = props ?? {};
    if (type === Fragment) return flattenChildren(children);
    if (typeof type === "function") return type({ ...attrs, children: flattenChildren(children) });
    if (typeof type === "string") return { tag: type, attrs, children: flattenChildren(children), line: 0 };
    throw new Error(`OpenRock manifest DSL: don't know how to build element of type ${String(type)}`);
}

const jsxs = jsx;
const jsxDEV = (type, props) => jsx(type, props);

function createElement(type, props, ...children) {
    return jsx(type, { ...(props ?? {}), children });
}

module.exports = { Fragment, jsx, jsxs, jsxDEV, createElement };
