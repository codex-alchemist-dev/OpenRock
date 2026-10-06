// OpenRock entity DSL - the real emission backend (OR-Track M2).
//
// Imperative, not declarative - modeled on MinUI's own lib/entity-container.js
// (ContainerBuilder), not lib/compile.js's tree-walking ScreenCompiler,
// because real Bedrock entity component_groups/environment_sensor/events
// are allocation-ordered, the same real constraint entity-container.js
// already solved for container slot indices. `<Pathfinding slots={5}/>`'s
// handler calls tools/lib/genNavSlots.js's REAL, already-tested
// generateNavSlots() directly - never reimplemented - and splices its
// output into the builder at that tree position.
"use strict";

const path = require("path");
const { generateNavSlots } = require(path.join(__dirname, "..", "..", "tools", "lib", "genNavSlots.js"));

class EntityBuilder {
    constructor() {
        this.componentGroups = {};
        this.components = {};
        this.events = {};
        this.environmentSensorTriggers = [];
    }

    addComponent(type, value) {
        if (type in this.components) throw new Error(`EntityBuilder: duplicate top-level component "${type}" - an entity can only declare each real component once at the base level`);
        this.components[type] = value;
    }

    addComponentGroup(name, components) {
        if (name in this.componentGroups) throw new Error(`EntityBuilder: duplicate component_group "${name}"`);
        this.componentGroups[name] = components;
    }

    addEvent(name, def) {
        if (name in this.events) throw new Error(`EntityBuilder: duplicate event "${name}"`);
        this.events[name] = def;
    }

    addEnvironmentSensorTriggers(triggers) {
        this.environmentSensorTriggers.push(...triggers);
    }

    /** @returns {object} the real, final `minecraft:entity` (BP) document. */
    toJSON(identifier, { spawnable = false, summonable = true, experimental = false, runtimeIdentifier, formatVersion = "1.20.0", properties } = {}) {
        const components = { ...this.components };
        if (this.environmentSensorTriggers.length > 0) {
            components["minecraft:environment_sensor"] = { triggers: this.environmentSensorTriggers };
        }
        const doc = {
            format_version: formatVersion,
            "minecraft:entity": {
                description: {
                    identifier,
                    ...(runtimeIdentifier ? { runtime_identifier: runtimeIdentifier } : {}),
                    is_spawnable: spawnable,
                    is_summonable: summonable,
                    is_experimental: experimental,
                    ...(properties ? { properties } : {}),
                },
                components,
            },
        };
        if (Object.keys(this.componentGroups).length > 0) doc["minecraft:entity"].component_groups = this.componentGroups;
        if (Object.keys(this.events).length > 0) doc["minecraft:entity"].events = this.events;
        return doc;
    }
}

// Real, standing rule (see the top-level demand this enforces): OpenRock
// must never be able to compile hand-rolled, native Bedrock JSON - every
// real document an entity needs, BP behavior AND RP visual alike, has to
// be genuinely authorable through this one DSL. Building the real
// `minecraft:client_entity` document HERE (from <Entity>'s own real,
// confirmed-via-live-research visual props) is what actually closes that
// gap - before this, a mod still had to hand-author `entity/<name>.json`
// under a raw rpOverlayDir, the exact loophole the "no native compiling"
// rule exists to close. Returns null when the author gave no real visual
// props at all - a real, deliberate choice (a summon-only helper entity
// with no client presence), never a required document.
function buildClientEntityDoc(identifier, attrs) {
    const { materials, textures, geometry, renderControllers, spawnEgg, enableAttachables, hideArmor, clientScripts, clientFormatVersion = "1.16.0" } = attrs;
    if (!materials && !textures && !geometry && !renderControllers && !spawnEgg) return null;
    const description = { identifier };
    if (materials) description.materials = materials;
    if (textures) description.textures = textures;
    if (geometry) description.geometry = geometry;
    if (renderControllers) description.render_controllers = renderControllers;
    if (spawnEgg) description.spawn_egg = spawnEgg;
    if (enableAttachables !== undefined) description.enable_attachables = enableAttachables;
    if (hideArmor !== undefined) description.hide_armor = hideArmor;
    if (clientScripts) description.scripts = clientScripts;
    return { format_version: clientFormatVersion, "minecraft:client_entity": { description } };
}

