// Crystal Manifest-Block's real component vocabulary (OR-Track M4, see
// docs/crystal.md) - typed convenience components for the real,
// confirmed-via-live-docs-fetch block components most mods actually need
// (never guessed field shapes - see each function's own field mapping,
// fetched from Microsoft Learn/bedrock.dev directly before writing this
// file). Every real minecraft:block component not given a typed wrapper
// here is still fully expressible via <RawComponent type="..." value={...}/>
// - nothing is inexpressible, matching src/entityDsl/components.js's own
// established precedent exactly (typed sugar for the common cases, a real
// escape hatch for everything else).
"use strict";

function raw(tag, attrs) {
    return { tag, attrs, children: [], line: 0 };
}

/** The whole block DSL file's top-level node. @param {object} props - identifier (required), menuCategory, traits, states. */
function Block(props) {
    if (!props.identifier) throw new Error("Crystal Manifest-Block: <Block> needs a real identifier");
    return {
        tag: "Block",
        attrs: { identifier: props.identifier, menuCategory: props.menuCategory, traits: props.traits, states: props.states },
        children: props.children ?? [],
        line: 0,
    };
}

/** <Permutation condition="query.block_state('orbt:powered') == true"> ...components... </Permutation> - a real permutations[] entry. */
function Permutation(props) {
    if (!props.condition) throw new Error("Crystal Manifest-Block: <Permutation> needs a real condition=\"...\" (a real Molang expression)");
    return { tag: "Permutation", attrs: { condition: props.condition }, children: props.children ?? [], line: 0 };
}

function RawComponent(props) {
    if (!props.type) throw new Error("Crystal Manifest-Block: <RawComponent> needs a real type=\"minecraft:...\"");
    return raw("RawComponent", { type: props.type, value: props.value });
}

// Real, confirmed field shapes (learn.microsoft.com/.../blockcomponents/*, live-fetched):
function CollisionBox(props) { return raw("RawComponent", { type: "minecraft:collision_box", value: { origin: props.origin, size: props.size } }); }
function SelectionBox(props) { return raw("RawComponent", { type: "minecraft:selection_box", value: { origin: props.origin, size: props.size } }); }
function Geometry(props) { return raw("RawComponent", { type: "minecraft:geometry", value: typeof props === "string" ? props : props.identifier }); }
function MaterialInstances(props) { return raw("RawComponent", { type: "minecraft:material_instances", value: props.instances }); }
function DestructibleByMining(props) { return raw("RawComponent", { type: "minecraft:destructible_by_mining", value: props.secondsToDestroy !== undefined ? { seconds_to_destroy: props.secondsToDestroy } : (props.value ?? true) }); }
function DestructibleByExplosion(props) { return raw("RawComponent", { type: "minecraft:destructible_by_explosion", value: props.explosionResistance !== undefined ? { explosion_resistance: props.explosionResistance } : (props.value ?? true) }); }
function Friction(props) { return raw("RawComponent", { type: "minecraft:friction", value: props.value }); }
function LightEmission(props) { return raw("RawComponent", { type: "minecraft:light_emission", value: props.value }); }
function LightDampening(props) { return raw("RawComponent", { type: "minecraft:light_dampening", value: props.value }); }
function MapColor(props) { return raw("RawComponent", { type: "minecraft:map_color", value: props.color ?? props.value }); }
function Loot(props) { return raw("RawComponent", { type: "minecraft:loot", value: props.table ?? props.value }); }
function Flammable(props) {
    const value = {};
    if (props.catchChanceModifier !== undefined) value.catch_chance_modifier = props.catchChanceModifier;
    if (props.destroyChanceModifier !== undefined) value.destroy_chance_modifier = props.destroyChanceModifier;
    if (props.lavaFlammable !== undefined) value.lava_flammable = props.lavaFlammable;
    return raw("RawComponent", { type: "minecraft:flammable", value: Object.keys(value).length ? value : true });
}
function Tick(props) { return raw("RawComponent", { type: "minecraft:tick", value: { interval_range: props.intervalRange, looping: props.looping } }); }
function Movable(props) { return raw("RawComponent", { type: "minecraft:movable", value: { movement_type: props.movementType, sticky: props.sticky } }); }
function DisplayName(props) { return raw("RawComponent", { type: "minecraft:display_name", value: props.value }); }
function RedstoneConductivity(props) { return raw("RawComponent", { type: "minecraft:redstone_conductivity", value: { allows_wire_to_step_down: props.allowsWireToStepDown, redstone_conductor: props.redstoneConductor } }); }

module.exports = {
    Block, Permutation, RawComponent,
    CollisionBox, SelectionBox, Geometry, MaterialInstances, DestructibleByMining, DestructibleByExplosion,
    Friction, LightEmission, LightDampening, MapColor, Loot, Flammable, Tick, Movable, DisplayName, RedstoneConductivity,
};
