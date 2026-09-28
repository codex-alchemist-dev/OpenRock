// @openrock/i18n - MinUI's own real, proven RawMessage/per-player-override
// translation mechanism (the UI PLAN document's "i18n (ui/i18n.js)" design),
// generalized so any mod gets correctly localized text without needing a UI
// screen involved at all. Two paths, exactly as MinUI already ships them:
//   - No override: text goes out as a real Bedrock RawMessage
//     ({translate, with}) - the CLIENT localizes it in its own game
//     language, for free, no server-side table needed.
//   - A per-player override IS set (the only route for a language Bedrock
//     doesn't ship as a real game locale, e.g. a novelty/constructed
//     language): resolved server-side into a literal string from a
//     registered locale table instead.
// The per-player override itself is stored through @openrock/capabilities
// (MCLite-backed), the same real, atomic storage every other persisted
// preference in this ecosystem uses.
//
// See "OR-Track L", Part 1, item 11, in the project plan document.
//
// OR-Track N (2026-09-28): PARTIAL hoist, unlike this library's siblings -
// translate()/registerLocaleTable()/resolveLiteral() are genuinely pure (no
// capabilities dependency) and are real top-level module.exports, so a
// mod's own in-game script can `import { translate } from "@openrock/i18n"`
// directly for RawMessage building without any kernel wiring at all. The
// player-override functions (setPlayerLanguageOverride, etc.) genuinely
// need @openrock/capabilities injected via ctx at register() time and stay
// kernel-only - they can't be hoisted without inventing a second, fake
// capabilities dependency, which would be exactly the kind of dual-
// implementation this whole track exists to avoid. `tables` is a real
// module-level singleton (not per-register()-call) so the hoisted pure
// functions and the kernel-only capabilities-backed functions below both
// see the same registered locale tables.
"use strict";

const OVERRIDE_KIND = "i18n:override";
const OVERRIDE_ID = "value";

const tables = new Map(); // langCode -> { key -> template string, "{0}"/"{1}"/... placeholders }

/** @returns {{translate:string, with?:string[]}} a real Bedrock RawMessage - the client localizes this itself. */
function translate(key, params = []) {
    return params.length > 0 ? { translate: key, with: params.map(String) } : { translate: key };
}

/** Registers (or replaces) a literal-text table for one language code. */
function registerLocaleTable(langCode, table) {
    if (typeof langCode !== "string" || !langCode) throw new Error("@openrock/i18n: registerLocaleTable() requires a real langCode string");
    if (!table || typeof table !== "object") throw new Error("@openrock/i18n: registerLocaleTable() requires a real table object");
    tables.set(langCode, table);
}

/** Resolves `key` against a registered literal table, substituting `{0}`, `{1}`, ... - null if the language or key isn't registered. */
function resolveLiteral(langCode, key, params = []) {
    const table = tables.get(langCode);
    if (!table) return null;
    const template = table[key];
    if (template === undefined) return null;
    return params.reduce((s, p, i) => s.split(`{${i}}`).join(String(p)), template);
}

function register(kernel, ctx) {
    const capabilities = ctx.dependencies["@openrock/capabilities"];
    capabilities.registerCapability(OVERRIDE_KIND, { lang: "string" });

    function setPlayerLanguageOverride(owner, world, lang) {
        return capabilities.writeCapability(owner, world, OVERRIDE_KIND, OVERRIDE_ID, () => ({ lang }));
    }

    function getPlayerLanguageOverride(owner, world) {
        const rec = capabilities.readCapability(owner, world, OVERRIDE_KIND, OVERRIDE_ID);
        return rec ? rec.lang : null;
    }

    function clearPlayerLanguageOverride(owner, world) {
        return capabilities.writeCapability(owner, world, OVERRIDE_KIND, OVERRIDE_ID, () => ({ lang: "" }));
    }

    /**
     * The real per-call decision: if the player has a language override set
     * AND that language's table has this key, returns a literal string. In
     * every other case, returns a real RawMessage the client localizes
     * itself in its own game language.
     * @returns {string|{translate:string, with?:string[]}}
     */
    function resolveText(owner, world, key, params = []) {
        const override = getPlayerLanguageOverride(owner, world);
        if (override) {
            const literal = resolveLiteral(override, key, params);
            if (literal !== null) return literal;
        }
        return translate(key, params);
    }

    return {
        api: {
            translate, registerLocaleTable, resolveLiteral,
            setPlayerLanguageOverride, getPlayerLanguageOverride, clearPlayerLanguageOverride,
            resolveText,
        },
    };
}

module.exports = register;
module.exports.translate = translate;
module.exports.registerLocaleTable = registerLocaleTable;
module.exports.resolveLiteral = resolveLiteral;
