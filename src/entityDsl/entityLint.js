// OpenRock entity DSL - the real linter (OR-Track M3), modeled EXACTLY on
// MinUI's own proven lib/lintjsonui.js: a plain structural/regex walk over
// the FINAL EMITTED JSON, encoding only confirmed, real failure classes -
// never a general schema validator. Run over both the entity DSL's own
// compiled output (regression-checks the compiler itself) AND any
// hand-authored overlay JSON still passing through bpOverlayDir/rpOverlayDir.
//
// Reuses @openrock/molang-safe's real, already-tested validateExpression()
// for Molang crash signatures - never a second, drifting reimplementation.
"use strict";

const path = require("path");
const { validateExpression } = require(path.join(__dirname, "..", "..", "libs", "molang-safe", "src", "register.js"));

// A string is treated as "Molang-shaped" (worth running validateExpression
// on) only if it looks like one - a bare identifier like "prd:nav_test" or
// "minecraft:health" should never be flagged. Real Molang expressions use
// query./q./v./variable. prefixes, #properties, or parenthesized operators.
const MOLANG_SHAPE = /(?:^|[^a-zA-Z_])(?:q(?:uery)?\.|v(?:ariable)?\.|#\w)|[()!]/;

function walkStrings(value, visit, pathSoFar = "") {
    if (typeof value === "string") {
        visit(value, pathSoFar);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => walkStrings(v, visit, `${pathSoFar}[${i}]`));
        return;
    }
    if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walkStrings(v, visit, pathSoFar ? `${pathSoFar}.${k}` : k);
    }
}

/**
 * Basic shape checks on an RP client entity document alone (no cross-file
 * reading): declared-but-empty short-name groups, a missing
 * render_controllers list. Real but narrow - see
 * lintRenderControllerReferences() below for the actual cross-reference
 * check (needs the render_controllers file's own content too).
 */
function lintClientEntityDoc(doc, label) {
    const issues = [];
    const desc = doc?.["minecraft:client_entity"]?.description;
    if (!desc) return issues;

    const declaredGroups = { materials: desc.materials, geometry: desc.geometry, textures: desc.textures };
    for (const [groupName, group] of Object.entries(declaredGroups)) {
        if (!group || typeof group !== "object") continue;
        if (Object.keys(group).length === 0) {
            issues.push(`${label}: description.${groupName} is declared but empty - remove it or add a real short-name`);
        }
    }
    if (!Array.isArray(desc.render_controllers) || desc.render_controllers.length === 0) {
        issues.push(`${label}: description.render_controllers is missing or empty - the entity has no real way to be drawn at all`);
    }
    return issues;
}

// Matches `Material.default`, `Geometry.default`, `Texture.default`,
// `Array.foo[...]` style short-name references inside a render_controllers
// document's own material/geometry/textures fields.
const SHORT_NAME_REF = /^(Material|Geometry|Texture)\.([A-Za-z0-9_]+)/;

/**
 * The real cross-file check: every `Material.X`/`Geometry.X`/`Texture.X`
 * short-name a render_controllers document references must actually be
 * DECLARED in the client entity's own description.materials/geometry/
 * textures block - directly targets the real failure class from tonight
 * (a render controller or description referencing a short-name that was
 * renamed/misspelled on the other side, so the entity spawns but has
 * nothing real to render with). Does NOT validate that a declared VALUE
 * (e.g. "zombie") is a real, existing vanilla material identifier - that
 * needs a real vanilla-identifier allowlist, deferred until it's been
 * properly researched rather than guessed (see the plan's own note).
 * @param {object} clientEntityDoc - a real minecraft:client_entity document.
 * @param {object[]} renderControllerDocs - real render_controllers documents
 *   this entity's description.render_controllers list references.
 */
