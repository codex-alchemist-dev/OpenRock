#!/usr/bin/env node
// Real tests for src/entityDsl/entityLint.js (OR-Track M3) - modeled on
// MinUI's own lib/lintjsonui.test.js discipline: confirmed failure classes
// only, checked against real synthetic fixtures reproducing each one.
// Run: node test/entityLint.test.js
"use strict";

const assert = require("assert");
const {
    lintClientEntityDoc, lintRenderControllerReferences, lintMolangStrings, lintTagCollisions,
} = require("../src/entityDsl/entityLint.js");

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

test("lintClientEntityDoc: a clean, complete client entity document reports no issues", () => {
    const doc = {
        "minecraft:client_entity": {
            description: {
                identifier: "prd:nav_test",
                materials: { default: "zombie" },
                geometry: { default: "geometry.zombie" },
                textures: { default: "textures/entity/zombie/zombie" },
                render_controllers: ["controller.render.zombie"],
            },
        },
    };
    assert.deepStrictEqual(lintClientEntityDoc(doc, "nav_test.json"), []);
});

test("lintClientEntityDoc: a declared-but-empty materials/geometry/textures group is flagged", () => {
    const doc = { "minecraft:client_entity": { description: { materials: {}, render_controllers: ["x"] } } };
    const issues = lintClientEntityDoc(doc, "nav_test.json");
    assert.ok(issues.some(i => /materials is declared but empty/.test(i)));
});

test("lintClientEntityDoc: missing render_controllers is flagged - the entity has no real way to be drawn at all", () => {
    const doc = { "minecraft:client_entity": { description: {} } };
    const issues = lintClientEntityDoc(doc, "nav_test.json");
    assert.ok(issues.some(i => /render_controllers is missing or empty/.test(i)));
});

test("lintRenderControllerReferences: a real, correctly-matched material/geometry/texture reports no issues", () => {
    const clientEntityDoc = {
        "minecraft:client_entity": {
            description: { materials: { default: "zombie" }, geometry: { default: "geometry.zombie" }, textures: { default: "textures/entity/zombie/zombie" } },
        },
    };
    const renderControllerDocs = [{
        render_controllers: {
            "controller.render.nav_test": { geometry: "Geometry.default", materials: [{ "*": "Material.default" }], textures: ["Texture.default"] },
        },
    }];
    assert.deepStrictEqual(lintRenderControllerReferences(clientEntityDoc, renderControllerDocs, "nav_test"), []);
});

test("lintRenderControllerReferences: a render controller referencing an UNDECLARED short-name is caught - the real class of mistake tonight's incident belongs to", () => {
    const clientEntityDoc = {
        "minecraft:client_entity": {
            description: { materials: { default: "zombie" } }, // note: no "custom" declared
        },
    };
    const renderControllerDocs = [{
        render_controllers: {
            "controller.render.nav_test": { materials: [{ "*": "Material.custom" }] }, // references "custom", never declared
        },
    }];
    const issues = lintRenderControllerReferences(clientEntityDoc, renderControllerDocs, "nav_test");
    assert.ok(issues.some(i => /references Material\.custom.*no "custom" entry declared/.test(i)), `expected an undeclared-reference issue, got: ${JSON.stringify(issues)}`);
});

test("lintMolangStrings: flags a real Molang '>=' expression, ignores an ordinary identifier string", () => {
    const doc = {
        components: {
            "minecraft:environment_sensor": { triggers: [{ event: "some_event", filters: { test: "some_test" } }] },
            "some_field": "(q.health() >= 10)",
        },
        identifier: "prd:nav_test", // a plain namespaced id - must NOT be flagged
    };
    const issues = lintMolangStrings(doc, "nav_test.json");
    assert.ok(issues.some(i => /contains ">="/.test(i)));
    assert.ok(!issues.some(i => i.includes("prd:nav_test")), "an ordinary identifier string must never be treated as Molang");
});

test("lintMolangStrings: flags a real bare '' empty-string-literal crash signature inside a real Molang-shaped string", () => {
    const doc = { value: "(q.property('cw:name') = '')" };
    const issues = lintMolangStrings(doc, "test.json");
    assert.ok(issues.some(i => /empty string literal/.test(i)));
});

test("lintTagCollisions: two DIFFERENT component_groups using the SAME has_tag filter value is caught", () => {
    const doc = {
        "minecraft:entity": {
            component_groups: {
                "openrock:slot_0": { "minecraft:behavior.follow_mob": { filters: { test: "has_tag", value: "openrock_anchor_slot_0" } } },
                "openrock:slot_1": { "minecraft:behavior.follow_mob": { filters: { test: "has_tag", value: "openrock_anchor_slot_0" } } }, // real collision - should be slot_1
            },
        },
    };
    const issues = lintTagCollisions(doc, "nav_test.json");
    assert.ok(issues.some(i => /openrock_anchor_slot_0.*MORE THAN ONE component_group/.test(i)));
});

test("lintTagCollisions: distinct tag values across component_groups (the real, correct shape) reports no issues", () => {
    const doc = {
        "minecraft:entity": {
            component_groups: {
                "openrock:slot_0": { "minecraft:behavior.follow_mob": { filters: { test: "has_tag", value: "openrock_anchor_slot_0" } } },
                "openrock:slot_1": { "minecraft:behavior.follow_mob": { filters: { test: "has_tag", value: "openrock_anchor_slot_1" } } },
            },
        },
    };
    assert.deepStrictEqual(lintTagCollisions(doc, "nav_test.json"), []);
});

console.log(`\n${passed} passed`);
