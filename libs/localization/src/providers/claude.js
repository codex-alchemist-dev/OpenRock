// Anthropic Claude API provider via Messages API.
"use strict";

module.exports = env => {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY environment variable is required");
    const fetch = env.fetch || global.fetch;
    const model = env.OPENROCK_MTL_MODEL || "claude-haiku-4-5-20251001";

    return {
        id: "claude",
        async translate(items, from, to) {
            if (items.length === 0) return new Map();

            const text = items.map(i => `${i.key}:${i.text}`).join("\n");
            const prompt = `Translate the following from ${from} to ${to}. Preserve sentinels ⟦n⟧ exactly; do not translate them. Return only the translated key:text pairs, one per line.

${text}`;

            const resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
            });

            if (!resp.ok) throw new Error(`Claude API: ${resp.status} ${resp.statusText}`);
            const data = await resp.json();

            if (data.error) throw new Error(`Claude: ${data.error.message}`);
            if (!data.content?.[0]?.text) throw new Error("Claude: no translation in response");

            const result = new Map();
            const lines = data.content[0].text.split("\n");
            for (const line of lines) {
                const [key, ...parts] = line.split(":");
                if (key && parts.length > 0) result.set(key.trim(), parts.join(":").trim());
            }
            return result;
        },
    };
};
