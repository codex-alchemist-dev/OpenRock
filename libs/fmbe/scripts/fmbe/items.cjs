"use strict";

// Which item ids the FMBE systems cannot place correctly - the exceptions list from the wiki's "Advanced FMBE Display
// Categories" (the fox holds these differently from other items). Matching is by id shape, not a block table.
const EXCEPTION_PATTERNS = [
    [/(^|:)trident$/, "trident"], [/(^|:)spyglass$/, "spyglass"], [/(^|:)bow$/, "bow"],
    [/(^|:)(skull|player_head|zombie_head|creeper_head|dragon_head|piglin_head|skeleton_skull|wither_skeleton_skull)$/, "head"],
    [/(^|:)banner$|_banner$/, "banner"], [/(^|:)heavy_core$/, "heavy core"], [/(^|:)conduit$/, "conduit"],
    [/(^|:)decorated_pot$/, "decorated pot"], [/_button$|(^|:)button$/, "button"],
];
const UNSUPPORTED_PATTERNS = [[/(^|:)shield$/, "shield"]];

/** @returns {{level: "ok"|"exception"|"unsupported", what?: string}} */
function itemSupport(id) {
    const s = String(id);
    for (const [re, what] of UNSUPPORTED_PATTERNS) if (re.test(s)) return { level: "unsupported", what };
    for (const [re, what] of EXCEPTION_PATTERNS) if (re.test(s)) return { level: "exception", what };
    return { level: "ok" };
}

const withNamespace = id => (String(id).includes(":") ? String(id) : `minecraft:${id}`);

module.exports = { itemSupport, withNamespace };
