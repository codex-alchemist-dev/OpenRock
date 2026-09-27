#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/datagen.
// Run: node libs/datagen/test/datagen.test.js
"use strict";

const assert = require("assert");
const registerLib = require("../src/register.js");

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

const { api } = registerLib();

test("buildShapelessRecipe: produces the real Bedrock shape with defaults filled in", () => {
    const recipe = api.buildShapelessRecipe({
        id: "cw:frost_bow_recipe",
        ingredients: [{ item: "minecraft:stick" }, { item: "minecraft:string", count: 2 }],
        result: { item: "cw:frost_bow" },
    });
    assert.strictEqual(recipe["minecraft:recipe_shapeless"].description.identifier, "cw:frost_bow_recipe");
    assert.deepStrictEqual(recipe["minecraft:recipe_shapeless"].tags, ["crafting_table"]);
    assert.deepStrictEqual(recipe["minecraft:recipe_shapeless"].ingredients, [
        { item: "minecraft:stick", count: 1 },
        { item: "minecraft:string", count: 2 },
    ]);
    assert.deepStrictEqual(recipe["minecraft:recipe_shapeless"].result, { item: "cw:frost_bow", count: 1 });
});

test("buildShapelessRecipe: rejects a non-namespaced id", () => {
    assert.throws(() => api.buildShapelessRecipe({ id: "bad-id", ingredients: [{ item: "minecraft:stick" }], result: { item: "cw:x" } }), /namespaced id/);
});

test("buildShapelessRecipe: rejects an empty ingredients array", () => {
    assert.throws(() => api.buildShapelessRecipe({ id: "cw:x", ingredients: [], result: { item: "cw:x" } }), /non-empty array/);
});

test("buildShapedRecipe: produces the real Bedrock shape with a pattern and key", () => {
    const recipe = api.buildShapedRecipe({
        id: "cw:sword_recipe",
        pattern: ["A", "A", "B"],
        key: { A: { item: "minecraft:iron_ingot" }, B: { item: "minecraft:stick" } },
        result: { item: "cw:frost_sword", count: 1 },
    });
    assert.deepStrictEqual(recipe["minecraft:recipe_shaped"].pattern, ["A", "A", "B"]);
    assert.deepStrictEqual(recipe["minecraft:recipe_shaped"].key, {
        A: { item: "minecraft:iron_ingot", count: 1 },
        B: { item: "minecraft:stick", count: 1 },
    });
});

test("buildShapedRecipe: rejects a key entry missing item", () => {
    assert.throws(() => api.buildShapedRecipe({ id: "cw:x", pattern: ["A"], key: { A: {} }, result: { item: "cw:x" } }), /namespaced id/);
});

test("buildFurnaceRecipe: produces the real Bedrock shape, defaults tags to furnace", () => {
    const recipe = api.buildFurnaceRecipe({ id: "cw:smelt_ore", input: "minecraft:iron_ore", output: { item: "minecraft:iron_ingot" } });
    assert.deepStrictEqual(recipe["minecraft:recipe_furnace"].tags, ["furnace"]);
    assert.deepStrictEqual(recipe["minecraft:recipe_furnace"].input, { item: "minecraft:iron_ore" });
    assert.deepStrictEqual(recipe["minecraft:recipe_furnace"].output, { item: "minecraft:iron_ingot", count: 1 });
});

test("buildLootTable: produces the real Bedrock shape with defaults filled in", () => {
    const table = api.buildLootTable([
        { rolls: 2, entries: [{ name: "minecraft:diamond", weight: 5 }, { name: "minecraft:coal" }] },
    ]);
    assert.deepStrictEqual(table, {
        pools: [{
            rolls: 2,
            entries: [
                { type: "item", name: "minecraft:diamond", weight: 5 },
                { type: "item", name: "minecraft:coal", weight: 1 },
            ],
        }],
    });
});

test("buildLootTable: passes through entry functions when given", () => {
    const table = api.buildLootTable([{ entries: [{ name: "minecraft:diamond", functions: [{ function: "set_count", count: 3 }] }] }]);
    assert.deepStrictEqual(table.pools[0].entries[0].functions, [{ function: "set_count", count: 3 }]);
});

test("buildLootTable: rejects an empty pools array", () => {
    assert.throws(() => api.buildLootTable([]), /non-empty array/);
});

test("buildItem: produces the real Bedrock item shape", () => {
    const item = api.buildItem({ identifier: "cw:frost_bow", components: { "minecraft:max_stack_size": 1 } });
    assert.deepStrictEqual(item, {
        format_version: "1.20.10",
        "minecraft:item": { description: { identifier: "cw:frost_bow" }, components: { "minecraft:max_stack_size": 1 } },
    });
});

test("buildItem: includes menu_category when given, omits it otherwise", () => {
    const withCategory = api.buildItem({ identifier: "cw:x", components: {}, menuCategory: { category: "equipment" } });
    assert.deepStrictEqual(withCategory["minecraft:item"].description.menu_category, { category: "equipment" });
    const without = api.buildItem({ identifier: "cw:y", components: {} });
    assert.strictEqual("menu_category" in without["minecraft:item"].description, false);
});

test("buildItem: rejects components that isn't a plain object", () => {
    assert.throws(() => api.buildItem({ identifier: "cw:x", components: ["not", "an", "object"] }), /must be a plain object/);
});

test("buildBlock: produces the real Bedrock block shape, includes permutations when given", () => {
    const block = api.buildBlock({
        identifier: "cw:shrine",
        components: { "minecraft:destructible_by_mining": {} },
        permutations: [{ condition: "q.block_state('cw:lit') == 1", components: {} }],
    });
    assert.deepStrictEqual(block["minecraft:block"].description, { identifier: "cw:shrine" });
    assert.strictEqual(block["minecraft:block"].permutations.length, 1);
});

test("buildBlock: omits permutations entirely when not given", () => {
    const block = api.buildBlock({ identifier: "cw:plain_block", components: {} });
    assert.strictEqual("permutations" in block["minecraft:block"], false);
});

console.log(`\n${passed} passed`);
