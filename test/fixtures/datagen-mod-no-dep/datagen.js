"use strict";
module.exports = function generate({ buildShapelessRecipe }) {
    return { bp: { "recipes/x.json": buildShapelessRecipe({ id: "dgn:x", ingredients: [{ item: "minecraft:stick" }], result: { item: "dgn:x" } }) } };
};
