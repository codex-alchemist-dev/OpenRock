import * as OpenRockManifest from "../../../src/manifestDsl/jsx-runtime.js";
import { ManifestSet, Behavior, Resource, Header, Module, Dependency, Capability, Metadata, Setting, Subpack } from "../../../src/manifestDsl/components.js";

export default (
    <ManifestSet>
        <Behavior formatVersion={2}>
            <Header name="pack.name" description="pack.description" uuid="11111111-1111-1111-1111-111111111111" version={[1, 0, 0]} minEngineVersion={[1, 21, 0]} />
            <Module type="data" uuid="22222222-2222-2222-2222-222222222222" version={[1, 0, 0]} />
            <Dependency moduleName="@minecraft/server" version="1.10.0" />
            <Capability name="raytraced" />
            <Metadata authors={["OpenRock Pilot"]} license="MPL-2.0" />
            <Setting type="toggle" identifier="pilotToggle" text="Pilot toggle" defaultValue={true} />
        </Behavior>
        <Resource formatVersion={3}>
            <Header name="pack.name" description="pack.description" uuid="33333333-3333-3333-3333-333333333333" version={[1, 0, 0]} minEngineVersion={[1, 21, 0]} packScope="any" />
            <Module type="resources" uuid="44444444-4444-4444-4444-444444444444" version={[1, 0, 0]} />
            <Subpack folderName="textures_sd" name="SD Textures" memoryPerformanceTier={1} />
            <Subpack folderName="textures_hd" name="HD Textures" memoryPerformanceTier={3} />
        </Resource>
    </ManifestSet>
);
