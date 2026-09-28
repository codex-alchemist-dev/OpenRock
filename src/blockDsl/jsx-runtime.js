// Crystal Manifest-Block's JSX pragma target (OR-Track M4, see
// docs/crystal.md) - the same classic-pragma pattern as
// src/entityDsl/jsx-runtime.js and src/manifestDsl/jsx-runtime.js,
// producing the same canonical { tag, attrs, children, line } node shape.
// A separate copy (not a shared require) - each Crystal dialect's pragma
// target is deliberately self-contained, so a change intended for one
// dialect can never silently break another.
"use strict";

const Fragment = Symbol.for("openrock.block.fragment");

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
    throw new Error(`Crystal Manifest-Block: don't know how to build element of type ${String(type)}`);
}

const jsxs = jsx;
const jsxDEV = (type, props) => jsx(type, props);

function createElement(type, props, ...children) {
    return jsx(type, { ...(props ?? {}), children });
}

module.exports = { Fragment, jsx, jsxs, jsxDEV, createElement };
