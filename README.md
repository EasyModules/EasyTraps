Follow for more... https://www.patreon.com/EasyModules

# EasyTraps

EasyTraps is a free module in the **EasyModules** suite for Foundry Virtual Tabletop. It lets Game Masters build reusable traps directly on the canvas using **Tiles, Doors, or Item Piles**, with shared discovery, player-facing disarming, lifecycle cleanup, and payload-specific automation.

EasyTraps currently provides two trap payloads:

- **Spell Trap** — executes a selected `dnd5e` spell through its native Activity workflow.
- **Alarm Trap** — emits a configurable alarm sound from the trigger or from a separate origin point, with spatial, scene-wide, or GM-only audibility.

The trigger, origin, discovery, disarm, rearm, deletion, Door, and Item Pile infrastructure is shared between trap types. Payload-specific behavior is kept separate so future trap types can reuse the same stable foundation.

## Features

- Dedicated managed macros for **Create Spell Trap** and **Create Alarm Trap**.
- Three trigger sources shared by both trap types: **Tile**, **Door**, and **Item Pile**.
- Trigger-origin or separately placed movable Origin Tile.
- Automatic lifecycle cleanup for linked trigger sources, origins, runtime casters, and deleted traps.
- Automatic Passive Perception discovery with range and line-of-sight checks.
- Shared discovered state for the whole party.
- Unified player-facing **DISARM** workflow for Tile, Door, and Item Pile traps.
- Native Dexterity (Sleight of Hand) disarm rolls with optional proficiency and required-item gates.
- Optional Thieves' Tools requirement using the Item supplied by the installed `dnd5e` system.
- Configurable single-use or repeatable behavior, dangerous failures, natural-1 activation, and optional critical disarm success.
- Scene Manager with Spell/Alarm filtering, safe editing, rearming, disarming, revealing, hiding, and detailed trap inspection.
- Scene-unit-safe range handling for imperial and metric scenes.
- Centralized configuration through the EasyModules Hub and Foundry Module Settings.

### Spell Trap

- Native spell execution through the selected `dnd5e` Activity.
- Exact Activity selection for spells that expose more than one usable casting Activity.
- Configurable **Spell Slot** for leveled spells and separate **Caster Level** scaling for cantrips.
- Configurable spell save DC and flat spell attack bonus.
- Saved spell origin and measured-template placement.
- Direct targeting of the triggering creature or creatures inside a custom rectangular target zone.
- Optional **EasyFix** bridge for automatic Multi-Hit spells and controlled Magic Missile VFX/audio/stagger behavior.

### Alarm Trap

- One bundled **Clock Alarm** sound plus per-trap **Custom Sound** selection through Foundry's audio File Picker.
- Local Preview that does not broadcast while the GM is configuring the trap.
- **Spatial** playback using Foundry's native positional sound API, including radius, distance attenuation, walls/surfaces, and GM-always-hears behavior.
- **Entire Scene** playback for every connected user currently viewing the Scene.
- **GM Only** playback for silent alarms.
- **Play once** or **Repeat for a Duration** playback that loops only until the configured duration expires.
- Optional GM-only, public, or disabled chat notification.
- Repeatable alarms with a configurable cooldown to prevent audio spam.
- Alarm sound failure never blocks the trap state transition: the GM receives a warning and the trap lifecycle continues safely.

## Requirements

- Foundry Virtual Tabletop v14 (verified on v14.365)
- `dnd5e` system 5.3.3
- EasyModules Hub 1.0.6 or newer
- Monk's Active Tile Triggers 14.01 or newer

### Optional integrations

- **EasyFix** — recommended for automatic Multi-Hit Spell Traps. EasyTraps consumes EasyFix's public Multi-Hit API when a compatible build is active and otherwise falls back to normal native spell use. The bridge was validated against the compatible EasyFix public Multi-Hit API used during release testing.
- **Item Piles 3.3.0+** — required only when creating Item Pile trigger sources.

Alarm Trap audio does **not** require EasyFix, Automated Animations, Sequencer, or an Ambient Sound document.

## Installation

Install the current public EasyTraps release through Foundry VTT using this manifest URL:

