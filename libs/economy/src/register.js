// @openrock/economy - Currencies, audited transactions, and trade/price-table primitives.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineCurrency() { throw new Error("@openrock/economy: defineCurrency is not implemented"); },
    balance() { throw new Error("@openrock/economy: balance is not implemented"); },
    transfer() { throw new Error("@openrock/economy: transfer is not implemented"); },
    auditLog() { throw new Error("@openrock/economy: auditLog is not implemented"); },
    definePriceTable() { throw new Error("@openrock/economy: definePriceTable is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
