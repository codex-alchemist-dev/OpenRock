// OpenRock manifest DSL - the real, DECLARATIVE emission backend (OR-Track
// O), mirroring MinUI's own proven lib/compile.js ScreenCompiler shape
// (tree-walking, not imperative allocation-ordered like entityBuilder.js) -
// correct here specifically because manifest fields genuinely have no
// ordering/allocation semantics (no shared component_group array, no tag
// bookkeeping across siblings - each child just contributes one field or
// one array entry to a plain object), unlike the entity DSL's component
// groups.
"use strict";

// Strips undefined-valued keys (an omitted optional prop, e.g. no
// `baseGameVersion` on <Header>) so the emitted JSON never carries a real
// `"base_game_version": undefined`-shaped hole - `JSON.stringify` would
// already drop it, but keeping the in-memory object clean too avoids
// surprises for anything (like the merge logic below) that inspects it
// before stringifying.
function cleanAttrs(attrs) {
    const out = {};
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) out[k] = v;
    return out;
}

/**
 * Walks one <Behavior>/<Resource> node's children into a real Bedrock
 * manifest.json-shaped object. An array-producing field (modules,
 * dependencies, capabilities, settings, subpacks) is omitted entirely when
 * empty - matching buildManifests()'s existing convention of never emitting
 * a field Bedrock treats as "not set" as an empty array.
 * @param {object} packNode - a real <Behavior> or <Resource> node.
 * @returns {object}
 */
function buildPack(packNode) {
    const doc = { format_version: packNode.attrs.format_version };
    let header = null;
    const modules = [];
    const dependencies = [];
    const capabilities = [];
    let metadata = null;
    const settings = [];
    const subpacks = [];

    for (const child of packNode.children) {
        switch (child.tag) {
            case "Header":
                header = cleanAttrs(child.attrs);
                break;
            case "Module":
                modules.push(cleanAttrs(child.attrs));
                break;
            case "Dependency": {
                const dep = cleanAttrs(child.attrs);
                if (dep.uuid === undefined && dep.module_name === undefined) {
                    throw new Error(`manifest DSL: <Dependency> needs a real uuid or moduleName, got neither`);
                }
                dependencies.push(dep);
                break;
            }
            case "Capability":
                if (!child.attrs.name) throw new Error(`manifest DSL: <Capability> needs a real name`);
                capabilities.push(child.attrs.name);
                break;
            case "Metadata":
                metadata = cleanAttrs(child.attrs);
                break;
            case "Setting":
                settings.push(cleanAttrs(child.attrs));
                break;
            case "Subpack":
                subpacks.push(cleanAttrs(child.attrs));
                break;
            default:
                throw new Error(`manifest DSL: <Behavior>/<Resource> can't contain a <${child.tag}> - only Header/Module/Dependency/Capability/Metadata/Setting/Subpack`);
        }
    }

    if (header) doc.header = header;
    if (modules.length) doc.modules = modules;
    if (dependencies.length) doc.dependencies = dependencies;
    if (capabilities.length) doc.capabilities = capabilities;
    if (metadata) doc.metadata = metadata;
    if (settings.length) doc.settings = settings;
    if (subpacks.length) doc.subpacks = subpacks;
    return doc;
}

/**
 * @param {object} manifestSetNode - the real, top-level <ManifestSet> node
 *   (a manifest DSL file's default export).
 * @returns {{bp: object|null, rp: object|null}}
 */
function buildManifestSet(manifestSetNode) {
    if (!manifestSetNode || manifestSetNode.tag !== "ManifestSet") {
        throw new Error(`manifest DSL: a .manifest.tsx file must default-export a real <ManifestSet> node, got ${JSON.stringify(manifestSetNode)}`);
    }
    let bp = null;
    let rp = null;
    for (const child of manifestSetNode.children) {
        if (child.tag === "Behavior") bp = buildPack(child);
        else if (child.tag === "Resource") rp = buildPack(child);
        else throw new Error(`manifest DSL: <ManifestSet> can only contain <Behavior>/<Resource>, got <${child.tag}>`);
    }
    return { bp, rp };
}

/**
 * Merges a real manifest DSL override document onto buildManifests()'s own
 * generated document - the DSL EXTENDS/OVERRIDES the base generator's
 * output (per the plan's own stated relationship), it never fully replaces
 * it: header/metadata fields merge per-key (DSL wins on a real collision),
 * array fields (modules/dependencies/capabilities/settings/subpacks)
 * concatenate (the DSL adds entries, e.g. a real <Capability name="pbr"/>,
 * without having to re-declare the generator's own script/data modules).
 * @param {object} generated - buildManifests()'s own output for one pack.
 * @param {object|null} dslDoc - buildPack()'s output for the same pack, or null.
 */
function mergeManifestDoc(generated, dslDoc) {
    if (!dslDoc) return generated;
    const merged = { ...generated };
    if (dslDoc.format_version !== undefined) merged.format_version = dslDoc.format_version;
    if (dslDoc.header) merged.header = { ...generated.header, ...dslDoc.header };
    if (dslDoc.metadata || generated.metadata) merged.metadata = { ...generated.metadata, ...dslDoc.metadata };
    for (const key of ["modules", "dependencies", "capabilities", "settings", "subpacks"]) {
        const base = generated[key] ?? [];
        const extra = dslDoc[key] ?? [];
        if (base.length || extra.length) merged[key] = [...base, ...extra];
    }
    return merged;
}

module.exports = { buildPack, buildManifestSet, mergeManifestDoc };
