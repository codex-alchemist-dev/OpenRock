// @openrock/fmbe - Fox MBE display entities: show ANY block or item (modded included) with its real model and texture
// using only vanilla content. This CommonJS entry exposes the build-time (pure) API; the in-world runtime is the
// ES module at scripts/fmbe/index.js, imported by mods as "@openrock/fmbe".
"use strict";

const base = "../scripts/fmbe/";
const api = {
    ...require(base + "spec.cjs"),
    ...require(base + "commands.cjs"),
    ...require(base + "tween.cjs"),
    ...require(base + "ease.cjs"),
    ...require(base + "matrix.cjs"),
    ...require(base + "items.cjs"),
    expr: require(base + "expr.cjs"),
    molang: require(base + "molangEval.cjs"),
};

function register(kernel, ctx) { return { api }; }

module.exports = Object.assign(register, api);
