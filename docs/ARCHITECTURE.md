# Stage 1: behavior-preserving modularization

The reference is EasyTraps 1.0.0, commit
`7076aac4132f80e93e8bcae3f091865f03bcf8ff`. This work implements Stage 1 of
`AGENTS.md`. Compatibility migration, dependency removal and UI redesign belong
to later stages.

## Entry point and dependencies

Foundry still loads `scripts/main.mjs` through `module.json`. The entry point binds
six synchronous presentation callbacks, then calls `bootstrap.mjs:registerHooks`.
Bootstrap retains the original `init` and `ready` registrations, settings, public
`game.easyTraps` API, document hooks and canvas cleanup callbacks.

Subsystems use ordinary named ES-module imports. There is no build step, service
registry, dependency-injection framework or new runtime dependency. The static
import graph is acyclic. Importing a subsystem does not register its hooks.

`core/constants.mjs` contains the original identifiers, settings keys, schemas,
timeouts and defaults. `core/runtime-state.mjs` owns the single original runtime
object: locks, transient caches, overlay references and interaction state. Saved
trap state remains on Foundry documents; the runtime object does not replace it.

## Responsibilities

| Location | Responsibility |
| --- | --- |
| `core/trap-model.mjs`, `trap-state.mjs` | Read persisted traps; change armed/discovered state and defaults |
| `core/trap-documents.mjs`, `trap-lifecycle.mjs` | Create controller/origin documents; manage runtime documents and deletion |
| `core/trap-runtime.mjs` | Dispatch to the existing Spell or Alarm payload |
| `core/trap-discovery.mjs`, `disarm-runtime.mjs` | Discovery, authoritative GM requests, reservations and consequences |
| `core/trigger-links.mjs`, `source-documents.mjs` | Source ownership, controller links and deletion rules |
| `core/*geometry*.mjs`, `template-snapshots.mjs`, `saved-areas.mjs`, `target-selection.mjs` | Shared geometry, saved areas and target selection independent of rendering |
| `triggers/` | MATT activation lock, Door and Item Pile interactions, source synchronization |
| `payloads/` | Spell execution and Alarm playback/lifecycle |
| `integrations/` | dnd5e Items/Activities/templates/units, targeting, MATT, Hub, Item Piles deletion, EasyFix, Midi-QOL, Sequencer and macros |
| `ui/` | Existing wizard, Scene Manager, dialogs, placement, HUD, DOM and canvas overlays |

The original standalone rule helpers remain in `scripts/`, including discovery,
alarm audio, grid geometry, cantrip scaling and trigger-source data rules. Item
Pile creation and hook translation remain together in its trigger adapter.

## Workflow boundaries

Creation starts in `ui/launchers.mjs` and `ui/trap-wizard.mjs`. The placement
workflow calls the document constructors or the Door/Item Pile adapter. As before,
new controllers remain unarmed until placement and configuration are committed.

MATT calls `triggers/tile-trigger.mjs:executeMattTrap`; external sources use
`triggers/source-runtime.mjs:activateTrapFromTriggerSource`. Both reach
`core/trap-runtime.mjs:executeConfiguredTrap`, retaining the original lock rules.
The Spell payload creates/reuses its runtime Item and delegates to native dnd5e
use. The Alarm payload delegates audio to the existing Foundry audio helpers.

Core workflows sometimes refresh presentation immediately. `core/presentation.mjs`
is the only inversion boundary: six callbacks supplied by `main.mjs` before hook
registration. It preserves synchronous ordering, return values and exceptions.
Core does not import UI modules, and UI does not become an asynchronous event bus.
The callbacks must be bound once; incomplete or repeated binding fails explicitly.

## Preservation and automated verification

Run from the repository root with Node.js 22 or newer:

```sh
node --test tests/refactor.test.mjs
```

No package installation is necessary. The suite imports the assembled production
modules and supplies small Foundry API/document doubles. It checks:

- Original bodies/signatures of all 409 extracted functions, hook registration
  source, constants and initial runtime state against the fixed baseline contract.
- Imports/exports, duplicate implementations, circular dependencies and the
  prohibition on core importing UI.
- Initialization, settings/API aliases, hook/socket registration and canvas cleanup.
- Tile/Door/Item Pile controller creation, source linking, visibility and MATT state.
- Alarm single-use/rearm/cooldown, duplicate callbacks, failure and lock release.
- Native spell delegation, Activity selection, upcasting, runtime-copy isolation,
  source revision checks, cancellation and target restoration.
- Custom-zone selection and exclusion of technical origins.
- Passive discovery with LOS, GM authority, disarm ownership/range/reservations,
  successful disarm, dangerous failures and persisted attempt history.
- Orphan-document cleanup and optional Item Pile API fallback.

`tests/fixtures/stage1-contract.json` records hashes from the original commit.
These are temporary Stage 1 regression guards, not a requirement to freeze source
formatting forever. Do not regenerate them to hide a failing refactor. A later
behavior-changing stage should deliberately retire/update the applicable guards
and keep the behavioral tests. Hashes alone cannot prove correct wiring, which
is why the executable scenarios are separate.

## Validation status and remaining gate

Local automated checks pass. The 409 function bodies were also compared directly
with the original Git source, independently of the fixture. The original manifest,
styles, templates, assets and standalone rule modules remain unchanged.

The 21 regression scenarios in `COMPATIBILITY.md` have **not** been executed in a
live Foundry world for this refactor. The Stage 1 release gate remains open until
those pass on the original declared baseline (Foundry 14.365, dnd5e 5.3.3, MATT
14.01), including player clients, reloads and optional integrations. The manifest's
existing verified versions describe the prior release; this work makes no new
compatibility claim for dnd5e 6.x.

## Known risks deliberately retained

- Native dnd5e Activity/template, cantrip roll-data and Item-use seams remain
  version-sensitive. The next compatibility stage must validate them in-system.
- DOM selectors, PIXI rendering, pointer placement and simultaneous multiplayer
  interactions require live validation beyond the Node doubles.
- Wizard and disarm orchestration remain comparatively large. Their existing
  callbacks and ordering were retained to avoid changing behavior during extraction.
- Hub and MATT remain required as declared by the original manifest. Removing
  either requirement, adding native Tile triggers, Damage Traps or a new wizard
  must happen in their own roadmap stages.
