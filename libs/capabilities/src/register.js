// @openrock/capabilities - a thin, typed convenience layer directly on
// MCLite. "A capability" is just a typed MCLite record kind: registering
// one is registerRecordKind() plus a schema-generated validator, so a mod
// declares "a waifu has this shape" once and gets a real, checksum-checked,
// atomically-written record kind for free - no hand-written validate()
// function required for the common case (one is still accepted directly,
// for anything a flat type schema can't express).
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

// Scalar types plus "<type>[]" array-of-that-type, and "any" as an escape
// hatch for a field this schema language can't usefully constrain.
function matchesType(value, type) {
    if (type.endsWith("[]")) {
        const elemType = type.slice(0, -2);
        return Array.isArray(value) && value.every(v => matchesType(v, elemType));
    }
    switch (type) {
        case "string": return typeof value === "string";
        case "number": return typeof value === "number";
        case "boolean": return typeof value === "boolean";
        case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
        case "any": return true;
        default: throw new Error(`@openrock/capabilities: unknown schema type "${type}"`);
    }
}

module.exports = function register(kernel, ctx) {
    const mclite = ctx.dependencies.mclite;

    /**
     * @param {string} kind
     * @param {Record<string,string>} schema - field name -> type
     *   ("string"|"number"|"boolean"|"object"|"any", or "<type>[]"). Every
     *   declared field is required to be present and correctly typed;
     *   fields not in the schema are allowed through unchecked (a schema
     *   only ever adds constraints, never strips content).
     * @param {object} [opts]
     * @param {string} [opts.keyPrefix] - defaults to `kind`.
     * @param {(record: object) => boolean} [opts.validate] - an escape
     *   hatch: if given, this replaces the schema-generated validator
     *   entirely (the schema is still useful as documentation).
     */
    function registerCapability(kind, schema, { keyPrefix = kind, validate } = {}) {
        const finalValidate = validate ?? function schemaValidate(record) {
            if (!record || typeof record !== "object") return false;
            if (typeof record._checksum !== "string" || !mclite.verifyChecksum(record)) return false;
            for (const [field, type] of Object.entries(schema ?? {})) {
                if (!(field in record) || !matchesType(record[field], type)) return false;
            }
            return true;
        };
        mclite.registerRecordKind(kind, { keyPrefix, validate: finalValidate });
    }

    return {
        api: {
            registerCapability,
            // Pass-throughs so a consumer never needs to reach past
            // "capabilities" into MCLite directly for the common case.
            readCapability: (owner, world, kind, id) => mclite.readRecord(owner, world, kind, id),
            writeCapability: (owner, world, kind, id, mutate) => mclite.writeRecord(owner, world, kind, id, mutate),
        },
    };
};
