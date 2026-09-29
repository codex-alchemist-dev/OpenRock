import * as OpenRockItem from "../../../src/itemDsl/jsx-runtime.js";
import { Item, Icon, MaxStackSize, DisplayName, HandEquipped } from "../../../src/itemDsl/components.js";

// A real, live item - authored through Crystal Manifest-Item - added to
// exercise OR-Track Q3's item smoke test (dimension.spawnItem()) end to end
// against a real BDS boot, alongside this mod's existing entities.
export default (
    <Item identifier="prd:nav_gem" menuCategory={{ category: "items" }}>
        <Icon texture="prd_nav_gem" />
        <MaxStackSize value={64} />
        <DisplayName value="item.prd:nav_gem.name" />
        <HandEquipped value={false} />
    </Item>
);
