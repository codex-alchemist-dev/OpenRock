import * as OpenRockEntity from "../../../src/entityDsl/jsx-runtime.js";
import { Entity, TypeFamily, Health, CollisionBox, Pushable, Physics, Scale, RawComponent } from "../../../src/entityDsl/components.js";

// The invisible-ish marker entity @openrock/pathfinding's navigateToCoordinate()
// spawns and tags as a real follow_mob target - authored through the entity
// DSL, replacing the hand-written nav_anchor.json.
export default (
    <Entity identifier="prd:nav_anchor" summonable>
        <TypeFamily family={["prd_nav_anchor"]} />
        <Health value={1} />
        <CollisionBox width={0.1} height={0.1} />
        <Pushable isPushable={false} isPushableByPiston={false} />
        <Physics hasGravity={false} hasCollision={false} />
        <Scale value={0.15} />
        <RawComponent type="minecraft:damage_sensor" value={{ triggers: { cause: "all", deals_damage: false } }} />
        <RawComponent type="minecraft:despawn" value={{}} />
    </Entity>
);
