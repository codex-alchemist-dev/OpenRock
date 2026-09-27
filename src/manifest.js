// OpenRock manifest schema + validator - a scaffold only (OR-Phase 1 in
// happy-wibbling-pie.md). The real shape (plugin vs mod manifests,
// dependsOn resolution against vendor/ submodules and loaded plugins) is
// designed and built in OR-Phase 3.
//
// Target shape (OR-Phase 3):
//   { openrockVersion: 1, kind: "plugin" | "mod", name, version, ...
//     dependsOn: { <name>: { type: "submodule" | "plugin", ... } } }
//   Plugin manifests additionally declare `entry` and `provides`.
//   Mod manifests additionally declare `namespace`, `character`, `packs`,
//   `content`, `rules` - the real engine-facing fields today's
//   Claude Waifus/PATCHES/project.json already carries.
"use strict";

function validateManifest(/* manifest */) {
    throw new Error("manifest.validateManifest() is not implemented yet - see OR-Phase 3 in happy-wibbling-pie.md.");
}

function resolveDependency(/* manifest, depName, { vendorDir, loadedPlugins } */) {
    throw new Error("manifest.resolveDependency() is not implemented yet - see OR-Phase 2/3 in happy-wibbling-pie.md.");
}

module.exports = { validateManifest, resolveDependency };
