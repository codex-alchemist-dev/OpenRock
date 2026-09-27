// @openrock/runtime-addon's config menu - plain ActionFormData/ModalFormData
// (not MinUI's compiled-screen system - see this library's README section
// for why: MinUI's real runtime needs a project-generated
// screens.generated.js + an ids.js companion that only exist after a
// project's own UI compilation step runs, which OpenRock's generic build
// pipeline doesn't produce yet - a real, separate integration task, not
// something to fake here). This keeps the addon genuinely self-contained
// and correct today, at the cost of a plainer look than a compiled MinUI
// screen would have - upgrading it to a real MinUI screen is real future
// work once that bridge exists, not a redesign of this file's logic.
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { listRegisteredMods, getFields, readConfig, writeConfig } from "./config.js";
import { coerceFieldValues } from "./pure/configLogic.js";

export async function showAddonsMenu(player) {
    const mods = listRegisteredMods();
    if (mods.length === 0) {
        player.sendMessage("§eNo installed mods have registered add-on config yet.");
        return;
    }
    const form = new ActionFormData().title("Add-ons").body("Choose a mod to configure:");
    mods.forEach(m => form.button(m));
    const res = await form.show(player);
    if (res.canceled || res.selection === undefined) return;
    await showModConfig(player, mods[res.selection]);
}

async function showModConfig(player, modName) {
    const fields = getFields(modName);
    if (fields.length === 0) {
        player.sendMessage(`§e${modName} registered no configurable fields.`);
        return;
    }
    const values = readConfig(modName);
    const form = new ModalFormData().title(modName);
    for (const f of fields) {
        if (f.type === "boolean") form.toggle(f.label, { defaultValue: Boolean(values[f.key]) });
        else if (f.type === "number") form.slider(f.label, f.min ?? 0, f.max ?? 100, { valueStep: f.step ?? 1, defaultValue: Number(values[f.key]) || 0 });
        else form.textField(f.label, "", { defaultValue: String(values[f.key] ?? "") });
    }
    const res = await form.show(player);
    if (res.canceled) return;

    const next = coerceFieldValues(fields, res.formValues, values);
    writeConfig(modName, next);
    // Re-read by the owning mod's own script whenever it next checks its
    // config (readConfig()/an equivalent it implements itself) - this
    // addon doesn't push a live-update notification, only persists the change.
    player.sendMessage(`§a${modName} config updated.`);
}
