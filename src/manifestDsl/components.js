// OpenRock manifest DSL - the real component vocabulary (OR-Track O),
// exhaustively covering every field confirmed via real Microsoft Learn docs
// (learn.microsoft.com/en-us/minecraft/creator/reference/content/
// manifestreference/packmanifestdocument) for the "3.0.0.PackManifestDocument"
// shape - including fields OpenRock does nothing with today
// (settings[], capabilities like chemistry/raytraced/pbr, pack_scope,
// platform_locked, base_game_version, pack_optimization_version). Per
// demand 4's explicit instruction, EVERY confirmed field gets a real,
// typed component - pass-through only where OpenRock has no validation
// logic yet, never omitted for being currently unused.
//
// `subpacks`'s real shape ({folder_name, name, memory_performance_tier})
// was confirmed via a live docs fetch before this file was written - not
// guessed, per the plan's explicit instruction.
"use strict";

function raw(tag, attrs) {
    return { tag, attrs, children: [], line: 0 };
}

/** The whole manifest DSL file's top-level node: one <Behavior> and/or one <Resource> child. */
function ManifestSet(props) {
    return { tag: "ManifestSet", attrs: {}, children: props.children ?? [], line: 0 };
}

/** A single pack's real manifest.json - wraps <Header>/<Module>/<Dependency>/... children. */
function Behavior(props) {
    return { tag: "Behavior", attrs: { format_version: props.formatVersion ?? 2 }, children: props.children ?? [], line: 0 };
}
function Resource(props) {
    return { tag: "Resource", attrs: { format_version: props.formatVersion ?? 2 }, children: props.children ?? [], line: 0 };
}

/**
 * @param {object} props - name, description, uuid, version (array [maj,min,patch] or string),
 *   min_engine_version (array), base_game_version (world-template only), allow_random_seed
 *   (world-template only), lock_template_options (world-template only), pack_scope (RP only,
 *   "any"/"world_template"/"personas"/"global_resource"), platform_locked, pack_optimization_version.
 */
function Header(props) {
    return raw("Header", {
        name: props.name, description: props.description, uuid: props.uuid,
        version: props.version, min_engine_version: props.minEngineVersion,
        base_game_version: props.baseGameVersion, allow_random_seed: props.allowRandomSeed,
        lock_template_options: props.lockTemplateOptions, pack_scope: props.packScope,
        platform_locked: props.platformLocked, pack_optimization_version: props.packOptimizationVersion,
    });
}

/** @param {object} props - description, type ("resources"|"data"|"world_template"|"script"|"client_data"), uuid, version, language (script only, "javascript"), entry (script only). */
function Module(props) {
    return raw("Module", {
        description: props.description, type: props.type, uuid: props.uuid,
        version: props.version, language: props.language, entry: props.entry,
    });
}

/** @param {object} props - EITHER uuid, OR module_name (a built-in API module like "@minecraft/server"); version required either way. */
function Dependency(props) {
    return raw("Dependency", { uuid: props.uuid, module_name: props.moduleName, version: props.version });
}

/** @param {object} props - name: one of "chemistry"|"editorExtension"|"experimental_custom_ui"|"raytraced"|"pbr". */
function Capability(props) {
    return raw("Capability", { name: props.name });
}

/** @param {object} props - authors[], license, url, generated_with, product_type. */
function Metadata(props) {
    return raw("Metadata", {
        authors: props.authors, license: props.license, url: props.url,
        generated_with: props.generatedWith, product_type: props.productType,
    });
}

/** v3-preview only. @param {object} props - type ("label"|"toggle"|"slider") plus that type's own real fields, passed through as-is. */
function Setting(props) {
    const { children, ...rest } = props;
    return raw("Setting", rest);
}

/** RP-only, requires manifest v3. @param {object} props - folder_name, name, memory_performance_tier (1-5). */
function Subpack(props) {
    return raw("Subpack", { folder_name: props.folderName, name: props.name, memory_performance_tier: props.memoryPerformanceTier });
}

module.exports = { ManifestSet, Behavior, Resource, Header, Module, Dependency, Capability, Metadata, Setting, Subpack };
