// Glossary management: do-not-translate terms and forced renderings per language.
"use strict";

const fs = require("fs");
const path = require("path");

function loadGlossary(filePath) {
    if (!fs.existsSync(filePath)) {
        return { doNotTranslate: [], terms: {} };
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return {
            doNotTranslate: Array.isArray(data.doNotTranslate) ? data.doNotTranslate : [],
            terms: data.terms || {},
        };
    } catch (e) {
        throw new Error(`Failed to load glossary from ${filePath}: ${e.message}`);
    }
}

function saveGlossary(filePath, glossary) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(glossary, null, 2) + "\n", "utf8");
}

function addDoNotTranslate(glossary, term) {
    if (!glossary.doNotTranslate.includes(term)) {
        glossary.doNotTranslate.push(term);
        glossary.doNotTranslate.sort();
    }
}

function removeDoNotTranslate(glossary, term) {
    const idx = glossary.doNotTranslate.indexOf(term);
    if (idx >= 0) {
        glossary.doNotTranslate.splice(idx, 1);
    }
}

function setForcedTerm(glossary, lang, original, translation) {
    if (!glossary.terms[lang]) {
        glossary.terms[lang] = {};
    }
    glossary.terms[lang][original] = translation;
}

function removeForcedTerm(glossary, lang, original) {
    if (glossary.terms[lang]) {
        delete glossary.terms[lang][original];
        if (Object.keys(glossary.terms[lang]).length === 0) {
            delete glossary.terms[lang];
        }
    }
}

function listDoNotTranslate(glossary) {
    return glossary.doNotTranslate || [];
}

function listForcedTerms(glossary, lang) {
    return glossary.terms?.[lang] || {};
}

module.exports = {
    loadGlossary,
    saveGlossary,
    addDoNotTranslate,
    removeDoNotTranslate,
    setForcedTerm,
    removeForcedTerm,
    listDoNotTranslate,
    listForcedTerms,
};