// A minimal sink used only for a <ComponentGroup>'s own children - real
// Bedrock component_groups are a flat bag of components, never nested
// groups/events/environment-sensor-triggers of their own.
class ComponentGroupSink {
    constructor() { this.components = {}; }
    addComponent(type, value) {
        if (type in this.components) throw new Error(`EntityBuilder: duplicate component "${type}" within one <ComponentGroup>`);
        this.components[type] = value;
    }
    addComponentGroup() { throw new Error("EntityBuilder: <ComponentGroup> cannot nest another <ComponentGroup> - real Bedrock component_groups are flat"); }
    addEvent() { throw new Error("EntityBuilder: an event cannot be declared inside a <ComponentGroup> - declare it at the <Entity> root"); }
    addEnvironmentSensorTriggers() { throw new Error("EntityBuilder: <Pathfinding> (or any environment_sensor-driven tag) cannot be nested inside a <ComponentGroup>"); }
}

const TAG_HANDLERS = {
    ComponentGroup(node, sink) {
        const groupSink = new ComponentGroupSink();
        for (const child of node.children) emitNode(child, groupSink);
        sink.addComponentGroup(node.attrs.name, groupSink.components);
    },

    Event(node, sink) {
        sink.addEvent(node.attrs.name, node.attrs.definition);
    },

    RawComponent(node, sink) {
        sink.addComponent(node.attrs.type, node.attrs.value);
    },

    Pathfinding(node, sink) {
        const opts = {};
        if (node.attrs.tagPrefix) {
            opts.anchorTagPrefix = `${node.attrs.tagPrefix}_anchor_slot_`;
            opts.navigatingTagPrefix = `${node.attrs.tagPrefix}_navigating_slot_`;
        }
        const { componentGroups, environmentSensorTrigger, events } = generateNavSlots(node.attrs.slots, opts);
        for (const [name, components] of Object.entries(componentGroups)) sink.addComponentGroup(name, components);
        sink.addEnvironmentSensorTriggers(environmentSensorTrigger.triggers);
        for (const [name, def] of Object.entries(events)) sink.addEvent(name, def);
    },
};

/**
 * Registers a new tag handler at runtime - the real extension point other
 * OR-Track L libraries (formation, perception, terrain) can use to add
 * their own `<X/>` DSL components later without touching this file's core.
 */
function registerTagHandler(tag, handler) {
    if (TAG_HANDLERS[tag]) throw new Error(`EntityBuilder: tag "${tag}" already has a registered handler`);
    TAG_HANDLERS[tag] = handler;
}

function emitNode(node, sink) {
    if (!node || typeof node.tag !== "string") throw new Error(`EntityBuilder: expected a real {tag,...} node, got ${JSON.stringify(node)}`);
    const handler = TAG_HANDLERS[node.tag];
    if (!handler) throw new Error(`EntityBuilder: unknown entity DSL tag "${node.tag}" - no registered handler`);
    handler(node, sink);
}

/**
 * The real top-level entry point: takes an `<Entity>` root node (from the
 * JSX authoring layer, M1) and produces the real, final Bedrock document(s)
 * - the BP behavior document always, the RP client_entity visual document
 * only when the author gave real visual props (see buildClientEntityDoc()).
 * @param {object} entityNode - a real `{tag:"Entity", attrs, children}` node.
 * @returns {{bp: object, rp: object|null}}
 */
function buildEntity(entityNode) {
    if (entityNode.tag !== "Entity") throw new Error(`EntityBuilder: buildEntity() requires a real <Entity> root node, got tag "${entityNode.tag}"`);
    const builder = new EntityBuilder();
    for (const child of entityNode.children) emitNode(child, builder);
    const bp = builder.toJSON(entityNode.attrs.identifier, entityNode.attrs);
    const rp = buildClientEntityDoc(entityNode.attrs.identifier, entityNode.attrs);
    return { bp, rp };
}

module.exports = { EntityBuilder, buildEntity, buildClientEntityDoc, registerTagHandler, TAG_HANDLERS };
