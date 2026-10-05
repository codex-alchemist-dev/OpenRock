// MinUI build stage: a package's `content.uiDir` (*.ui.html / *.ui.css) compiled by MinUI's own
// compiler (vendor/minui) into JSON UI files plus the runtime screen table (JS source text).
"use strict";

const fs = require("fs");
const path = require("path");

const MINUI_COMPILE = path.join(__dirname, "..", "vendor", "minui", "lib", "compile.js");

function walk(dir, base = dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, base, out); else out.push(path.relative(base, f).split(path.sep).join("/"));
    }
    return out.sort();
}

/** @returns {{rp: Object<string, object>, runtime: string}} */
function renderUiDir(uiDirAbs) {
    if (!fs.existsSync(MINUI_COMPILE)) throw new Error(`content.uiDir needs MinUI at vendor/minui (missing ${MINUI_COMPILE}) - run \`git submodule update --init\``);
    if (!fs.existsSync(uiDirAbs)) throw new Error(`content.uiDir "${uiDirAbs}" doesn't exist`);
    const { compileUi } = require(MINUI_COMPILE);
    const files = walk(uiDirAbs)
        .filter(f => f.endsWith(".ui.html") || f.endsWith(".ui.css"))
        .map(rel => ({ rel, text: fs.readFileSync(path.join(uiDirAbs, rel), "utf8") }));
    return compileUi(files);
}

/** MinUI's JSON UI lint (silent-failure footguns like colliding collection_index slots) over a resource-pack map. */
function lintUi(rpMap) {
    const lint = path.join(__dirname, "..", "vendor", "minui", "lib", "lintjsonui.js");
    if (!fs.existsSync(lint) || ![...rpMap.keys()].some(k => k.startsWith("ui/") && k.endsWith(".json"))) return [];
    const issues = require(lint).lintJsonUi(rpMap, "RP");
    if (process.env.OPENROCK_UI_LINT === "warn") {
        for (const i of issues) console.warn(`[openrock] UI lint (warning only): ${i}`);
        return [];
    }
    return issues;
}

module.exports = { renderUiDir, lintUi };
