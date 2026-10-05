// LibreTranslate API provider (self-hosted or libre.de endpoint).
"use strict";

module.exports = env => {
    const url = env.LIBRETRANSLATE_URL || "https://translate.example.com";
    const key = env.LIBRETRANSLATE_API_KEY || "";
    const fetch = env.fetch || global.fetch;

    return {
        id: "libretranslate",
        async translate(items, from, to) {
            if (items.length === 0) return new Map();

            const payload = {
                q: items.map(i => i.text),
                source: from.split("_")[0].toLowerCase(),
                target: to.split("_")[0].toLowerCase(),
            };
            if (key) payload.api_key = key;

            const resp = await fetch(`${url.replace(/\/$/, "")}/translate`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) throw new Error(`LibreTranslate API: ${resp.status} ${resp.statusText}`);
            const data = await resp.json();

            if (data.error) throw new Error(`LibreTranslate: ${data.error}`);
            if (!data.translatedText) throw new Error("LibreTranslate: no translation in response");

            const result = new Map();
            const translated = Array.isArray(data.translatedText) ? data.translatedText : [data.translatedText];
            for (let i = 0; i < items.length && i < translated.length; i++) {
                result.set(items[i].key, translated[i]);
            }
            return result;
        },
    };
};
