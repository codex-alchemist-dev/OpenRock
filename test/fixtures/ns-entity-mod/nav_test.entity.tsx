import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { vars, Entity, TypeFamily, Health, Movement, NavigationWalk, Physics, CollisionBox, Pushable, RawComponent, Pathfinding } from "@openrock/entity-dsl";

export default (
    <Entity identifier="{{ns}}:{{char}}_nav" spawnable summonable>
        <Pathfinding slots={vars().slots} />
        <TypeFamily family={["mob"]} />
        <Health value={20} />
        <Movement speed={0.25} />
        <NavigationWalk canPathOverWater canPassDoors canOpenDoors avoidDamageBlocks />
        <Physics />
        <CollisionBox width={0.6} height={1.8} />
        <Pushable />
        <RawComponent type="minecraft:knockback_resistance" value={{ value: 1 }} />
        <RawComponent type="minecraft:test_tint" value={{ color: "{{tint}}", max: vars().maxIndex }} />
    </Entity>
);
