// Crystal Manifest-Item's real, DECLARATIVE emission backend (OR-Track
// M5) - mirrors src/manifestDsl/manifestBuilder.js and
// src/blockDsl/blockBuilder.js's own shape: an item's own components have
// no ordering/allocation semantics across siblings, so each child just
// contributes one real component to the components object.
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

/**
 * @param {object} itemNode - a real <Item> node (a Crystal Manifest-Item file's default export).
 * @returns {object} a real, complete minecraft:item document.
 */
function buildItem(itemNode) {
    if (!itemNode || itemNode.tag !== "Item") {
        throw new Error(`Crystal Manifest-Item: a real *.item.tsx file must default-export a real <Item> node, got ${JSON.stringify(itemNode)}`);
    }
    const { identifier, menuCategory } = itemNode.attrs;
    const description = { identifier };
    if (menuCategory) description.menu_category = menuCategory;

    const components = {};
    for (const child of itemNode.children ?? []) {
        if (child.tag !== "RawComponent") throw new Error(`Crystal Manifest-Item: expected a real component here, got <${child.tag}> - only components belong inside <Item>`);
        if (!child.attrs.type) throw new Error("Crystal Manifest-Item: a real component needs a type");
        components[child.attrs.type] = cleanValue(child.attrs.value);
    }

    return {
        format_version: itemNode.attrs.formatVersion ?? "1.21.0",
        "minecraft:item": { description, components },
    };
}

module.exports = { buildItem };
