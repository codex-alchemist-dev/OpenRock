#!/usr/bin/env node
// Real, end-to-end test for src/bdsTestHarness.js (OR-Track Q) - actually
// boots a real local Bedrock Dedicated Server binary and checks its real
// console output. Deliberately NOT part of `npm test`'s default chain:
// this needs a real local BDS instance (set OPENROCK_BDS_DIR, or place one
// at a sibling "bds-test" directory next to this workspace, matching the
// project's own standing convention) and takes ~10-20 real seconds per
// test (a real server boot, not a mock) - same reasoning OR-Track C2's
// actual VS Code debugger extension isn't unit-tested against a live
// extension either.
//
// Tests run strictly SEQUENTIALLY, not fire-and-collect like every other
// test file in this project - a real, physical BDS instance is one shared,
// stateful resource (one world, one port), not an independent unit under
// test each time. A first version of this file used the usual
// collect-into-an-array-of-promises pattern and two tests raced against
// the same instance, each seeing the OTHER's boot output - a real bug,
// caught by actually running this file, not assumed away.
//
// Run manually: node test/bdsTestHarness.manual.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { buildMod, resolveBundledLibraryDirs } = require("../src/buildPipeline.js");
const { findBdsInstance, runSmokeTest } = require("../src/bdsTestHarness.js");

let passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

const OPENROCK_ROOT = path.join(__dirname, "..");

async function main() {
    const bdsDir = findBdsInstance(undefined, OPENROCK_ROOT);
    if (!bdsDir) {
        console.log("SKIPPED - no real local BDS instance found (set OPENROCK_BDS_DIR, or place one at a sibling \"bds-test\" directory).");
        return;
    }

    await test(`runSmokeTest: a real, working mod (pathfinding-demo) boots cleanly against the real BDS at ${bdsDir}`, async () => {
        const built = buildMod(path.join(OPENROCK_ROOT, "mods", "pathfinding-demo"), {
            libraryDirs: resolveBundledLibraryDirs(OPENROCK_ROOT),
        });
        const result = await runSmokeTest(built, { bdsDir, timeoutMs: 15000 });
        assert.strictEqual(result.ok, true, `expected a clean boot, got errors: ${result.errors.join("\n")}`);
        assert.ok(result.packLoaded, "the pack must have genuinely reached BDS's own \"Pack Stack\" log line");
    });

    await test("runSmokeTest: a mod whose script throws at load time is REPORTED as a real failure, not silently passed", async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-bds-fail-test-"));
        const modDir = path.join(tmp, "mod");
        fs.mkdirSync(path.join(modDir, "scripts"), { recursive: true });
        fs.writeFileSync(path.join(modDir, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "bds-fail-test-mod", version: "0.1.0", namespace: "bft",
            packs: {
                behavior: { folder: "BDS Fail Test B", uuid: "b1111111-1111-1111-1111-111111111111", dataModuleUuid: "b2222222-2222-2222-2222-222222222222", scriptModuleUuid: "b3333333-3333-3333-3333-333333333333" },
                resource: { folder: "BDS Fail Test R", uuid: "b4444444-4444-4444-4444-444444444444", moduleUuid: "b5555555-5555-5555-5555-555555555555" },
            },
            content: { scriptsDir: "scripts" },
            engine: { minEngineVersion: [1, 21, 0], scriptModules: { "@minecraft/server": "2.0.0" } },
        }));
        fs.writeFileSync(path.join(modDir, "scripts", "main.js"), "throw new Error('deliberate real test failure');\n");
        const built = buildMod(modDir);
        const result = await runSmokeTest(built, { bdsDir, timeoutMs: 15000 });
        assert.strictEqual(result.ok, false, "a script that throws at load time must be reported as a real failure");
        assert.ok(result.errors.some(e => /deliberate real test failure/.test(e)), "the real error message must surface in the report");
    });

    // Re-install pathfinding-demo's real, working build as the last thing
    // this file does, so a manual run of this test never leaves the shared
    // local BDS instance pointed at the throwaway failing fixture.
    const built = buildMod(path.join(OPENROCK_ROOT, "mods", "pathfinding-demo"), {
        libraryDirs: resolveBundledLibraryDirs(OPENROCK_ROOT),
    });
    require("../src/bdsTestHarness.js").installIntoBds(bdsDir, built);

    console.log(`\n${passed} passed`);
}

main();
