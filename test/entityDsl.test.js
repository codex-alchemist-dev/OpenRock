#!/usr/bin/env node
// Real proof for OR-Track M (the entity DSL) - mirrors MinUI's own
// d2-pilot-compare.js discipline: compile a real .entity.tsx through the
// real pipeline (real tsc -> requireCompiled -> EntityBuilder) and assert
// the result is structurally equivalent to mods/pathfinding-demo's
// ALREADY REAL-BDS-VERIFIED hand-written nav_test.json (same component
// groups, same environment_sensor triggers, same events) - proof the DSL
// produces genuinely correct output, not just "something."
// Run: node test/entityDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compileEntityDsl } = require("../src/entityDsl/entityCompiler.js");

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

const FIXTURE_DIR = path.join(__dirname, "fixtures", "entity-dsl-pilot");
// The ORIGINAL hand-written nav_test.json, preserved here as a permanent
// fixture (recovered from git history) - the real mod itself has since
// migrated to the entity DSL for real (mods/pathfinding-demo/entities/
// nav_test.entity.tsx), so this frozen copy is what proves byte-identical
// equivalence against the version that was actually verified against a
// real, booted Bedrock Dedicated Server, independent of the live mod's
// own ongoing changes.
const REAL_NAV_TEST = path.join(FIXTURE_DIR, "original-hand-written-nav_test.json");

test("compileEntityDsl: a real .entity.tsx compiles through real tsc + EntityBuilder to a genuine Bedrock entity document", () => {
    const output = compileEntityDsl(FIXTURE_DIR);
    assert.ok(output.bp["entities/nav_test.json"], "expected a real entities/nav_test.json output key");
    const doc = output.bp["entities/nav_test.json"];
    assert.strictEqual(doc.format_version, "1.20.0");
    assert.strictEqual(doc["minecraft:entity"].description.identifier, "prd:nav_test");
    assert.strictEqual(doc["minecraft:entity"].description.is_spawnable, true);
});

test("compileEntityDsl: <Pathfinding slots={5}/> produces the SAME real component_groups/events/environment_sensor as the hand-written, real-BDS-verified nav_test.json - proof it calls the real generateNavSlots(), not a reimplementation", () => {
    const output = compileEntityDsl(FIXTURE_DIR);
    const dslDoc = output.bp["entities/nav_test.json"]["minecraft:entity"];
    const realDoc = JSON.parse(fs.readFileSync(REAL_NAV_TEST, "utf8"))["minecraft:entity"];

    assert.deepStrictEqual(dslDoc.component_groups, realDoc.component_groups, "component_groups must match byte-for-byte");
    assert.deepStrictEqual(dslDoc.events, realDoc.events, "events must match byte-for-byte");
    assert.deepStrictEqual(
        dslDoc.components["minecraft:environment_sensor"],
        realDoc.components["minecraft:environment_sensor"],
        "environment_sensor triggers must match byte-for-byte"
    );
});

test("compileEntityDsl: typed components (Health, Movement, CollisionBox, etc.) produce the real, correct Bedrock component shapes", () => {
    const output = compileEntityDsl(FIXTURE_DIR);
    const components = output.bp["entities/nav_test.json"]["minecraft:entity"].components;
    assert.deepStrictEqual(components["minecraft:health"], { value: 20, max: 20 });
    assert.deepStrictEqual(components["minecraft:movement"], { value: 0.25 });
    assert.deepStrictEqual(components["minecraft:collision_box"], { width: 0.6, height: 1.8 });
    assert.deepStrictEqual(components["minecraft:type_family"], { family: ["mob"] });
    assert.deepStrictEqual(components["minecraft:knockback_resistance"], { value: 1 });
});

test("compileEntityDsl: a mod with no entity DSL directory at all returns an empty output, not an error", () => {
    assert.deepStrictEqual(compileEntityDsl(path.join(__dirname, "fixtures", "does-not-exist")), { bp: {}, rp: {} });
});

test("compileEntityDsl (OR-Track Q6): an unchanged directory returns the SAME cached output object - real tsc is skipped, not just fast", () => {
    const first = compileEntityDsl(FIXTURE_DIR);
    const second = compileEntityDsl(FIXTURE_DIR);
    assert.strictEqual(first, second, "a cache hit must return the exact cached object, proving compileEntityDsl() didn't recompile at all");
});

test("compileEntityDsl (OR-Track Q6): editing a real .entity.tsx file produces a genuinely fresh, different compile - the cache never serves stale output", () => {
    // A real tsc constraint hit here (not hypothetical): an absolute-path
    // import reaching outside the compiled program's own input files needs
    // a real common ancestor for tsc's rootDir inference - os.tmpdir() (C:)
    // vs. this repo (V:) are on different drives on Windows, giving tsc NO
    // common subdirectory at all ("TS5009: Cannot find the common
    // subdirectory path"). The real fix: put the scratch dir on the SAME
    // drive as the repo, not the OS temp dir.
    const workDir = fs.mkdtempSync(path.join(__dirname, "fixtures", "openrock-entitydsl-cache-test-"));
    const src = fs.readFileSync(path.join(FIXTURE_DIR, "nav_test.entity.tsx"), "utf8");
    const srcPath = path.join(workDir, "nav_test.entity.tsx");
    // The fixture's relative imports ("../../../src/...") assume its real
    // fixtures/entity-dsl-pilot/ location - rewrite to an absolute path for
    // this test's own, differently-nested temp directory.
    const absSrcDir = path.join(__dirname, "..", "src").split(path.sep).join("/");
    fs.writeFileSync(srcPath, src.replace(/\.\.\/\.\.\/\.\.\/src/g, absSrcDir));

    const before = compileEntityDsl(workDir);
    assert.strictEqual(before.bp["entities/nav_test.json"]["minecraft:entity"].components["minecraft:health"].value, 20);

    fs.writeFileSync(srcPath, src.replace("<Health value={20} />", "<Health value={7} />"));
    const after = compileEntityDsl(workDir);
    assert.strictEqual(after.bp["entities/nav_test.json"]["minecraft:entity"].components["minecraft:health"].value, 7, "a real source edit must be picked up, not masked by the cache");
    assert.notStrictEqual(before, after);

    fs.rmSync(workDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