```text
https://github.com/EasyModules/EasyTraps/releases/latest/download/module.json
```

Enable **EasyModules Hub**, **Monk's Active Tile Triggers**, and **EasyTraps** in a `dnd5e` world. Enable optional integrations only if you want their corresponding features.

For manual installation, extract the module archive so the manifest is located at:

```text
Data/modules/easy-traps/module.json
```

## Getting Started

EasyTraps creates or updates two world macros for the GM:

- **EasyTraps — Create Spell Trap**
- **EasyTraps — Create Alarm Trap**

### Create a Spell Trap

1. Run **EasyTraps — Create Spell Trap** or launch the Spell Trap action from the EasyModules Hub.
2. Select a spell and, when necessary, the exact Activity to use.
3. Configure Spell Slot or Caster Level, save DC, attack bonus, origin, target policy, and trap behavior.
4. Choose the trigger source: **Tile**, **Door**, or **Item Pile**.
5. Place the trigger and any requested spell origin, target zone, or measured-template area.
6. Use **Advanced Trap Settings** to customize discovery and disarming behavior.

The original spell Item is not modified. EasyTraps stores trap configuration separately and uses a hidden runtime copy when the trap activates.

### Create an Alarm Trap

1. Run **EasyTraps — Create Alarm Trap**.
2. Choose the bundled **Clock Alarm** or select **Custom Sound** and browse to an audio file available to Foundry.
3. Use **Preview locally** to test the sound without broadcasting it to players.
4. Choose who can hear the alarm: **Spatial**, **Entire Scene**, or **GM Only**.
5. If **Spatial** is selected, choose whether the sound originates from the trigger or from a separately placed Origin Tile. Entire Scene and GM Only alarms do not use positional origins.
6. Configure playback, chat notification, pause behavior, single-use/repeatable behavior, and cooldown.
7. Choose **Tile**, **Door**, or **Item Pile** and place the trap.
8. Use the same **Advanced Trap Settings** workflow when discovery or disarming is required.

Custom audio paths are stored on the individual trap. Different Alarm Traps can therefore use different sounds without a global sound library.

## Trigger Sources

### Tile

Tile is the default trigger source. The placed Tile represents the trap's trigger footprint and is activated through Monk's Active Tile Triggers. Hidden Tile state is also used for undiscovered Tile traps.

### Door

Door traps create a native Foundry Door and activate when that Door is opened. EasyTraps keeps configuration on a hidden internal controller while discovery, hover, distance, and GM status indicators are resolved against the real Door.

For Spell Trap behavior that needs the triggering creature, the player must control exactly one eligible owned Token while opening the Door. Alarm Traps do not require a triggering creature and can fire from the Door alone.

### Item Pile

When Item Piles is active, EasyTraps can create an Item Pile as the trigger source. Opening the pile activates the trap while the hidden controller retains configuration and lifecycle state.

Deleting a linked EasyTraps-created Door, Item Pile, trigger, or separate origin cleans up the rest of that trap instead of leaving an editable orphan behind.

## Origins

Spell Traps retain their existing origin choices for native spell execution.

Alarm Trap origin placement is used only by **Spatial** audio:

- **From the trigger** — sound originates from the Tile, Door, or Item Pile itself.
- **From another point** — EasyTraps asks the GM to place a separate movable Origin Tile.

This supports setups such as opening a trapped Door while a bell rings from a guard room elsewhere in the Scene. **Entire Scene** and **GM Only** alarms have no positional origin, so the creation workflow skips this step entirely.

Deleting a Spatial Alarm's separate Origin Tile deletes the complete linked trap by design.

## Spell Execution

EasyTraps delegates Spell Trap mechanics to the installed `dnd5e` system:

- spells with one usable casting Activity use it automatically;
- spells with several usable Activities ask the GM which exact Activity the trap should save;
- leveled spells use the configured **Spell Slot** without consuming an Actor's spell-slot resource;
- cantrips use a separate **Caster Level** from 1 to 20 for native cantrip scaling;
- the selected save DC and spell attack bonus are applied only to the hidden runtime spell copy;
- saved measured templates are replayed through the native template workflow;
- custom creature zones adjust only the runtime copy's target capacity;
- the original compendium or world Item is never rewritten.

