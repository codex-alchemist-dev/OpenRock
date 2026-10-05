// OpenRock entity DSL - real JSX components (OR-Track M0/M1/M2).
//
// Deliberately a small, real semantic vocabulary at the tag level -
// `Entity`, `ComponentGroup`, `RawComponent`, and library-integrated tags
// like `Pathfinding` - is all entityBuilder.js's emission backend (M2)
// actually needs to understand. Every "typed, validated" convenience
// component below (Health, CollisionBox, Movement, NavigationWalk) is pure
// JS sugar living entirely at THIS authoring layer, composing down to a
// real `RawComponent` node - never a second code path the backend has to
// special-case. This is where most of M3's "surface-obvious, catch-it-at-
// compile-time" value actually lives: a typed `Health({value: "20"})` with
// a string instead of a number throws HERE, at JSX-evaluation time (a real
// compile error), not as a mystery in a deployed pack.
"use strict";

function rawComponent(type, value) {
    return { tag: "RawComponent", attrs: { type, value }, children: [], line: 0 };
}

function requireNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`OpenRock entity DSL: ${label} must be a real number, got ${JSON.stringify(value)}`);
    }
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || !value) {
        throw new Error(`OpenRock entity DSL: ${label} must be a real, non-empty string, got ${JSON.stringify(value)}`);
    }
    return value;
}

/** The root node - a whole entity definition. */
function Entity(props) {
    requireString(props.identifier, "<Entity identifier>");
    return {
        tag: "Entity",
        attrs: {
            identifier: props.identifier,
            spawnable: props.spawnable ?? false,
            summonable: props.summonable ?? true,
            experimental: props.experimental ?? false,
            // Real RP client_entity visual fields (learn.microsoft.com's
            // own confirmed minecraft:client_entity description shape) -
            // giving any of these produces a real RP document too (see
            // entityBuilder.js's buildClientEntityDoc()), so a mod never
            // needs to hand-author entity/<name>.json to give an entity a
            // real visual - the whole point of the "no native compiling"
            // rule this closes the last real gap in.
            materials: props.materials,
            textures: props.textures,
            geometry: props.geometry,
            renderControllers: props.renderControllers,
            spawnEgg: props.spawnEgg,
            enableAttachables: props.enableAttachables,
            hideArmor: props.hideArmor,
            // Behavior-pack / client-entity document versions and the vanilla entity whose behavior to borrow.
            formatVersion: props.formatVersion,
            clientFormatVersion: props.clientFormatVersion,
            runtimeIdentifier: props.runtimeIdentifier,
        },
        children: props.children ?? [],
        line: 0,
    };
}

/** A real Bedrock component_group - a named bundle of components/behaviors, toggled on/off by real events. */
function ComponentGroup(props) {
    requireString(props.name, "<ComponentGroup name>");
    return { tag: "ComponentGroup", attrs: { name: props.name }, children: props.children ?? [], line: 0 };
}

/**
 * The real escape hatch: an arbitrary, un-typed Bedrock component, for
 * anything without a typed wrapper yet. Guarantees full real-component
 * coverage from day one - typed wrappers get added for whatever's common,
 * this never blocks authoring a real entity in the meantime.
 */
function RawComponent(props) {
    requireString(props.type, "<RawComponent type>");
    if (props.value === undefined) throw new Error(`OpenRock entity DSL: <RawComponent type="${props.type}"> requires a real "value" prop`);
    return rawComponent(props.type, props.value);
}

// --- typed, validated convenience components (the common, high-value cases) ---

function Health(props) {
    requireNumber(props.value, "<Health value>");
    return rawComponent("minecraft:health", { value: props.value, max: props.max ?? props.value });
}

function Movement(props) {
    requireNumber(props.speed, "<Movement speed>");
    return rawComponent("minecraft:movement", { value: props.speed });
}

function CollisionBox(props) {
    requireNumber(props.width, "<CollisionBox width>");
    requireNumber(props.height, "<CollisionBox height>");
    return rawComponent("minecraft:collision_box", { width: props.width, height: props.height });
}

function NavigationWalk(props) {
    return rawComponent("minecraft:navigation.walk", {
        can_path_over_water: props.canPathOverWater ?? false,
        avoid_water: props.avoidWater ?? false,
        can_pass_doors: props.canPassDoors ?? false,
        can_open_doors: props.canOpenDoors ?? false,
        avoid_damage_blocks: props.avoidDamageBlocks ?? false,
    });
}

function Physics(props) {
    return rawComponent("minecraft:physics", {
        has_gravity: props.hasGravity ?? true,
        has_collision: props.hasCollision ?? true,
    });
}

function Pushable(props) {
    return rawComponent("minecraft:pushable", {
        is_pushable: props.isPushable ?? true,
        is_pushable_by_piston: props.isPushableByPiston ?? true,
    });
}

function Scale(props) {
    requireNumber(props.value, "<Scale value>");
    return rawComponent("minecraft:scale", { value: props.value });
}

function TypeFamily(props) {
    if (!Array.isArray(props.family) || props.family.length === 0) throw new Error("OpenRock entity DSL: <TypeFamily family> requires a real, non-empty array");
    return rawComponent("minecraft:type_family", { family: props.family });
}

/**
 * The real, library-integrated case - genuinely different from the typed
 * components above: it expands into MULTIPLE component_groups/events/an
 * environment_sensor, via @openrock/pathfinding's own real,
 * already-tested genNavSlots.js logic (OR-Track N/L), not a 1:1 typed
 * wrapper. entityBuilder.js (M2) is what actually calls into that real
 * generator when it sees this tag.
 */
function Pathfinding(props) {
    requireNumber(props.slots, "<Pathfinding slots>");
    return { tag: "Pathfinding", attrs: { slots: props.slots, tagPrefix: props.tagPrefix }, children: [], line: 0 };
}

/** The build's template variables (mod `templateVars`, `ns`, and anything `content.dslVarsProvider` computed) - numbers/arrays included. */
function vars() { return globalThis.__openrockDslVars ?? {}; }

module.exports = {
    vars,
    Entity, ComponentGroup, RawComponent,
    Health, Movement, CollisionBox, NavigationWalk, Physics, Pushable, TypeFamily, Scale,
    Pathfinding,
};
