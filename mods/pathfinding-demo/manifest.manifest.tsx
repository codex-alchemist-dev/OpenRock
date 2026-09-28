import * as OpenRockManifest from "../../src/manifestDsl/jsx-runtime.js";
import { ManifestSet, Behavior, Resource, Metadata } from "../../src/manifestDsl/components.js";

// A real, minimal manifest DSL override for pathfinding-demo (OR-Track O's
// real end-to-end proof) - extends buildManifests()'s own generated bp/rp
// manifest.json with real metadata neither openrock.mod.json nor
// buildManifests() has any field for today. Nothing here replaces the
// generated header/modules/dependencies - mergeManifestDoc() concatenates/
// merges onto them, it never overwrites the pack's real identity.
export default (
    <ManifestSet>
        <Behavior>
            <Metadata license="MPL-2.0" url="https://github.com/codex-alchemist-dev/OpenRock" />
        </Behavior>
        <Resource>
            <Metadata license="MPL-2.0" url="https://github.com/codex-alchemist-dev/OpenRock" />
        </Resource>
    </ManifestSet>
);
