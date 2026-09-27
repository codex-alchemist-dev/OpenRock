// OpenRock's kernel - the registry/plugin-loading core every plugin and
// mod runs against. This is a scaffold only (OR-Phase 1 in
// happy-wibbling-pie.md): the real createRegistry()/pluginLoader
// implementation is designed and built in OR-Phase 3, tested against
// throwaway dummy plugins before anything real (OpenChara, Claude Waifus)
// ever touches it.
//
// Target shape (OR-Phase 3):
//   createRegistry(name, { validate }) -> { register, get, has, invoke, keys }
//     Generalizes the Map + register() + safe-default + try/catch-and-warn
//     pattern already proven twice in OpenChara (hooks.js, conditions.js).
//   loadPlugins(manifests) -> topologically sorts by dependsOn, calls each
//     plugin's register(kernel, ctx) in dependency order, mods always last.
"use strict";

function createRegistry(/* name, opts */) {
    throw new Error("kernel.createRegistry() is not implemented yet - see OR-Phase 3 in happy-wibbling-pie.md.");
}

module.exports = { createRegistry };
