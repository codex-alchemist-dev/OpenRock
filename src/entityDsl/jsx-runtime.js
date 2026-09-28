// OpenRock's entity DSL JSX pragma target (OR-Track M0/M1) - mirrors
// MinUI's own proven jsx-runtime.ts (github.com/codex-alchemist-dev/MinUI,
// OR-Track D2) exactly: a classic JSX pragma (not the automatic runtime),
// producing one canonical node shape - { tag, attrs, children, line } -
// deliberately identical to MinUI's own UiNode shape, so both DSLs share
// the same "one canonical IR, multiple possible authoring front ends"
// precedent. This module builds a plain node tree, NOT a rendered entity -
// there is no runtime to render into; src/entityDsl/entityBuilder.js (M2)
// is the real emission backend that walks this tree into actual Bedrock
// entity JSON.
//
// Plain JS (not TypeScript) - OpenRock's own convention throughout this
// repo - loaded via `allowJs: true` in the entity DSL's own tsconfig
// (src/entityDsl/tsconfig.template.json), same as MinUI authors would
// import a plain-JS component module.
"use strict";

const Fragment = Symbol.for("openrock.entity.fragment");

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

// `type` is either a string (a raw host tag, e.g. "ComponentGroup") or a
// component function (every real DSL component - Entity, Pathfinding,
// Health, RawComponent, etc. - is a function; the string-tag path exists
// mainly for tests and for anyone dropping to the raw tag vocabulary
// directly, matching MinUI's own jsx-runtime split).
function jsx(type, props) {
    const { children, ...attrs } = props ?? {};
    if (type === Fragment) return flattenChildren(children);
    if (typeof type === "function") return type({ ...attrs, children: flattenChildren(children) });
    if (typeof type === "string") return { tag: type, attrs, children: flattenChildren(children), line: 0 };
    throw new Error(`OpenRock entity DSL: don't know how to build element of type ${String(type)}`);
}

const jsxs = jsx;
const jsxDEV = (type, props) => jsx(type, props);

// Classic JSX pragma entry point (tsconfig: "jsx": "react",
// "jsxFactory": "OpenRockEntity.createElement",
// "jsxFragmentFactory": "OpenRockEntity.Fragment").
function createElement(type, props, ...children) {
    return jsx(type, { ...(props ?? {}), children });
}

module.exports = { Fragment, jsx, jsxs, jsxDEV, createElement };
