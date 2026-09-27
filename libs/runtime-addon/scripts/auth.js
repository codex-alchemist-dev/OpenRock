// @openrock/runtime-addon's OP/password gate - only the server owner (OP)
// or someone who knows the configured password can reach add-on config.
// A world with no password set and the requesting player not OP is refused
// outright (fail closed, never fail open).
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { hash } from "./pure/hash.js";

const PASSWORD_KEY = "openrock:addonsPasswordHash";
// hash() is cheap and non-cryptographic (matches MCLite's dataCore.js
// computeChecksum convention) - this defends against a casual player
// guessing/reading the password off a screen, not a determined attacker
// with save-file access.

/** Set once by the server owner (e.g. from a one-time setup command); pass a falsy value to clear it. */
export function setAddonsPassword(password) {
    world.setDynamicProperty(PASSWORD_KEY, password ? hash(String(password)) : undefined);
}

export function hasAddonsPassword() {
    return typeof world.getDynamicProperty(PASSWORD_KEY) === "string";
}

/** @returns {Promise<boolean>} */
export async function isAuthorized(player) {
    if (player.isOp()) return true;
    if (!hasAddonsPassword()) return false;
    const res = await new ModalFormData().title("Add-ons").textField("Server password", "").show(player);
    if (res.canceled) return false;
    const entered = String(res.formValues?.[0] ?? "");
    return hash(entered) === world.getDynamicProperty(PASSWORD_KEY);
}
