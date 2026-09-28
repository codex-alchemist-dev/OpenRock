// @openrock/inventory-serialization - round-trips a real ItemStack
// (durability, enchantments, custom name, lore) to/from plain JSON, a real
// gap every persistence-minded mod hits since ItemStack objects can't be
// stored directly as dynamic-property data. Every real Bedrock API surface
// (component reads/writes, ItemStack construction) is dependency-injected,
// so this library stays fully unit-testable without a real @minecraft/server.
//
// Falls back gracefully (typeId + amount only) for anything a step can't
// read/apply - each optional field is wrapped in its own try/catch and
// reported through `onUnhandled(field, error)` rather than failing the
// whole (de)serialization, matching this project's own established
// debug-visibility convention (log gaps, don't silently lose data, don't
// crash on an unexpected item shape either).
//
// See "OR-Track L", Part 1, item 9, in the project plan document.
//
// OR-Track N (2026-09-28): hoisted to real top-level module.exports (see
// @openrock/pathfinding's header for the full rationale) - a mod's real
// gear/inventory-persistence script can import serializeItem/
// deserializeItem directly.
"use strict";

/**
 * @param {object} itemStack - real usage: a Bedrock ItemStack. Needs
 *   `.typeId`, `.amount`, optional `.nameTag`, `.getLore()`,
 *   `.getComponent(id)`.
 * @param {object} [opts]
 * @param {(field:string, error:Error)=>void} [opts.onUnhandled]
 */
function serializeItem(itemStack, { onUnhandled = () => {} } = {}) {
    if (!itemStack || typeof itemStack.typeId !== "string") {
        throw new Error("@openrock/inventory-serialization: serializeItem() requires a real itemStack with a string .typeId");
    }
    const result = { typeId: itemStack.typeId, amount: itemStack.amount ?? 1 };

    try {
        if (itemStack.nameTag) result.name = itemStack.nameTag;
    } catch (e) { onUnhandled("name", e); }

    try {
        const lore = itemStack.getLore?.();
        if (lore && lore.length > 0) result.lore = [...lore];
    } catch (e) { onUnhandled("lore", e); }

    try {
        const durability = itemStack.getComponent?.("minecraft:durability");
        if (durability) result.durability = { damage: durability.damage, maxDurability: durability.maxDurability };
    } catch (e) { onUnhandled("durability", e); }

    try {
        const enchantable = itemStack.getComponent?.("minecraft:enchantable");
        const list = enchantable?.getEnchantments?.() ?? [];
        if (list.length > 0) result.enchantments = list.map(en => ({ id: en.type?.id ?? en.type, level: en.level }));
    } catch (e) { onUnhandled("enchantments", e); }

    return result;
}

/**
 * @param {object} data - from serializeItem().
 * @param {object} hooks - real side effects:
 *   createItemStack(typeId, amount) => itemStack (REQUIRED)
 *   applyLore(itemStack, lore) => void
 *   applyDurability(itemStack, {damage, maxDurability}) => void
 *   applyEnchantments(itemStack, [{id, level}]) => void
 * @param {object} [opts]
 * @param {(field:string, error:Error)=>void} [opts.onUnhandled]
 */
function deserializeItem(data, hooks, { onUnhandled = () => {} } = {}) {
    if (!data || typeof data.typeId !== "string") {
        throw new Error("@openrock/inventory-serialization: deserializeItem() requires data with a string .typeId");
    }
    if (typeof hooks?.createItemStack !== "function") {
        throw new Error("@openrock/inventory-serialization: deserializeItem() requires hooks.createItemStack(typeId, amount)");
    }
    const itemStack = hooks.createItemStack(data.typeId, data.amount ?? 1);

    if (data.name !== undefined) {
        try { itemStack.nameTag = data.name; }
        catch (e) { onUnhandled("name", e); }
    }
    if (data.lore) {
        try { hooks.applyLore?.(itemStack, data.lore); }
        catch (e) { onUnhandled("lore", e); }
    }
    if (data.durability) {
        try { hooks.applyDurability?.(itemStack, data.durability); }
        catch (e) { onUnhandled("durability", e); }
    }
    if (data.enchantments) {
        try { hooks.applyEnchantments?.(itemStack, data.enchantments); }
        catch (e) { onUnhandled("enchantments", e); }
    }
    return itemStack;
}

function register() {
    return { api: { serializeItem, deserializeItem } };
}

module.exports = register;
module.exports.serializeItem = serializeItem;
module.exports.deserializeItem = deserializeItem;
