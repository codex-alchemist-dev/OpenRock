import * as OpenRockBlock from "../../../src/blockDsl/jsx-runtime.js";
import { Block, Permutation, CollisionBox, Friction, LightEmission, DestructibleByMining, MapColor, DisplayName } from "../../../src/blockDsl/components.js";

export default (
    <Block identifier="prd:test_block" menuCategory={{ category: "construction" }}>
        <CollisionBox origin={[-8, 0, -8]} size={[16, 16, 16]} />
        <Friction value={0.6} />
        <LightEmission value={7} />
        <DestructibleByMining secondsToDestroy={2} />
        <MapColor color="#a0a0a0" />
        <DisplayName value="tile.prd:test_block.name" />
        <Permutation condition="query.block_state('orbt:powered') == true">
            <LightEmission value={15} />
        </Permutation>
    </Block>
);
