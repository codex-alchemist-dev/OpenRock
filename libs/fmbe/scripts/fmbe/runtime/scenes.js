// Scenes: the compiled form of an FMBE DSL file (`*.fmbe`, see docs/fmbe.md). A scene is a tree of groups and displays
// plus named animations; spawning one builds the Group/Display objects and returns a handle to play its animations.
//
//   import { SCENES } from "@openrock/virtual/openrock-fmbe-data";
//   const altar = spawnScene(fmbe, SCENES.altar, { dimension, origin: { x, y, z }, yaw: 90 });
//   altar.play("spin");

const TICKS = { ticks: 20, ease: "linear", loop: "none", steps: 1 };

/** Light structural check of compiled scene data (the compiler already validated it; this guards hand-written scenes). */
export function loadScene(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.nodes)) throw new Error("not a compiled FMBE scene");
    return data;
}

/**
 * @param {object} fmbe the manager from createFmbe
 * @param {object} scene compiled scene data
 * @param {{dimension: object, origin: {x:number,y:number,z:number}, yaw?: number, scale?: number, owner?: string, persist?: boolean}} placement
 */
export function spawnScene(fmbe, scene, placement) {
    loadScene(scene);
    const { dimension, origin, yaw = 0, scale = 1, owner, persist = scene.persist } = placement;
    const root = fmbe.group({ dimension, owner, persist, local: { pos: [origin.x, origin.y, origin.z], rot: [0, yaw, 0], scale } });
    const groups = new Map([["root", root]]);
    const displays = new Map();
    const parentOf = new Map();   // display name -> its group

    for (const node of scene.nodes) {
        const parent = groups.get(node.parent ?? "root");
        if (!parent) throw new Error(`scene "${scene.id}": "${node.name}" has unknown parent "${node.parent}"`);
        if (node.kind === "group") groups.set(node.name, parent.addGroup(node.local));
        else { displays.set(node.name, parent.add(node.spec, node.local)); parentOf.set(node.name, parent); }
    }

    const running = new Map();
    const handle = {
        root, groups, displays,
        /** Runs one of the scene's named animations (or the same one again, restarting it). */
        play(name, override = {}) {
            const a = scene.anims.find(x => x.name === name);
            if (!a) throw new Error(`scene "${scene.id}" has no animation "${name}"`);
            const opts = { ...TICKS, ...a, ...override };
            if (groups.has(a.target)) groups.get(a.target).tween(a.patch, opts);
            else if (displays.has(a.target)) parentOf.get(a.target).updateChild(displays.get(a.target), a.patch, opts);
            else throw new Error(`scene "${scene.id}": animation "${name}" targets unknown "${a.target}"`);
            running.set(name, a.target);
            return handle;
        },
        /** Freezes an animation where it is. */
        stop(name) {
            const target = running.get(name);
            if (target === undefined) return handle;
            running.delete(name);
            if (groups.has(target)) groups.get(target).stop();
            else if (displays.has(target)) displays.get(target).stop();
            return handle;
        },
        /** Changes a display or group immediately; pos/rot/scale are local to its group. */
        set(name, patch) {
            if (groups.has(name)) groups.get(name).set(patch);
            else if (displays.has(name)) parentOf.get(name).updateChild(displays.get(name), patch, null);
            else throw new Error(`scene "${scene.id}" has no "${name}"`);
            return handle;
        },
        remove() { root.remove(); displays.clear(); groups.clear(); running.clear(); },
    };
    for (const a of scene.anims) if (a.auto) handle.play(a.name);
    return handle;
}

