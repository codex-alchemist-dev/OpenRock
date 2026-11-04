"use strict";

// Build-time provider for the gen-mod fixture (see src/generatedModules.js). It reads the mod's own data folder and
// returns the bundled module source plus one generated resource-pack file.
const path = require("path");

module.exports = ctx => {
    const rows = Object.keys(ctx.readJsonTable(path.join(ctx.dir, "data")));
    const ns = JSON.stringify(ctx.manifest.namespace);
    const char = JSON.stringify(ctx.templateVars.char);
    const rowList = JSON.stringify(rows);
    return {
        source: `module.exports = { "ns": ${ns}, "char": ${char}, "rows": ${rowList} };\n`,
        rp: { "textures/generated/gen.txt": "from provider" },
    };
};
