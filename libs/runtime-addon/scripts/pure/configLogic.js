// Pure, zero-import config logic - see hash.js's own header comment for
// why this is split out from config.js/menu.js (both of which import
// @minecraft/server and so can't be directly tested in plain Node).

/**
 * Every declared field's current value: the stored value if present and of
 * the field's declared type, else its declared default. A stored value of
 * the WRONG type (e.g. corrupted/hand-edited dynamic property JSON) falls
 * back to the default rather than being trusted as-is.
 * @param {Array<{key:string,type:"string"|"number"|"boolean",default:any}>} fields
 * @param {Record<string,any>} stored
 */
export function resolveConfigValues(fields, stored) {
    const out = {};
    for (const f of fields) {
        const v = stored?.[f.key];
        out[f.key] = typeof v === f.type ? v : f.default;
    }
    return out;
}

/**
 * Coerces a ModalFormData result's raw formValues (in field order) into
 * real typed values per each field's declared type, merged onto the
 * previous values (so a form field not present for some reason keeps its
 * old value rather than being wiped).
 * @param {Array<{key:string,type:"string"|"number"|"boolean"}>} fields
 * @param {any[]} rawValues
 * @param {Record<string,any>} previousValues
 */
export function coerceFieldValues(fields, rawValues, previousValues) {
    const next = { ...previousValues };
    fields.forEach((f, i) => {
        const raw = rawValues[i];
        if (raw === undefined) return;
        next[f.key] = f.type === "number" ? Number(raw) : f.type === "boolean" ? Boolean(raw) : String(raw);
    });
    return next;
}
