// @openrock/datagen - Node-side (build-time, NOT in-game) typed builders
// for Bedrock content JSON (recipes, loot tables, items, blocks), so a
// mod's build script can generate this JSON from typed calls instead of
// hand-writing it. Nothing here runs inside Minecraft; a future OR-Track
// F0 CLI is what actually calls these at package time and writes the
// results to files - this library is the "typed builder calls" half, not
// the file-writing/build-pipeline half.
//
// Deliberately scoped to the common, well-documented recipe/loot-table/
// item/block shapes - NOT every possible Bedrock JSON variant (no
// recipe_brewing_mix/recipe_smithing_transform builders, no deep
// per-component schema validation for items/blocks beyond "components is
// an object"). Extend with more builders as real content actually needs
// them, rather than guessing every shape up front.
//
// "Validated by MinUI's lint tooling extended to non-UI JSON" (the
// original OR-Track B2 wording) is a MinUI-repo change, not built here -
// each builder below does its own structural validation (required fields,
// namespaced ids) and throws loudly on anything malformed, matching this
// whole project's validate-and-fail-loudly convention.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

const DEFAULT_FORMAT_VERSION = "1.20.10";

function requireNamespacedId(value, label) {
    if (typeof value !== "string" || !value.includes(":")) {
        throw new Error(`@openrock/datagen: ${label} must be a namespaced id ("namespace:name"), got ${JSON.stringify(value)}`);
    }
    return value;
}

function requireNonEmptyArray(value, label) {
    if (!Array.isArray(value) || value.length === 0) throw new Error(`@openrock/datagen: ${label} must be a non-empty array`);
    return value;
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`@openrock/datagen: ${label} must be a plain object`);
    return value;
}

module.exports = function register() {
    /**
     * @param {object} opts
     * @param {string} opts.id - namespaced recipe identifier.
     * @param {string[]} [opts.tags] - defaults to ["crafting_table"].
     * @param {Array<{item: string, count?: number}>} opts.ingredients
     * @param {{item: string, count?: number}} opts.result
     */
    function buildShapelessRecipe({ id, tags = ["crafting_table"], ingredients, result }) {
        requireNamespacedId(id, "id");
        requireNonEmptyArray(ingredients, "ingredients");
        requirePlainObject(result, "result");
        requireNamespacedId(result.item, "result.item");
        return {
            format_version: DEFAULT_FORMAT_VERSION,
            "minecraft:recipe_shapeless": {
                description: { identifier: id },
                tags,
                ingredients: ingredients.map(i => ({ item: requireNamespacedId(i.item, "ingredients[].item"), count: i.count ?? 1 })),
                result: { item: result.item, count: result.count ?? 1 },
            },
        };
    }

    /**
     * @param {object} opts
     * @param {string} opts.id
     * @param {string[]} [opts.tags]
     * @param {string[]} opts.pattern - e.g. ["AAA", " B ", " B "], each char keys into `key`.
     * @param {Record<string, {item: string, count?: number}>} opts.key
     * @param {{item: string, count?: number}} opts.result
     */
    function buildShapedRecipe({ id, tags = ["crafting_table"], pattern, key, result }) {
        requireNamespacedId(id, "id");
        requireNonEmptyArray(pattern, "pattern");
        requirePlainObject(key, "key");
        requirePlainObject(result, "result");
        requireNamespacedId(result.item, "result.item");
        const builtKey = {};
        for (const [symbol, entry] of Object.entries(key)) {
            requirePlainObject(entry, `key["${symbol}"]`);
            builtKey[symbol] = { item: requireNamespacedId(entry.item, `key["${symbol}"].item`), count: entry.count ?? 1 };
        }
        return {
            format_version: DEFAULT_FORMAT_VERSION,
            "minecraft:recipe_shaped": {
                description: { identifier: id },
                tags,
                pattern,
                key: builtKey,
                result: { item: result.item, count: result.count ?? 1 },
            },
        };
    }

    /**
     * @param {object} opts
     * @param {string} opts.id
     * @param {string[]} [opts.tags] - defaults to ["furnace"].
     * @param {string} opts.input - namespaced item id.
     * @param {{item: string, count?: number}} opts.output
     */
    function buildFurnaceRecipe({ id, tags = ["furnace"], input, output }) {
        requireNamespacedId(id, "id");
        requireNamespacedId(input, "input");
        requirePlainObject(output, "output");
        requireNamespacedId(output.item, "output.item");
        return {
            format_version: DEFAULT_FORMAT_VERSION,
            "minecraft:recipe_furnace": {
                description: { identifier: id },
                tags,
                input: { item: input },
                output: { item: output.item, count: output.count ?? 1 },
            },
        };
    }

    /**
     * @param {Array<{rolls: number|{min:number,max:number}, entries: Array<{type?: string, name: string, weight?: number, functions?: object[]}>}>} pools
     */
    function buildLootTable(pools) {
        requireNonEmptyArray(pools, "pools");
        return {
            pools: pools.map((pool, i) => {
                requirePlainObject(pool, `pools[${i}]`);
                requireNonEmptyArray(pool.entries, `pools[${i}].entries`);
                return {
                    rolls: pool.rolls ?? 1,
                    entries: pool.entries.map((entry, j) => {
                        requirePlainObject(entry, `pools[${i}].entries[${j}]`);
                        requireNamespacedId(entry.name, `pools[${i}].entries[${j}].name`);
                        return { type: entry.type ?? "item", name: entry.name, weight: entry.weight ?? 1, ...(entry.functions ? { functions: entry.functions } : {}) };
                    }),
                };
            }),
        };
    }

    /**
     * @param {object} opts
     * @param {string} opts.identifier - namespaced item id.
     * @param {object} opts.components - minecraft:item's components object; not deeply validated.
     * @param {string} [opts.formatVersion]
     * @param {object} [opts.menuCategory]
     */
    function buildItem({ identifier, components, formatVersion = DEFAULT_FORMAT_VERSION, menuCategory }) {
        requireNamespacedId(identifier, "identifier");
        requirePlainObject(components, "components");
        return {
            format_version: formatVersion,
            "minecraft:item": {
                description: { identifier, ...(menuCategory ? { menu_category: menuCategory } : {}) },
                components,
            },
        };
    }

    /**
     * @param {object} opts
     * @param {string} opts.identifier - namespaced block id.
     * @param {object} opts.components - minecraft:block's components object; not deeply validated.
     * @param {string} [opts.formatVersion]
     * @param {object[]} [opts.permutations]
     */
    function buildBlock({ identifier, components, formatVersion = DEFAULT_FORMAT_VERSION, permutations }) {
        requireNamespacedId(identifier, "identifier");
        requirePlainObject(components, "components");
        return {
            format_version: formatVersion,
            "minecraft:block": {
                description: { identifier },
                components,
                ...(permutations ? { permutations } : {}),
            },
        };
    }

    return { api: { buildShapelessRecipe, buildShapedRecipe, buildFurnaceRecipe, buildLootTable, buildItem, buildBlock } };
};
