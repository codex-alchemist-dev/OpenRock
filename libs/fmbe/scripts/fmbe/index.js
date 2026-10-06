// @openrock/fmbe - in-world entry. Everything a mod needs to show blocks/items as FMBE display entities.
import spec from "./spec.cjs";
import commands from "./commands.cjs";
import tween from "./tween.cjs";
import ease from "./ease.cjs";
import matrix from "./matrix.cjs";
import items from "./items.cjs";
import expr from "./expr.cjs";
import molang from "./molangEval.cjs";

export { createFmbe } from "./runtime/manager.js";
export { Display } from "./runtime/display.js";
export { Group } from "./runtime/group.js";
export const { normalizeSpec, FmbeSpecError } = spec;
export const { commandsFor, renderCommands, variablesCommand, staticCommands, specAssignments, stopSoundCommands, structureSaveCommand, structureLoadCommand, lootMineCommand, IMMOBILIZE_EFFECTS } = commands;
export const { tweenAssignments, diffChannels } = tween;
export const { easeTree, easeNames } = ease;
export const { eulerToMatrix, matrixToEuler, composeTransforms } = matrix;
export const { itemSupport } = items;
export { expr, molang };

/** Compiled FMBE DSL scenes (content.fmbeDsl) live in the generated module "@openrock/virtual/openrock-fmbe-data"; see scenes.js. */
export { loadScene, spawnScene } from "./runtime/scenes.js";
