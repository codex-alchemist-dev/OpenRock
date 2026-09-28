import * as OpenRockEntity from "../../../src/entityDsl/jsx-runtime.js";
import { Entity, TypeFamily, Health, Movement, NavigationWalk, Physics, CollisionBox, Pushable, RawComponent, Pathfinding } from "../../../src/entityDsl/components.js";

export default (
    <Entity identifier="prd:nav_test" spawnable summonable>
        <Pathfinding slots={5} />
        <TypeFamily family={["mob"]} />
        <Health value={20} />
        <Movement speed={0.25} />
        <NavigationWalk canPathOverWater canPassDoors canOpenDoors avoidDamageBlocks />
        <Physics />
        <CollisionBox width={0.6} height={1.8} />
        <Pushable />
        <RawComponent type="minecraft:knockback_resistance" value={{ value: 1 }} />
    </Entity>
);
