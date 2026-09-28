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
const REAL_NAV_TEST = path.join(__dirname, "..", "mods", "pathfinding-demo", "bp", "entities", "nav_test.json");

test("compileEntityDsl: a real .entity.tsx compiles through real tsc + EntityBuilder to a genuine Bedrock entity document", () => {
    const output = compileEntityDsl(FIXTURE_DIR);
    assert.ok(output["entities/nav_test.json"], "expected a real entities/nav_test.json output key");
    const doc = output["entities/nav_test.json"];
    assert.strictEqual(doc.format_version, "1.20.0");
    assert.strictEqual(doc["minecraft:entity"].description.identifier, "prd:nav_test");
    assert.strictEqual(doc["minecraft:entity"].description.is_spawnable, true);
});

test("compileEntityDsl: <Pathfinding slots={5}/> produces the SAME real component_groups/events/environment_sensor as the hand-written, real-BDS-verified nav_test.json - proof it calls the real generateNavSlots(), not a reimplementation", () => {
    const output = compileEntityDsl(FIXTURE_DIR);
    const dslDoc = output["entities/nav_test.json"]["minecraft:entity"];
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
    const components = output["entities/nav_test.json"]["minecraft:entity"].components;
    assert.deepStrictEqual(components["minecraft:health"], { value: 20, max: 20 });
    assert.deepStrictEqual(components["minecraft:movement"], { value: 0.25 });
    assert.deepStrictEqual(components["minecraft:collision_box"], { width: 0.6, height: 1.8 });
    assert.deepStrictEqual(components["minecraft:type_family"], { family: ["mob"] });
    assert.deepStrictEqual(components["minecraft:knockback_resistance"], { value: 1 });
});

test("compileEntityDsl: a mod with no entity DSL directory at all returns an empty output, not an error", () => {
    assert.deepStrictEqual(compileEntityDsl(path.join(__dirname, "fixtures", "does-not-exist")), {});
});

console.log(`\n${passed} passed`);
