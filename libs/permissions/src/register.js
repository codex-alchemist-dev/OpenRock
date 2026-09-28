// @openrock/permissions - OP-check plus a stored (MCLite-backed, via
// @openrock/capabilities) password-gate, extracted as its own small library
// instead of being reimplemented per-mod (OR-Track K's own Add-ons-button
// gating is meant to be a real consumer of this, not a one-off).
//
// The OP check itself is dependency-injected (a real permission-level read
// needs @minecraft/server) - this library owns the PASSWORD half fully
// (hash/salt storage through MCLite, never plaintext), plus the small
// combining logic ("OP OR correct password" is the common real gate shape).
//
// See "OR-Track L", Part 1, item 10, in the project plan document.
"use strict";

const crypto = require("crypto"); // Node builtin - not a third-party dependency

const CAPABILITY_KIND = "permissions:password";

function hashPassword(password, salt) {
    return crypto.createHash("sha256").update(salt + password, "utf8").digest("hex");
}

function generateSalt() { return crypto.randomBytes(16).toString("hex"); }

module.exports = function register(kernel, ctx) {
    const capabilities = ctx.dependencies["@openrock/capabilities"];
    capabilities.registerCapability(CAPABILITY_KIND, { hash: "string", salt: "string" });

    /** Real, injected OP-level check - `checkOpFn(player)` is real usage: `player.isOp?.()` or a permission-level read. */
    function isOp(player, checkOpFn) {
        if (typeof checkOpFn !== "function") throw new Error("@openrock/permissions: isOp() requires a real checkOpFn(player) => boolean");
        return !!checkOpFn(player);
    }

    /** Sets (or replaces) the password for `gateId`, stored as a salted hash - never plaintext. */
    function setPassword(owner, world, gateId, password) {
        if (typeof password !== "string" || password.length === 0) {
            throw new Error("@openrock/permissions: setPassword() requires a real, non-empty password string");
        }
        const salt = generateSalt();
        const hash = hashPassword(password, salt);
        return capabilities.writeCapability(owner, world, CAPABILITY_KIND, gateId, () => ({ hash, salt }));
    }

    /** True if `attempt` matches the stored password for `gateId`. False (never throws) if no password is set at all. */
    function checkPassword(owner, world, gateId, attempt) {
        const record = capabilities.readCapability(owner, world, CAPABILITY_KIND, gateId);
        if (!record) return false;
        return hashPassword(attempt ?? "", record.salt) === record.hash;
    }

    function hasPasswordSet(owner, world, gateId) {
        return capabilities.readCapability(owner, world, CAPABILITY_KIND, gateId) != null;
    }

    /**
     * The common real gate shape: access is granted if the player is OP,
     * OR (a gate is configured and) the supplied password attempt matches.
     * @param {object} opts
     * @param {(player)=>boolean} [opts.checkOpFn]
     * @param {object} [opts.owner] @param {object} [opts.world] @param {string} [opts.gateId]
     * @param {string} [opts.passwordAttempt]
     */
    function canAccess(player, opts = {}) {
        if (opts.checkOpFn && isOp(player, opts.checkOpFn)) return true;
        if (opts.gateId && opts.passwordAttempt !== undefined) {
            return checkPassword(opts.owner, opts.world, opts.gateId, opts.passwordAttempt);
        }
        return false;
    }

    return { api: { isOp, setPassword, checkPassword, hasPasswordSet, canAccess } };
};
