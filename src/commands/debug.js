// `openrock debug` - OR-Track C2 Stage 1: orchestrate Mojang's OWN official
// "minecraft-js" VS Code debugger extension (github.com/Mojang/minecraft-
// debugger) rather than building a DAP client from scratch - pure glue,
// generating the exact launch.json shape that extension expects (a real
// Debug Adapter Protocol client against Minecraft's built-in script debug
// port, 19144). This is also the exact source-map wiring the entity/
// manifest DSL's real esbuild `sourcemap: "linked"` output already
// produces, so this isn't wasted scaffolding.
//
// Confirmed via a real, direct fetch of Mojang's own current README (not
// guessed, not left as a "double-check later" note): which side initiates
// the connection is genuinely different per real target -
//   - Minecraft CLIENT: VS Code LISTENS ("mode": "listen", the default
//     here), the client connects OUT via its own `/script debugger connect`
//     slash command.
//   - Bedrock Dedicated Server (this project's own bds-test/ instance):
//     BDS LISTENS instead. Real, LIVE-VERIFIED mechanism (booted bds-test/
//     with allow-inbound-script-debugging=true +
//     script-debugger-auto-attach=listen in server.properties, confirmed
//     via a real TCP probe): BDS opens port 19144 automatically at level
//     load ("[Scripting] Debugger auto-attach... is still listening" in
//     its own console, port genuinely accepting connections) - no BDS
//     console command needed at all, which matters because this project's
//     own bdsTestHarness.js already established BDS has no reliable
//     programmatic stdin channel. VS Code then CONNECTS OUT
//     ("mode": "connect", via --mode=connect).
"use strict";

const fs = require("fs");
const path = require("path");
const { loadManifestFile } = require("../manifest.js");
const { stamp } = require("./shared.js");
const { findBdsInstance, findAutoInstalledBds, configureDebugProperties } = require("../bdsTestHarness.js");

function cmdDebug(modDir, flags, openrockRoot) {
    if (!flags.includes("--launch-vscode")) {
        console.log("Usage: openrock debug --launch-vscode [--mode=connect|listen] <modDir>");
        console.log('Writes .vscode/launch.json for Mojang\'s official "minecraft-js" debugger extension (port 19144).');
        return;
    }
    const { manifest } = loadManifestFile(modDir);
    if (manifest.packs.behavior === false) throw new Error(`"${manifest.name}" is a resource-pack-only mod (packs.behavior: false) - there are no scripts to debug`);
    const modeFlag = flags.find(f => f.startsWith("--mode="));
    const mode = modeFlag ? modeFlag.slice("--mode=".length) : "listen";
    if (mode !== "connect" && mode !== "listen") throw new Error(`--mode must be "connect" or "listen", got "${mode}"`);

    const vscodeDir = path.join(modDir, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    const launchJsonPath = path.join(vscodeDir, "launch.json");
    // "0.3.0" is the real, current schema version Mojang's own README
    // examples use as of this fetch - bumped from the earlier, stale "0.2.0".
    const existing = fs.existsSync(launchJsonPath) ? JSON.parse(fs.readFileSync(launchJsonPath, "utf8")) : { version: "0.3.0", configurations: [] };
    const scriptsSubdir = manifest.content?.scriptsDir ? path.relative(modDir, path.join(modDir, manifest.content.scriptsDir)).split(path.sep).join("/") : "scripts";
    const config = {
        type: "minecraft-js",
        request: "attach",
        mode,
        port: 19144,
        // targetModuleUuid: real, Mojang-documented optional field -
        // "important to use if you are developing add-ons in Minecraft
        // while there are multiple behavior packs with script active",
        // which is exactly OpenRock's own multi-mod dev-mode scenario.
        // OpenRock always knows this value already (this mod's own real
        // scriptModuleUuid) - no reason to leave it unset.
        targetModuleUuid: manifest.packs.behavior.scriptModuleUuid,
        sourceMapRoot: `\${workspaceFolder}/${scriptsSubdir}/`,
        generatedSourceRoot: `\${workspaceFolder}/build/${manifest.packs.behavior.folder}/scripts/`,
    };
    const idx = existing.configurations.findIndex(c => c.type === "minecraft-js" && c.name === `Debug ${manifest.name}`);
    if (idx >= 0) existing.configurations[idx] = { name: `Debug ${manifest.name}`, ...config };
    else existing.configurations.push({ name: `Debug ${manifest.name}`, ...config });
    fs.writeFileSync(launchJsonPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(`[${stamp()}] Wrote ${launchJsonPath}`);

    if (mode === "listen") {
        console.log(`Install Mojang's "Minecraft Bedrock Debugger" VS Code extension, hit F5 ("Debug ${manifest.name}") to enter listen mode, load a world with this pack in Minecraft, then run the slash command: /script debugger connect`);
    } else {
        // Real, self-sufficient BDS setup - one openrock command does the
        // WHOLE thing, no manual server.properties editing required. This
        // is the real, live-verified mechanism (never a BDS console
        // command - BDS has no reliable stdin channel): two real
        // server.properties flags, set here, that make BDS's own native
        // engine open port 19144 and start listening automatically at
        // every level load from then on.
        const bdsDir = findBdsInstance(undefined, openrockRoot) ?? findAutoInstalledBds();
        if (bdsDir) {
            configureDebugProperties(bdsDir);
            console.log(`[${stamp()}] Configured real BDS debug auto-attach at ${bdsDir} (allow-inbound-script-debugging=true, script-debugger-auto-attach=listen) - no manual server.properties editing needed.`);
        } else {
            console.log("No real BDS instance found yet to configure - run \"openrock build\" or \"openrock check\" once first (it will auto-install one), then re-run this debug command to configure it.");
        }
        console.log(`In VS Code, install Mojang's "Minecraft Bedrock Debugger" extension and hit F5 ("Debug ${manifest.name}") to connect - then run "openrock build" (or "openrock dev") to boot the real server.`);
    }
}

module.exports = cmdDebug;
