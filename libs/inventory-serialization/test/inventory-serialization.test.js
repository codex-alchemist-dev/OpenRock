#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/inventory-serialization.
// Run: node libs/inventory-serialization/test/inventory-serialization.test.js
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

// A fake, duck-typed ItemStack matching the real Bedrock API's shape.
function makeFakeItemStack({ typeId, amount = 1, nameTag, lore, durability, enchantments }) {
    return {
        typeId, amount, nameTag,
        getLore: () => lore ?? [],
        getComponent: (id) => {
            if (id === "minecraft:durability" && durability) return durability;
            if (id === "minecraft:enchantable" && enchantments) return { getEnchantments: () => enchantments };
            return undefined;
        },
    };
}

test("serializeItem: a plain item with no extras serializes to just typeId + amount", () => {
    const { api } = registerLib();
    const itemStack = makeFakeItemStack({ typeId: "minecraft:stick", amount: 5 });
    assert.deepStrictEqual(api.serializeItem(itemStack), { typeId: "minecraft:stick", amount: 5 });
});

test("serializeItem: requires a real itemStack with a string typeId", () => {
    const { api } = registerLib();
    assert.throws(() => api.serializeItem(null), /requires a real itemStack/);
    assert.throws(() => api.serializeItem({}), /requires a real itemStack/);
});

test("serializeItem: captures nameTag, lore, durability, and enchantments", () => {
    const { api } = registerLib();
    const itemStack = makeFakeItemStack({
        typeId: "minecraft:diamond_sword", amount: 1, nameTag: "Frostbite",
        lore: ["A legendary blade"],
        durability: { damage: 10, maxDurability: 1561 },
        enchantments: [{ type: { id: "sharpness" }, level: 5 }],
    });
    const result = api.serializeItem(itemStack);
    assert.deepStrictEqual(result, {
        typeId: "minecraft:diamond_sword", amount: 1, name: "Frostbite",
        lore: ["A legendary blade"],
        durability: { damage: 10, maxDurability: 1561 },
        enchantments: [{ id: "sharpness", level: 5 }],
    });
});

test("serializeItem: a component that throws while being read is caught and reported, doesn't fail the whole serialization", () => {
    const { api } = registerLib();
    const itemStack = {
        typeId: "minecraft:weird_item", amount: 1,
        getLore: () => { throw new Error("lore access exploded"); },
        getComponent: () => undefined,
    };
    const unhandled = [];
    const result = api.serializeItem(itemStack, { onUnhandled: (field, e) => unhandled.push({ field, message: e.message }) });
    assert.deepStrictEqual(result, { typeId: "minecraft:weird_item", amount: 1 });
    assert.deepStrictEqual(unhandled, [{ field: "lore", message: "lore access exploded" }]);
});

test("deserializeItem: requires hooks.createItemStack", () => {
    const { api } = registerLib();
    assert.throws(() => api.deserializeItem({ typeId: "minecraft:stick" }, {}), /requires hooks\.createItemStack/);
});

test("deserializeItem: requires data with a real typeId", () => {
    const { api } = registerLib();
    assert.throws(() => api.deserializeItem({}, { createItemStack: () => ({}) }), /requires data with a string \.typeId/);
});

test("round trip: serialize then deserialize reproduces an equivalent item via the real hooks path", () => {
    const { api } = registerLib();
    const original = makeFakeItemStack({
        typeId: "minecraft:bow", amount: 1, nameTag: "Windpiercer",
        lore: ["Whistles in flight"],
        durability: { damage: 3, maxDurability: 384 },
        enchantments: [{ type: { id: "power" }, level: 3 }, { type: { id: "unbreaking" }, level: 2 }],
    });
    const serialized = api.serializeItem(original);

    const applied = { name: null, lore: null, durability: null, enchantments: null };
    const hooks = {
        createItemStack: (typeId, amount) => ({ typeId, amount }),
        applyLore: (item, lore) => { applied.lore = lore; },
        applyDurability: (item, d) => { applied.durability = d; },
        applyEnchantments: (item, list) => { applied.enchantments = list; },
    };
    const rebuilt = api.deserializeItem(serialized, hooks);

    assert.strictEqual(rebuilt.typeId, "minecraft:bow");
    assert.strictEqual(rebuilt.amount, 1);
    assert.strictEqual(rebuilt.nameTag, "Windpiercer");
    assert.deepStrictEqual(applied.lore, ["Whistles in flight"]);
    assert.deepStrictEqual(applied.durability, { damage: 3, maxDurability: 384 });
    assert.deepStrictEqual(applied.enchantments, [{ id: "power", level: 3 }, { id: "unbreaking", level: 2 }]);
});

test("deserializeItem: a hook that throws is caught and reported, other fields still applied", () => {
    const { api } = registerLib();
    const data = { typeId: "minecraft:stick", amount: 1, lore: ["x"], durability: { damage: 0, maxDurability: 10 } };
    const applied = {};
    const unhandled = [];
    const hooks = {
        createItemStack: (typeId, amount) => ({ typeId, amount }),
        applyLore: () => { throw new Error("lore write exploded"); },
        applyDurability: (item, d) => { applied.durability = d; },
    };
    api.deserializeItem(data, hooks, { onUnhandled: (field, e) => unhandled.push({ field, message: e.message }) });
    assert.deepStrictEqual(unhandled, [{ field: "lore", message: "lore write exploded" }]);
    assert.deepStrictEqual(applied.durability, { damage: 0, maxDurability: 10 });
});

console.log(`\n${passed} passed`);
