// Crystal Manifest-Item's real component vocabulary (OR-Track M5, see
// docs/crystal.md) - typed convenience components for the real,
// confirmed-via-live-docs-fetch item components most mods actually need
// (learn.microsoft.com's real itemcomponentlist + bedrock.dev's real field
// shapes, fetched directly before writing this file - never guessed).
// Every real minecraft:item component not given a typed wrapper here is
// still fully expressible via <RawComponent type="..." value={...}/> -
// matches src/entityDsl/components.js and src/blockDsl/components.js's
// own established precedent exactly.
"use strict";

function raw(tag, attrs) {
    return { tag, attrs, children: [], line: 0 };
}

/** The whole item DSL file's top-level node. @param {object} props - identifier (required), menuCategory. */
function Item(props) {
    if (!props.identifier) throw new Error("Crystal Manifest-Item: <Item> needs a real identifier");
    return { tag: "Item", attrs: { identifier: props.identifier, menuCategory: props.menuCategory }, children: props.children ?? [], line: 0 };
}

function RawComponent(props) {
    if (!props.type) throw new Error("Crystal Manifest-Item: <RawComponent> needs a real type=\"minecraft:...\"");
    return raw("RawComponent", { type: props.type, value: props.value });
}

// Real, confirmed field shapes (learn.microsoft.com's itemcomponentlist +
// wiki.bedrock.dev's item-components.html, live-fetched):
function Icon(props) { return raw("RawComponent", { type: "minecraft:icon", value: typeof props === "string" ? props : (props.textures ?? props.texture) }); }
function MaxStackSize(props) { return raw("RawComponent", { type: "minecraft:max_stack_size", value: props.value }); }
function DisplayName(props) { return raw("RawComponent", { type: "minecraft:display_name", value: { value: props.value } }); }
function Food(props) {
    const value = { nutrition: props.nutrition, saturation_modifier: props.saturationModifier };
    if (props.canAlwaysEat !== undefined) value.can_always_eat = props.canAlwaysEat;
    if (props.usingConvertsTo !== undefined) value.using_converts_to = props.usingConvertsTo;
    return raw("RawComponent", { type: "minecraft:food", value });
}
function Durability(props) {
    const value = { max_durability: props.maxDurability };
    if (props.damageChance !== undefined) value.damage_chance = props.damageChance;
    return raw("RawComponent", { type: "minecraft:durability", value });
}
function HandEquipped(props) { return raw("RawComponent", { type: "minecraft:hand_equipped", value: props.value ?? true }); }
function Wearable(props) {
    const value = { slot: props.slot };
    if (props.protection !== undefined) value.protection = props.protection;
    if (props.hidesPlayerLocation !== undefined) value.hides_player_location = props.hidesPlayerLocation;
    return raw("RawComponent", { type: "minecraft:wearable", value });
}
function Digger(props) { return raw("RawComponent", { type: "minecraft:digger", value: { destroy_speeds: props.destroySpeeds, use_efficiency: props.useEfficiency } }); }
function Fuel(props) { return raw("RawComponent", { type: "minecraft:fuel", value: { duration: props.duration } }); }
function HoverTextColor(props) { return raw("RawComponent", { type: "minecraft:hover_text_color", value: props.value }); }
function AllowOffHand(props) { return raw("RawComponent", { type: "minecraft:allow_off_hand", value: props.value ?? true }); }

module.exports = {
    Item, RawComponent,
    Icon, MaxStackSize, DisplayName, Food, Durability, HandEquipped, Wearable, Digger, Fuel, HoverTextColor, AllowOffHand,
};
