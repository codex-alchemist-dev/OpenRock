#!/usr/bin/env node
// OpenRock command-line tool (OR-Track F0 - the real CLI, replacing the
// OR-Phase 1 scaffold). Tested against dummy fixture mods/libraries
// (test/fixtures/, test/buildPipeline.test.js) - never against real
// Claude Waifus, so this carries zero cutover risk; OpenChara/Claude
// Waifus keep building via `node tools/openchara.js <cmd>` exactly as
// today until OR-Track J's real, deliberate cutover.
//
//   openrock build  <modDir>   build into <modDir>/build/
//   openrock check  <modDir>   build + validate only (nothing written; --json
//                              for machine-readable output, OR-Track H1)
//   openrock export <modDir>   build + write <modDir>/dist/<name> <version>.mcaddon
//   openrock deploy <modDir>   build + sync into Minecraft's development pack folders
//   openrock dev    <modDir>   deploy, then watch the mod and its vendored
//                              dependencies for changes and redeploy automatically
//                              (incrementally, where possible - OR-Track Q6)
//   openrock log    <modDir>   show this mod's errors/warnings from Minecraft's
//                              newest content log (--all: every pack; --follow: keep
//                              tailing; --filter=<regex>: narrow further, OR-Track C1)
//   openrock debug  <modDir>   OR-Track C2 Stage 1: --launch-vscode writes a real
//                              VS Code launch.json for Mojang's official
//                              minecraft-js debugger extension (port 19144)
//
// OR-Track Q: `build`/`check` ALSO run a real automated Bedrock Dedicated
// Server smoke test by default (src/bdsTestHarness.js) - the just-built
// pack is installed into a real local BDS instance and booted for real,
// checking its actual console output for real script/content load errors.
// Requires a real local BDS instance: explicit OPENROCK_BDS_DIR, a sibling
// "bds-test" dev-server directory, OR-Track Q1's own real auto-install
// cache (tools/bds/install.js) - in that order. Only if every real path
// (including a live install attempt) fails is this a one-line skip note,
// never a hard failure. Pass --no-test-server to skip explicitly.
//
// <modDir> is the folder containing openrock.mod.json (defaults to the
// current directory). A mod's "library"-type dependencies are resolved
// against OpenRock's own bundled libs/* by name automatically; its
// "submodule"-type dependencies resolve against <modDir>/vendor/ by
// convention.
//
// `dev` also accepts a MODS FOLDER (a directory whose immediate
// subdirectories are each their own mod, rather than a mod itself) -
// OR-Track F1's multi-mod dev mode.
//
// This file is deliberately a thin dispatcher, per the project's own
// standing modularity rule: every real command's implementation lives in
// its own module under src/commands/, each independently requireable and
// testable, sharing only src/commands/shared.js's small, genuinely common
// helpers (stamp/comMojang/buildOpts/maybeRunSmokeTest). Nothing about a
// specific command's own logic lives here.
"use strict";

const path = require("path");
const cmdBuild = require("../src/commands/build.js");
const cmdCheck = require("../src/commands/check.js");
const cmdExport = require("../src/commands/export.js");
const cmdDeploy = require("../src/commands/deploy.js");
const cmdDev = require("../src/commands/dev.js");
const cmdLog = require("../src/commands/log.js");
const cmdDebug = require("../src/commands/debug.js");

const OPENROCK_ROOT = path.join(__dirname, "..");
const COMMANDS = ["build", "check", "export", "deploy", "dev", "log", "debug"];

async function main() {
    const args = process.argv.slice(2);
    const flags = args.filter(a => a.startsWith("--"));
    const [cmd, dirArg] = args.filter(a => !a.startsWith("--"));
    const modDir = path.resolve(dirArg ?? ".");
    try {
        switch (cmd) {
            case "build": await cmdBuild(modDir, flags, OPENROCK_ROOT); break;
            case "check": await cmdCheck(modDir, flags, OPENROCK_ROOT); break;
            case "export": cmdExport(modDir, OPENROCK_ROOT); break;
            case "deploy": cmdDeploy(modDir, false, OPENROCK_ROOT); break;
            case "dev": cmdDev(modDir, OPENROCK_ROOT); break;
            case "log": cmdLog(modDir, flags); break;
            case "debug": cmdDebug(modDir, flags, OPENROCK_ROOT); break;
            default:
                console.log(`Usage: openrock <${COMMANDS.join("|")}> [modDir]`);
                process.exitCode = cmd ? 1 : 0;
        }
    } catch (e) {
        if (flags.includes("--json")) console.log(JSON.stringify({ ok: false, error: e.message }));
        else console.error(e.message);
        process.exitCode = 1;
    }
}

main();
