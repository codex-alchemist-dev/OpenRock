import * as OpenRockItem from "../../../src/itemDsl/jsx-runtime.js";
import { Item, Icon, MaxStackSize, DisplayName, Food, HandEquipped } from "../../../src/itemDsl/components.js";

export default (
    <Item identifier="prd:test_item" menuCategory={{ category: "items" }}>
        <Icon texture="prd_test_item" />
        <MaxStackSize value={16} />
        <DisplayName value="item.prd:test_item.name" />
        <Food nutrition={4} saturationModifier={0.3} canAlwaysEat={true} />
        <HandEquipped value={true} />
    </Item>
);
