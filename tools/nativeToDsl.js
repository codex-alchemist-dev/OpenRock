#!/usr/bin/env node
// One-shot converter: native Bedrock entity / item JSON -> Crystal DSL source (.entity.tsx / .item.tsx).
//   node tools/nativeToDsl.js entity <bp-entity.json> [<rp-client-entity.json>] <outDir> [--ns=cw]
//   node tools/nativeToDsl.js item   <bp-item.json> <outDir> [--ns=cw]
// Every component becomes a <RawComponent> (lossless); standard "<ns>:navigating_slot_N" pools collapse into a loop.
// With --ns, that namespace prefix inside strings is rewritten to {{ns}} so a library/mod can reuse the source.
"use strict";

const fs = require("fs");
const path = require("path");

const J = v => JSON.stringify(v);

function templated(value, ns) {
    if (!ns) return value;
    return JSON.parse(JSON.stringify(value).split(`${ns}:`).join("{{ns}}:").split(`"${ns}_`).join('"{{ns}}_').split(`${ns}_`).join("{{ns}}_"));
}

function isStandardSlot(groups, events, ns, i) {
    const g = groups[`${ns}:navigating_slot_${i}`];
    const f = g?.["minecraft:behavior.follow_mob"];
    return f && f.filters?.value === `${ns}_anchor_slot_${i}` && f.search_range === 64 && f.stop_distance === 1 && f.speed_multiplier === 1.3
        && events[`${ns}:navigating_on_slot_${i}`] && events[`${ns}:navigating_off_slot_${i}`];
}

function convertEntity(bpFile, rpFile, outDir, ns) {
    const bp = JSON.parse(fs.readFileSync(bpFile, "utf8"));
    const e = bp["minecraft:entity"], d = e.description;
    const groups = { ...(e.component_groups ?? {}) }, events = { ...(e.events ?? {}) };
    let slots = 0;
    if (ns) {
        while (isStandardSlot(groups, events, ns, slots)) slots++;
        for (let i = 0; i < slots; i++) { delete groups[`${ns}:navigating_slot_${i}`]; delete events[`${ns}:navigating_on_slot_${i}`]; delete events[`${ns}:navigating_off_slot_${i}`]; }
    }
    const t = v => templated(v, ns);
    const props = [`identifier=${J(t(d.identifier))}`, `formatVersion=${J(bp.format_version)}`];
    if (d.runtime_identifier) props.push(`runtimeIdentifier=${J(d.runtime_identifier)}`);
    if (d.is_spawnable) props.push("spawnable");
    if (d.is_summonable === false) props.push("summonable={false}");
    if (d.is_experimental) props.push("experimental");
    if (d.properties) props.push(`properties={${J(t(d.properties))}}`);
    if (rpFile) {
        const rp = JSON.parse(fs.readFileSync(rpFile, "utf8"));
        const c = rp["minecraft:client_entity"].description;
        props.push(`clientFormatVersion=${J(rp.format_version)}`);
        for (const [k, p] of [["materials", "materials"], ["textures", "textures"], ["geometry", "geometry"], ["render_controllers", "renderControllers"], ["spawn_egg", "spawnEgg"], ["enable_attachables", "enableAttachables"], ["hide_armor", "hideArmor"]]) {
            if (c[k] !== undefined) props.push(`${p}={${J(t(c[k]))}}`);
        }
    }
    const lines = [];
    if (slots) lines.push("        {slotGroups}");
    for (const [g, comps] of Object.entries(groups)) {
        lines.push(`        <ComponentGroup name=${J(t(g))}>`);
        for (const [type, v] of Object.entries(comps)) lines.push(`            <RawComponent type=${J(type)} value={${J(t(v))}} />`);
        lines.push("        </ComponentGroup>");
    }
    for (const [name, def] of Object.entries(events)) lines.push(`        <Event name=${J(t(name))} definition={${J(t(def))}} />`);
    if (slots) lines.push("        {slotEvents}");
    for (const [type, v] of Object.entries(e.components ?? {})) lines.push(`        <RawComponent type=${J(type)} value={${J(t(v))}} />`);

    const loop = slots ? `
const slotGroups = [];
const slotEvents = [];
for (let i = 0; i < ${slots}; i++) {
    slotGroups.push(
        <ComponentGroup name={\`{{ns}}:navigating_slot_\${i}\`}>
            <RawComponent type="minecraft:behavior.follow_mob" value={{ filters: { test: "has_tag", subject: "other", value: \`{{ns}}_anchor_slot_\${i}\` }, search_range: 64, stop_distance: 1, speed_multiplier: 1.3 }} />
        </ComponentGroup>
    );
    slotEvents.push(
        <Event name={\`{{ns}}:navigating_on_slot_\${i}\`} definition={{ add: { component_groups: [\`{{ns}}:navigating_slot_\${i}\`] } }} />,
        <Event name={\`{{ns}}:navigating_off_slot_\${i}\`} definition={{ remove: { component_groups: [\`{{ns}}:navigating_slot_\${i}\`] } }} />
    );
}
` : "";
    const short = d.identifier.split(":")[1];
    const src = `import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";\nimport { Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";\n${loop}\nexport default (\n    <Entity ${props.join("\n        ")}>\n${lines.join("\n")}\n    </Entity>\n);\n`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${short}.entity.tsx`), src);
    return short;
}

function convertItem(file, outDir, ns) {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    const i = j["minecraft:item"];
    const t = v => templated(v, ns);
    const { identifier, menu_category, ...extra } = i.description;
    const props = [`identifier=${J(t(identifier))}`, `formatVersion=${J(j.format_version)}`];
    if (menu_category) props.push(`menuCategory={${J(menu_category)}}`);
    if (Object.keys(extra).length) props.push(`description={${J(t(extra))}}`);
    const body = Object.entries(i.components ?? {}).map(([type, v]) => `        <RawComponent type=${J(type)} value={${J(t(v))}} />`).join("\n");
    const src = `import * as OpenRockItem from "@openrock/item-dsl/jsx-runtime";\nimport { Item, RawComponent } from "@openrock/item-dsl";\n\nexport default (\n    <Item ${props.join(" ")}>\n${body}\n    </Item>\n);\n`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${identifier.split(":")[1]}.item.tsx`), src);
}

if (require.main === module) {
    const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
    const ns = process.argv.find(a => a.startsWith("--ns="))?.slice(5);
    const [kind, ...rest] = args;
    if (kind === "entity") {
        const outDir = rest.pop();
        console.log(convertEntity(rest[0], rest[1], outDir, ns));
    } else if (kind === "item") {
        convertItem(rest[0], rest[1], ns);
    } else console.log("Usage: nativeToDsl.js entity <bp.json> [<rp.json>] <outDir> | item <bp.json> <outDir>  [--ns=cw]");
}

module.exports = { convertEntity, convertItem };
