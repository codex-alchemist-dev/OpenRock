// DeepL API provider.
"use strict";

module.exports = env => {
    const key = env.DEEPL_API_KEY;
    if (!key) throw new Error("DEEPL_API_KEY environment variable is required");
    const fetch = env.fetch || global.fetch;
    const apiUrl = key.includes(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";

    return {
        id: "deepl",
        async translate(items, from, to) {
            if (items.length === 0) return new Map();

            const params = new URLSearchParams();
            for (const item of items) params.append("text", item.text);
            params.append("source_lang", from.split("_")[0].toUpperCase());
            params.append("target_lang", to.split("_")[0].toUpperCase());

            const resp = await fetch(`${apiUrl}/v2/translate`, {
                method: "POST",
                headers: { authorization: `DeepL-Auth-Key ${key}`, "content-type": "application/x-www-form-urlencoded" },
                body: params,
            });

            if (!resp.ok) throw new Error(`DeepL API: ${resp.status} ${resp.statusText}`);
            const data = await resp.json();

            if (data.error || !data.translations) throw new Error(`DeepL: ${data.message || "no translations in response"}`);

            const result = new Map();
            for (let i = 0; i < items.length && i < data.translations.length; i++) {
                result.set(items[i].key, data.translations[i].text);
            }
            return result;
        },
    };
};
