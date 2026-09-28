#!/usr/bin/env node
// Real tests for src/scriptLint.js (OR-Track M3's remaining two checks).
// Run: node test/scriptLint.test.js
"use strict";

const assert = require("assert");
const { checkScriptModulesCompleteness, scanEarlyExecutionCalls } = require("../src/scriptLint.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

test("checkScriptModulesCompleteness: an import matching a declared engine.scriptModules entry reports no issues", () => {
    const js = `import { world } from "@minecraft/server";\n`;
    assert.deepStrictEqual(checkScriptModulesCompleteness(js, { "@minecraft/server": "1.0.0" }, "my-mod"), []);
});

test("checkScriptModulesCompleteness: an import with NO matching engine.scriptModules entry is caught - the real 'missing engine.scriptModules' incident", () => {
    const js = `import { world } from "@minecraft/server";\nimport { ActionFormData } from "@minecraft/server-ui";\n`;
    const issues = checkScriptModulesCompleteness(js, { "@minecraft/server": "1.0.0" }, "my-mod");
    assert.ok(issues.some(i => /imports "@minecraft\/server-ui" but engine\.scriptModules does not declare it/.test(i)));
});

test("checkScriptModulesCompleteness: no engine.scriptModules at all still catches a real import", () => {
    const js = `import { world } from "@minecraft/server";\n`;
    const issues = checkScriptModulesCompleteness(js, undefined, "my-mod");
    assert.ok(issues.some(i => i.includes("@minecraft/server")));
});

test("scanEarlyExecutionCalls: a real top-level world.sendMessage(...) call is caught - the real 'early-execution script crash' incident", () => {
    const js = `import { world } from "@minecraft/server";\nworld.sendMessage("hello");\n`;
    const issues = scanEarlyExecutionCalls(js, "my-mod");
    assert.ok(issues.some(i => /top-level.*world\.sendMessage/.test(i)));
});

test("scanEarlyExecutionCalls: the SAME call wrapped in system.run(() => {...}) is safe and not flagged", () => {
    const js = `import { world, system } from "@minecraft/server";\nsystem.run(() => {\n  world.sendMessage("hello");\n});\n`;
    assert.deepStrictEqual(scanEarlyExecutionCalls(js, "my-mod"), []);
});

test("scanEarlyExecutionCalls: wrapped inside an ordinary top-level function declaration (never called) is still treated as safe - depth-based, not call-graph-based", () => {
    const js = `import { world } from "@minecraft/server";\nfunction setup() {\n  world.sendMessage("hello");\n}\n`;
    assert.deepStrictEqual(scanEarlyExecutionCalls(js, "my-mod"), []);
});

test("scanEarlyExecutionCalls: a risky-looking method name inside a STRING literal is never flagged", () => {
    const js = `const s = "world.sendMessage(x) looks risky but is just a string";\n`;
    assert.deepStrictEqual(scanEarlyExecutionCalls(js, "my-mod"), []);
});

test("scanEarlyExecutionCalls: world.afterEvents.worldLoad.subscribe(...) at top level (safe registration, not a risky method) is not flagged", () => {
    const js = `import { world } from "@minecraft/server";\nworld.afterEvents.worldLoad.subscribe(() => {\n  world.sendMessage("safe now");\n});\n`;
    assert.deepStrictEqual(scanEarlyExecutionCalls(js, "my-mod"), []);
});

console.log(`\n${passed} passed`);
