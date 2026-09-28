// Crystal Manifest-Block's real, DECLARATIVE emission backend (OR-Track
// M4) - mirrors src/manifestDsl/manifestBuilder.js's own shape (tree-
// walking, not imperative allocation-ordered like entityBuilder.js),
// correct here for the same real reason: a block's own components have no
// ordering/allocation semantics across siblings (no shared component_group
// array, no tag bookkeeping) - each child just contributes one real
// component to the components object, or one real entry to permutations[].
"use strict";

function cleanValue(value) {
    if (Array.isArray(value)) return value.map(cleanValue);
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = cleanValue(v);
        return out;
    }
    return value;
}

function collectComponents(children) {
    const components = {};
    for (const child of children) {
        if (child.tag !== "RawComponent") throw new Error(`Crystal Manifest-Block: expected a real component here, got <${child.tag}> - only components (or <Permutation> at the top level) belong inside <Block>`);
        if (!child.attrs.type) throw new Error("Crystal Manifest-Block: a real component needs a type");
        components[child.attrs.type] = cleanValue(child.attrs.value);
    }
    return components;
}

/**
 * @param {object} blockNode - a real <Block> node (a Crystal Manifest-Block file's default export).
 * @returns {object} a real, complete minecraft:block document.
 */
function buildBlock(blockNode) {
    if (!blockNode || blockNode.tag !== "Block") {
        throw new Error(`Crystal Manifest-Block: a real *.block.tsx file must default-export a real <Block> node, got ${JSON.stringify(blockNode)}`);
    }
    const { identifier, menuCategory, traits, states } = blockNode.attrs;
    const description = { identifier };
    if (menuCategory) description.menu_category = menuCategory;
    if (traits) description.traits = cleanValue(traits);
    if (states) description.states = cleanValue(states);

    const topLevelComponents = [];
    const permutations = [];
    for (const child of blockNode.children ?? []) {
        if (child.tag === "Permutation") {
            permutations.push({ condition: child.attrs.condition, components: collectComponents(child.children ?? []) });
        } else {
            topLevelComponents.push(child);
        }
    }

    const doc = {
        format_version: "1.21.0",
        "minecraft:block": {
            description,
            components: collectComponents(topLevelComponents),
        },
    };
    if (permutations.length) doc["minecraft:block"].permutations = permutations;
    return doc;
}

module.exports = { buildBlock };
