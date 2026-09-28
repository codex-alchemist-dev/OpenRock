// OpenRock script-bundle linter (OR-Track M3's remaining pieces) - two real,
// heuristic checks run against the FINAL BUNDLED scripts/main.js text,
// targeting the exact two real bug classes hit by hand tonight:
//
//  1. checkScriptModulesCompleteness: the script imports a real
//     "@minecraft/*" built-in module that engine.scriptModules never
//     declared - buildManifests() (buildPipeline.js) builds manifest.json's
//     "dependencies" array FROM engine.scriptModules, so a missing entry
//     here means the built pack genuinely can't load in-game (the real
//     "missing engine.scriptModules" incident from tonight).
//
//  2. scanEarlyExecutionCalls: a real `world.<method>(...)` call sitting at
//     the script's TOP LEVEL (module-load time, brace depth 0) rather than
//     inside a system.run()/event-callback/function body - the real
//     "early-execution script crash" incident from tonight (many
//     world-scoped APIs throw if called before the world has finished
//     loading).
//
// Both are deliberately heuristic, regex/depth-tracking scans over already-
// bundled text - never a real JS parser/AST. That's a conscious choice
// (matches entityLint.js's own "never a general schema validator" stance):
// good enough to catch the two real, confirmed failure classes without
// taking on a full parser dependency.
"use strict";

const IMPORT_SPECIFIER = /from\s+["'](@minecraft\/[a-z0-9-]+)["']/g;

/**
 * @param {string} js - the real bundled scripts/main.js text (esbuild output).
 * @param {Record<string,string>} declaredModules - manifest.engine.scriptModules.
 * @param {string} label - the mod name, for the issue message.
 * @returns {string[]}
 */
function checkScriptModulesCompleteness(js, declaredModules, label) {
    const issues = [];
    const declared = new Set(Object.keys(declaredModules ?? {}));
    const used = new Set();
    let m;
    IMPORT_SPECIFIER.lastIndex = 0;
    while ((m = IMPORT_SPECIFIER.exec(js))) used.add(m[1]);
    for (const mod of used) {
        if (!declared.has(mod)) {
            issues.push(`${label}: script imports "${mod}" but engine.scriptModules does not declare it - the built manifest.json's dependencies array will be missing this module, which is a real in-game load failure, not a hypothetical one`);
        }
    }
    return issues;
}

// Assigns a brace-nesting depth to every character offset in `js`, skipping
// string/template literals and comments so a "{" inside a string doesn't
// desync the count. Deliberately simple (no distinction between object-
// literal braces and block braces - both nest the same way for this
// purpose: "is this code guaranteed to run only when something ELSE calls
// this scope", which is true for both a function body and an object
// literal passed as an argument).
// depths[i] is the real brace depth at offset i, EXCEPT while inside a
// string/template literal or a comment, where it's forced to -1 (never
// equal to 0) so a risky-looking call spelled out inside a string can never
// be mistaken for a real top-level call.
function computeDepths(js) {
    const depths = new Int32Array(js.length);
    let depth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString = null;
    for (let i = 0; i < js.length; i++) {
        const c = js[i];
        const c2 = js[i + 1];
        if (inLineComment) {
            depths[i] = -1;
            if (c === "\n") inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            depths[i] = -1;
            if (c === "*" && c2 === "/") { inBlockComment = false; depths[i + 1] = -1; i++; }
            continue;
        }
        if (inString) {
            depths[i] = -1;
            if (c === "\\") { if (i + 1 < js.length) depths[i + 1] = -1; i++; continue; }
            if (c === inString) inString = null;
            continue;
        }
        depths[i] = depth;
        if (c === "/" && c2 === "/") { inLineComment = true; continue; }
        if (c === "/" && c2 === "*") { inBlockComment = true; continue; }
        if (c === '"' || c === "'" || c === "`") { inString = c; continue; }
        if (c === "{") { depth++; continue; }
        if (c === "}") { depth--; continue; }
    }
    return depths;
}

// The real, confirmed-unsafe-at-top-level API surface - methods that throw
// if the world isn't fully loaded yet. Deliberately narrow (only methods
// actually known to crash at early execution), not "every world.* method",
// to avoid false-positiving on genuinely safe top-level calls like
// `world.beforeEvents`/`world.afterEvents` event *registration* (a property
// access + .subscribe(...) call, not a world-state read/write).
const RISKY_CALL = /\bworld\.(sendMessage|getDimension|getPlayers|getAllPlayers|getEntities|playSound|setDynamicProperty|getDynamicProperty)\s*\(/g;

/**
 * @param {string} js - the real bundled scripts/main.js text.
 * @param {string} label - the mod name, for the issue message.
 * @returns {string[]}
 */
function scanEarlyExecutionCalls(js, label) {
    const issues = [];
    const depths = computeDepths(js);
    let m;
    RISKY_CALL.lastIndex = 0;
    while ((m = RISKY_CALL.exec(js))) {
        const idx = m.index;
        if (depths[idx] !== 0) continue; // inside a function/callback/block - safe
        const line = js.slice(0, idx).split("\n").length;
        issues.push(`${label}: line ${line}: real top-level (module-load-time) call to "world.${m[1]}(...)" - the world may not be loaded yet; wrap it in system.run(() => {...}) or a world.afterEvents.worldLoad listener`);
    }
    return issues;
}

module.exports = { checkScriptModulesCompleteness, scanEarlyExecutionCalls };
