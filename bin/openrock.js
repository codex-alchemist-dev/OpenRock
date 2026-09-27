#!/usr/bin/env node
// OpenRock CLI - a scaffold only (OR-Phase 1 in happy-wibbling-pie.md).
// Not wired to anything real yet: OpenChara/Claude Waifus keep building via
// `node tools/openchara.js <cmd>` exactly as today throughout OR-Phase 1-5.
// The real command surface (build|check|export|deploy|dev|log, ported from
// OpenChara's tools/lib/build.js) is built in OR-Phase 6, behind a
// compatibility shim in OpenChara's own tools/openchara.js so the live dev
// loop never breaks mid-migration.
"use strict";

const COMMANDS = ["build", "check", "export", "deploy", "dev", "log"];

function main(argv) {
    const [cmd] = argv.slice(2);
    if (!COMMANDS.includes(cmd)) {
        console.error(`Usage: openrock <${COMMANDS.join("|")}> [projectDir]`);
        console.error("Not implemented yet - see OR-Phase 6 in happy-wibbling-pie.md.");
        process.exitCode = 1;
        return;
    }
    console.error(`openrock ${cmd}: not implemented yet - see OR-Phase 6 in happy-wibbling-pie.md.`);
    process.exitCode = 1;
}

main(process.argv);
