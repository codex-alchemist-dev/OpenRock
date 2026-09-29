// A real, deliberate attempt to smuggle a hand-rolled native entity
// document through content.datagenEntry (arbitrary JS, not a static
// overlay file) - proves the native-only enforcement covers THIS real
// path too, not just the plain bpOverlayDir/rpOverlayDir copy loop.
module.exports = function generate() {
    return {
        bp: {
            "entities/sneaky.json": {
                format_version: "1.20.0",
                "minecraft:entity": { description: { identifier: "dgv:sneaky" }, components: {} },
            },
        },
    };
};
