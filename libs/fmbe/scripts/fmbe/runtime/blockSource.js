// "Changing FMBE Block Display Dynamically" (wiki): a silk-touch pickaxe mines the block at a location straight into the
// display fox's hand, so the display shows exactly that block - block states, colours and modded blocks included - with no
// item id needed. The wiki keeps a pickaxe armor stand parked in a ticking area; this does the same with a stand spawned
// next to the display, used within one tick and removed again, so nothing has to stay loaded.

const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };

/**
 * @param {{server: {ItemStack?: Function, EnchantmentType?: Function}, names: object, display: object, blockLocation: {x:number,y:number,z:number}}} p
 * @returns {boolean} whether the display now shows the block
 */
export function copyBlockToDisplay({ server, names, display, blockLocation }) {
    if (!display.isLive) return false;
    if (!server.ItemStack) throw new Error("copyBlock needs createFmbe({ server: { ItemStack, EnchantmentType } }) - pass the @minecraft/server exports");
    const dim = display.dimension;
    const block = attempt(() => dim.getBlock(blockLocation));
    if (!block || block.isAir) return false;

    const pick = new server.ItemStack("minecraft:netherite_pickaxe", 1);
    const enchantable = pick.getComponent("minecraft:enchantable");
    const silk = server.EnchantmentType ? new server.EnchantmentType("silk_touch") : "silk_touch";
    enchantable.addEnchantment({ type: silk, level: 1 });

    const stand = dim.spawnEntity("minecraft:armor_stand", display.anchor);
    try {
        stand.getComponent("minecraft:equippable").setEquipment("Mainhand", pick);
        const { x, y, z } = blockLocation;
        const r = stand.runCommand(`loot replace entity @e[tag=${names.idTag(display.id)}] slot.weapon.mainhand 0 mine ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} mainhand`);
        return !r || r.successCount !== 0;
    } finally {
        attempt(() => stand.remove());
    }
}
