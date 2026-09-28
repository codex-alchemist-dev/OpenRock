// A real content.datagenEntry script (OR-Track B2, made real) - executed
// by buildPipeline.js at build time (real require(), real JS execution),
// using @openrock/datagen's real typed builders instead of hand-written
// JSON. Never bundled into the in-game pack.
"use strict";

module.exports = function generate({ buildShapelessRecipe, buildLootTable }) {
    return {
        bp: {
            "recipes/dg_test_recipe.json": buildShapelessRecipe({
                id: "dg:test_recipe",
                ingredients: [{ item: "minecraft:stick", count: 2 }],
                result: { item: "dg:test_item" },
            }),
            "loot_tables/dg_test_loot.json": buildLootTable([
                { rolls: 1, entries: [{ type: "item", name: "dg:test_item", weight: 1 }] },
            ]),
        },
    };
};
