// Crystal Refs inside the documents the Crystal TSX dialects produce. TypeScript cannot take a bare `@:name` token, so in a
// .tsx file a reference is a string that is EXACTLY a reference - `"@:mira"` or `"@nem:mira"` - anywhere in the output
// (an attribute, a component value, an event target). After compile each such string becomes its plain `ns:name` id and is
// handed to the linker, kind "any": it must name SOMETHING the project defines (entity, item, block, particle, sound, ...).
"use strict";

const REF_STRING = /^@([A-Za-z_][A-Za-z0-9_-]*)?:([A-Za-z_][A-Za-z0-9_./-]*)$/;

/**
 * @param {*} doc a compiled JSON document
 * @param {{ns: string|null, file: string}} where project namespace and the output path (for messages)
 * @returns {{doc: *, refs: Array<{kind: "any", ns: string, id: string, file: string, line: number, col: number, path: string}>}}
 */
function resolveDocRefs(doc, { ns, file }) {
    const refs = [];
    const walk = (value, jsonPath) => {
        if (typeof value === "string") {
            const m = REF_STRING.exec(value);
            if (!m) return value;
            const refNs = m[1] || ns;
            if (!refNs) throw new Error(`${file} ${jsonPath}: "${value}" needs a project namespace (the mod's "namespace")`);
            const id = `${refNs}:${m[2]}`;
            refs.push({ kind: "any", ns: refNs, id, file: `${file} ${jsonPath}`, line: 1, col: 1, path: jsonPath });
            return id;
        }
        if (Array.isArray(value)) return value.map((v, i) => walk(v, `${jsonPath}[${i}]`));
        if (value && typeof value === "object" && !Buffer.isBuffer(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, `${jsonPath}.${k}`)]));
        return value;
    };
    return { doc: walk(doc, "$"), refs };
}

module.exports = { resolveDocRefs, REF_STRING };