EasyTraps does not maintain its own damage tables or duplicate spell descriptions.

## Alarm Audio

### Spatial

Spatial is the default Alarm Trap mode. EasyTraps uses Foundry v14's native positional sound emission rather than creating a persistent Ambient Sound document. When the GM hovers the Alarm trigger/source (or its Separate Origin), EasyTraps draws a temporary GM-only **maximum hearing range** circle centered on the real sound origin and labels it with the configured Scene distance. Walls may reduce practical audibility inside that maximum radius when wall attenuation is enabled.

Defaults:

- hearing radius: 60 Scene distance units;
- volume: 0.8;
- fade with distance: enabled;
- constrained by walls/surfaces: enabled;
- GM always hears: enabled.

### Entire Scene

The alarm is played locally for each connected client currently viewing the trap's Scene. EasyTraps uses its existing module socket only to request playback; receivers accept Alarm playback requests only when they originate from a GM.

### GM Only

Only GM clients viewing the Scene hear the alarm. This can be used for silent alarms that alert the GM without warning players.

### Custom Sound

Choose **Custom Sound** and use Foundry's audio File Picker. Supported audio paths are validated before the trap is saved. Preview is always local to the configuring client.

If a custom audio file is later removed or becomes unavailable, EasyTraps warns the GM when the trap triggers but does not corrupt, delete, or incorrectly rearm the trap.

## EasyFix Multi-Hit Integration

When a compatible EasyFix Multi-Hit API is active, EasyTraps delegates hit-count and multi-hit resolution to EasyFix. EasyFix remains the owner of built-in spell presets and routing behavior; EasyTraps does not embed its own Magic Missile, Scorching Ray, or Eldritch Blast rule table.

For a Spell Trap with several valid targets, automatic hit allocation uses the current EasyTraps target list in deterministic round-robin order. Explicit per-Item EasyFix configuration remains authoritative.

If the optional EasyFix Magic Missile controlled-volley API is available, EasyTraps also delegates projectile VFX, audio handling, Automated Animations suppression, and stagger to EasyFix. Without EasyFix, the spell uses the world's normal native execution path.

Alarm Trap audio is independent from this integration.

## Discovery and Disarming

Every trap stores one normalized discovery/disarm configuration. The primary active GM is authoritative for discovery, preflight validation, rolls, attempt history, activation on dangerous failure, and final trap state.

Default new-trap behavior includes:

- Discovery enabled
- Detection DC 15
- Wisdom (Perception)
- Automatic Passive Perception enabled
- Detection distance 30 ft
- Line of sight required
- Pause when discovered enabled
- Disarm DC 15
- Dexterity (Sleight of Hand)
- Sleight of Hand proficiency not required
- Required Item disabled
- One attempt per Actor enabled
- Natural 1 activation disabled
- Automatic critical disarm disabled
- Dangerous failure disabled

When Passive Perception is enabled, EasyTraps starts from the Passive Perception value already calculated by the `dnd5e` Actor and applies the separate passive-check adjustment for the skill's current Advantage or Disadvantage state. Investigation is available as a manual discovery skill but is not automatically rolled.

A discovered armed trap exposes the same **DISARM** interaction for Tile, Door, and Item Pile sources. EasyTraps performs a local eligibility check, asks the GM for an authoritative preflight, and only then opens the Actor's native Dexterity (Sleight of Hand) roll.

A dangerous disarm failure activates the configured payload: the spell for a Spell Trap or the alarm for an Alarm Trap.

## Configuration

EasyTraps Configuration is available through both:

- **EasyModules Hub → EasyTraps → Configure**
- **Game Settings → Configure Settings → Module Settings → EasyTraps Configuration**

Configuration includes shared trigger/origin artwork and the Spell Trap creation defaults that are useful across the world. Alarm-specific sound choices are intentionally stored per trap so users can select different files for different alarms.

**Apply to all** in Advanced Trap Settings copies the discovery/disarm configuration to every EasyTraps trap in the current Scene and saves the same configuration as the default for newly created traps.

