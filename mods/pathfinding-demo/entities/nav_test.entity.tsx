import * as OpenRockEntity from "../../../src/entityDsl/jsx-runtime.js";
import { Entity, TypeFamily, Health, Movement, NavigationWalk, Physics, CollisionBox, Pushable, RawComponent, Pathfinding } from "../../../src/entityDsl/components.js";

// The real, live entity for the pathfinding-demo mod - authored through
// OpenRock's own entity DSL (OR-Track M), replacing the hand-written JSON
// this exact entity used to be. <Pathfinding slots={5}/> expands into the
// real, already-BDS-verified slot-pool component_groups/environment_sensor/
// events via tools/lib/genNavSlots.js - see test/entityDsl.test.js for the
// byte-identical proof against the original hand-written version.
export default (
    <Entity
        identifier="prd:nav_test" spawnable summonable
        materials={{ default: "zombie" }}
        textures={{ default: "textures/entity/zombie/zombie" }}
        geometry={{ default: "geometry.zombie" }}
        renderControllers={["controller.render.zombie"]}
        spawnEgg={{ base_color: "#3355ff", overlay_color: "#ffffff" }}
    >
        <Pathfinding slots={5} />
        <TypeFamily family={["prd_nav_test", "mob"]} />
        <Health value={20} />
        <Movement speed={0.25} />
        <NavigationWalk canPathOverWater canPassDoors canOpenDoors avoidDamageBlocks />
        <Physics />
        <CollisionBox width={0.6} height={1.8} />
        <Pushable />
        <RawComponent type="minecraft:knockback_resistance" value={{ value: 1 }} />
    </Entity>
);
