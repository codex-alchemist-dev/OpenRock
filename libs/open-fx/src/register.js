// @openrock/open-fx - see README.
// Pure functions are real top-level exports; register() exposes the API
// through the kernel.
"use strict";

// TODO: Import your modules here
// const myModule = require("./myModule.js");

// TODO: Implement your API
const stubApi = {
    // greet(name) { return `Hello, ${name}!`; }
};

const api = { ...stubApi };

function register() {
    return { api };
}

module.exports = Object.assign(register, api);