## Scene Manager

The Scene Manager lists both Spell Traps and Alarm Traps and provides:

- **All / Spell / Alarm** filters;
- separate create buttons for Spell Trap and Alarm Trap;
- safe payload-specific editing;
- Armed / Disarmed state;
- Rearm All / Disarm All;
- Reveal / Hide;
- trigger, origin, discovery, and disarm inspection;
- Spell Trap casting statistics;
- Alarm Trap sound, audibility, playback, and notification details.

Changing Scenes clears Scene-specific manager/runtime UI state so the manager does not retain a stale Scene reference.

## Public API

EasyTraps exposes its supported API through `game.easyTraps` after the `ready` hook:

```js
await game.easyTraps.openWizard();       // Spell Trap, backward-compatible alias
await game.easyTraps.openSpellWizard();
await game.easyTraps.openAlarmWizard();
await game.easyTraps.openSceneManager();
await game.easyTraps.openConfiguration();
await game.easyTraps.resetSettings();
await game.easyTraps.getSelectedCompendiums();
await game.easyTraps.getFavoriteSpells();
```

Alarm activation also emits an integration hook after successful trap processing:

```js
Hooks.on("easyTrapsAlarmTriggered", data => {
  // data.tile, data.trap, data.config, data.originPoint, data.triggeringTokens
});
```

## Compatibility

EasyTraps `1.0.0` is the first public release and is intended for Foundry VTT v14 with:

- Foundry Virtual Tabletop 14.365
- `dnd5e` 5.3.3
- Monk's Active Tile Triggers 14.01
- Item Piles 3.3.x for optional Item Pile trigger sources

The Alarm Trap audio implementation uses Foundry v14's public audio APIs and the existing EasyTraps socket channel for directed non-positional playback.

See [COMPATIBILITY.md](COMPATIBILITY.md) for the compatibility assessment and regression checklist.

## Known Boundaries

- **Square grids are the supported placement topology.** Hex and gridless trap placement are not currently supported release targets.
- Area/token overlap is currently 2D. Elevation is preserved for native spell/template execution but is not used to exclude vertically separated Tokens from an EasyTraps saved-area overlap test.
- Passive discovery respects configured range and sight-blocking Walls but does not suppress discovery because an Actor is blinded, unconscious, or outside Foundry's current lighting/FOV polygon.
- Manual MATT activation does not guess a triggering creature. If a saved Spell Trap origin/target behavior requires one, the GM must provide an eligible controlled Token when the trigger event itself does not identify one.
- EasyTraps delegates spell mechanics to `dnd5e` and installed automation. Malformed or highly interactive third-party spell Items may still request their normal native input or may not be suitable for unattended trap execution.
- Item Pile trigger sources require Item Piles to be active; the rest of EasyTraps remains usable without it.
- EasyFix is optional. Without it, EasyTraps does not attempt to reproduce EasyFix-specific Multi-Hit presets, VFX, audio, or stagger behavior.
- Alarm custom audio must remain accessible at the saved Foundry path. EasyTraps deliberately does not copy user-selected audio into the module.

## Support

Report bugs and compatibility issues through the [EasyTraps issue tracker](https://github.com/EasyModules/EasyTraps/issues). Include the Foundry VTT version, `dnd5e` version, trap type, trigger source, relevant optional integrations, and any browser-console error.

## Development Disclosure

EasyTraps is developed and maintained by EasyModules with AI-assisted implementation and code review. Release decisions, testing, licensing, and maintenance remain the responsibility of EasyModules.

## License and Third-Party Notices

Copyright © 2026 EasyModules. Distributed under the **EasyModules Software License — Version 1.0**. See [LICENSE](LICENSE).

SRD attribution, third-party audio provenance, dependency credits, and trademark notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The bundled Clock Alarm audio is sourced from Pixabay and remains under the Pixabay Content License. EasyTraps also allows users to reference their own audio files without copying those files into the module.

EasyTraps is an independent module and is not affiliated with or endorsed by Foundry Gaming LLC, Wizards of the Coast LLC, Monk's Active Tile Triggers, Item Piles, EasyFix, Automated Animations, or Sequencer.