function lintRenderControllerReferences(clientEntityDoc, renderControllerDocs, label) {
    const issues = [];
    const desc = clientEntityDoc?.["minecraft:client_entity"]?.description;
    if (!desc) return issues;

    const declared = {
        Material: new Set(Object.keys(desc.materials ?? {})),
        Geometry: new Set(Object.keys(desc.geometry ?? {})),
        Texture: new Set(Object.keys(desc.textures ?? {})),
    };

    for (const rcDoc of renderControllerDocs) {
        const controllers = rcDoc?.render_controllers ?? {};
        for (const [controllerName, controller] of Object.entries(controllers)) {
            const refs = [];
            if (typeof controller.geometry === "string") refs.push(controller.geometry);
            for (const m of controller.materials ?? []) for (const v of Object.values(m)) if (typeof v === "string") refs.push(v);
            for (const t of controller.textures ?? []) if (typeof t === "string") refs.push(t);
            for (const ref of refs) {
                const match = SHORT_NAME_REF.exec(ref);
                if (!match) continue; // an Array.foo[...] Molang expression, not a direct short-name - out of scope here
                const [, kind, shortName] = match;
                if (!declared[kind].has(shortName)) {
                    issues.push(`${label}: render controller "${controllerName}" references ${kind}.${shortName}, but description.${kind.toLowerCase()}${kind === "Material" ? "s" : kind === "Geometry" ? "" : "s"} has no "${shortName}" entry declared`);
                }
            }
        }
    }
    return issues;
}

/**
 * Molang crash signatures (>=, bare '', string division) via
 * @openrock/molang-safe's real validateExpression(), applied only to
 * strings that actually look like Molang - never flags an ordinary
 * identifier/namespace string.
 */
function lintMolangStrings(doc, label) {
    const issues = [];
    walkStrings(doc, (str, pathSoFar) => {
        if (!MOLANG_SHAPE.test(str)) return;
        const result = validateExpression(str);
        if (!result.valid) {
            for (const issue of result.issues) issues.push(`${label}: ${pathSoFar}: ${issue}`);
        }
    });
    return issues;
}

/**
 * A real component_group's follow_mob filter (or any has_tag filter)
 * referencing the SAME tag value as another component_group in the same
 * entity is a real correctness bug - two "slots" that were meant to be
 * distinct silently collide. Generalizes the same failure family MinUI's
 * own +7-offset shared-array bug belongs to.
 */
function lintTagCollisions(doc, label) {
    const issues = [];
    const groups = doc?.["minecraft:entity"]?.component_groups;
    if (!groups) return issues;

    const seenByTagValue = new Map(); // tagValue -> [groupName, ...]
    walkStrings(groups, (str, pathSoFar) => {
        if (!/\.filters\.value$/.test(pathSoFar)) return;
        const groupName = pathSoFar.split(".")[0];
        if (!seenByTagValue.has(str)) seenByTagValue.set(str, []);
        seenByTagValue.get(str).push(groupName);
    });
    for (const [tagValue, groupNames] of seenByTagValue) {
        const distinctGroups = [...new Set(groupNames)];
        if (distinctGroups.length > 1) {
            issues.push(`${label}: has_tag filter value "${tagValue}" is used by MORE THAN ONE component_group (${distinctGroups.join(", ")}) - real slot-pool-style tag collision`);
        }
    }
    return issues;
}

/**
 * The real, top-level entity-doc lint pass. `doc` may be a BP entity
 * document (minecraft:entity) or an RP client entity document
 * (minecraft:client_entity) - each check no-ops cleanly for the shape it
 * doesn't apply to.
 * @returns {string[]} issues found - empty if clean.
 */
function lintEntityDoc(doc, label) {
    return [
        ...lintClientEntityDoc(doc, label),
        ...lintMolangStrings(doc, label),
        ...lintTagCollisions(doc, label),
    ];
}

module.exports = { lintEntityDoc, lintClientEntityDoc, lintRenderControllerReferences, lintMolangStrings, lintTagCollisions };
