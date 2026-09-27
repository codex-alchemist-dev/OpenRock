// @openrock/runtime-addon's real entry point - a genuine Bedrock ES module,
// bundled by OpenRock's build pipeline into the consuming pack's
// scripts/openrock_runtime-addon/ folder and imported by the generated
// main.js (see buildPipeline.js).
//
// Entry point is a /scriptevent, the same well-established, already-proven
// mechanism this whole project's own test harnesses use (e.g.
// "/scriptevent cw:testcreate" throughout OpenChara's history) - not an
// injected vanilla pause-menu button. A REAL esc-menu button needs editing
// vanilla's own pause_screen.json via JSON UI `modifications`, which this
// pass deliberately does NOT attempt: getting that exact structure wrong
// would ship confidently-broken JSON UI with no way to verify it here.
// Flagged as real follow-up work needing its own verification spike,
// exactly like every other not-yet-empirically-confirmed UI mechanism in
// this project's history - not assumed solved by writing speculative JSON.
//
// Written against the real, documented @minecraft/server /
// @minecraft/server-ui API surface (Player.isOp(), ActionFormData,
// ModalFormData, world dynamic properties - all already proven elsewhere
// in this project) but NOT yet verified end-to-end in a running Minecraft
// instance.
import { system } from "@minecraft/server";
import { isAuthorized } from "./auth.js";
import { showAddonsMenu } from "./menu.js";

export { registerAddonConfig } from "./config.js";
export { setAddonsPassword, hasAddonsPassword } from "./auth.js";

system.afterEvents.scriptEventReceive.subscribe(async event => {
    if (event.id !== "openrock:addons") return;
    const player = event.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;

    const ok = await isAuthorized(player);
    if (!ok) { player.sendMessage("§cNot authorized."); return; }
    await showAddonsMenu(player);
});
