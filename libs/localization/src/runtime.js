// Per-player localization runtime integration for MinUI screens.
// Provides helpers to apply per-player language overrides to screen content.
"use strict";

module.exports = {
    // resolveTabLabel(player, key, langModule, args)
    // Resolves a tab label key to the player's language, respecting per-player override.
    // Returns a string for display in the tab.
    resolveTabLabel(player, key, langModule, args) {
        if (!langModule || typeof langModule.translate !== "function") {
            throw new Error("resolveTabLabel requires langModule with translate(lang, key, args) function");
        }
        const playerLang = langModule.getPlayerLanguage?.(player) || "en_US";
        return langModule.translate(playerLang, key, args || []);
    },

    // applyPlayerLanguageFilter(obj, player, langModule)
    // Recursively walks an object and resolves any {t:key:...} patterns in string values
    // using the player's language override. Used to post-process screens before display.
    applyPlayerLanguageFilter(obj, player, langModule) {
        if (!langModule || typeof langModule.translate !== "function") {
            throw new Error("applyPlayerLanguageFilter requires langModule with translate(lang, key, args) function");
        }
        const playerLang = langModule.getPlayerLanguage?.(player) || "en_US";
        const keyRegex = /\{t:([A-Za-z0-9_.:-]+)(?::([^\}]*))?\}/g;

        function walk(v) {
            if (typeof v === "string") {
                return v.replace(keyRegex, (match, key, argsStr) => {
                    const args = argsStr ? argsStr.split(":").map(s => s.trim()) : [];
                    return langModule.translate(playerLang, key, args);
                });
            }
            if (v && typeof v === "object") {
                if (Array.isArray(v)) return v.map(walk);
                const out = {};
                for (const [k, val] of Object.entries(v)) out[k] = walk(val);
                return out;
            }
            return v;
        }
        return walk(obj);
    },
};
