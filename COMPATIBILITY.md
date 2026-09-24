# EasyTraps 1.0.1 Compatibility Assessment

## Scope

This document records the supported environment, integration boundaries, known risks, and minimum regression checks for the EasyTraps 1.0.1 public release.

## Verified baseline environment

- Foundry Virtual Tabletop 14.367
- `dnd5e` 6.0.3
- Monk's Active Tile Triggers 14.01
- Item Piles 3.3.x for optional Item Pile trigger sources
- Compatible EasyFix public Multi-Hit API validated during release testing
- EasyModules Hub 1.0.8+ is optional; managed macros and native module settings remain available without it.

## Supported topology

EasyTraps is currently built for **square-grid scenes**. Hex and gridless placement are intentionally outside the supported topology. Existing square-grid behavior is treated as the compatibility baseline for future geometry work.

## Shared Trap Infrastructure

Spell Traps and Alarm Traps reuse the same trigger-source, origin, discovery, disarm, rearm, deletion, and Scene Manager lifecycle. Payload execution is dispatched separately so Alarm audio cannot change the native Spell Trap workflow and spell runtime code cannot become a dependency of Alarm Trap activation.

## Integration Boundaries

### Foundry VTT

**Lower risk**

- Uses Foundry Hooks, settings, Scene documents, Wall/Token/Tile APIs, sockets, `fromUuid`, compendium APIs, and normal application/dialog boundaries.
- Door interaction context is propagated through Foundry document update options and validated by the GM.
- Trap lifecycle cleanup uses document create/update/delete hooks rather than persistent polling.
- Alarm Trap Spatial mode uses the public `canvas.sounds.emitAtPosition()` positional-audio API rather than persistent Ambient Sound documents.
- Positional playback completion is intentionally detached from trap lifecycle because Foundry resolves `emitAtPosition()` after initiating-client playback completes; sustained alarms therefore cannot block MATT progression or postpone rearm/cooldown state.
- Alarm custom-sound preview and directed Scene/GM playback use public Foundry audio objects and the existing module socket channel.

**Remaining risk**

- Foundry major releases can change Canvas document rendering, control/HUD behavior, Wall interaction details, File Picker behavior, or audio APIs.
- Door, Tile, Token, and positional-audio behavior should be smoke-tested on every Foundry major version.

### `dnd5e`

**Lower risk**

- EasyTraps delegates the selected Spell Trap spell to the native Item/Activity workflow instead of reproducing attacks, saves, damage, effects, or concentration rules.
- Runtime spell changes are isolated to a transient hidden copy; the source Item is not modified.
- Alarm Trap does not depend on spell Items or a technical caster.

**Remaining risk — highest Spell Trap system risk**

- Activity, target, scaling, measured-template, or skill-roll API changes can require adapter updates.
- Third-party spell Items that do not follow the normal `dnd5e` Activity schema may require native user interaction or may be unsuitable for unattended trap activation.

### Monk's Active Tile Triggers

**Lower risk**

- MATT is used as the Tile trigger host while EasyTraps keeps payload execution and trap state in its own code.
- The same registered EasyTraps action dispatches to Spell or Alarm payloads.

**Remaining risk**

- A major MATT release can change action registration, trigger payloads, or Tile behavior document structure.

### Item Piles

**Lower risk**

- Item Pile trigger creation is optional and guarded behind Item Piles availability.
- The same trigger-source adapter is shared by Spell and Alarm traps.
- The remainder of EasyTraps works without Item Piles installed.

**Remaining risk**

- Item Piles major releases can change creation, open, update, or deletion APIs/hooks.

### EasyFix

**Lower risk**

- EasyFix is optional and only enhances compatible Spell Traps.
- Alarm Trap audio does not depend on EasyFix.
- EasyTraps uses the public Multi-Hit API when available and falls back to native spell use when the integration is absent or incompatible.
- EasyTraps does not import EasyFix internal implementation files.

**Remaining risk**

- Changes to the public Multi-Hit runtime contract may temporarily disable enhanced automatic multi-hit behavior until the integration adapter is updated.

### User-Selected Alarm Audio

**Lower risk**

- EasyTraps stores only the selected Foundry audio path on the trap.
- User-selected files are not copied, moved, or redistributed by EasyTraps.
- Unsupported extensions are rejected before creation/edit save.
- Missing audio at activation produces a GM warning while preserving trap lifecycle state.

**Remaining risk**

- Moving or deleting a user-selected file naturally breaks that trap's audio path until the GM edits it.
- Browser autoplay restrictions can prevent playback on a client that has never supplied the user gesture required to unlock Web Audio.

## Update-Risk Matrix

| Update type | Expected risk | Required check |
|---|---|---|
| Foundry v14 build update | Low to medium | Tile, Door, HUD, deletion lifecycle, Alarm Spatial/Scene/GM audio |
| `dnd5e` 5.3.x update | Medium | Spell Activity use, saves/attacks, Spell Slot, cantrip scaling, templates, disarm roll |
| MATT 14.x update | Medium | Tile movement trigger and armed/disarmed synchronization for both payloads |
| Item Piles 3.3.x update | Low to medium | create/open/delete Item Pile Spell and Alarm traps |
| EasyFix compatible minor update | Low to medium | Magic Missile, Scorching Ray, Eldritch Blast, multi-target allocation |
| Foundry major version | Medium to high | full trap-source/UI/audio/template regression |
| `dnd5e` major version | High for Spell payload | full native Activity/disarm adapter review |
| MATT major version | High | trigger-host adapter review |

## Required Regression Checks Before Raising Verified Versions

1. Create and activate a basic Tile Spell Trap.
2. Create a Door Spell Trap, open it as a player, and verify triggering-creature attribution.
3. If Item Piles is active, create/open/delete an Item Pile Spell Trap and confirm exactly one activation.
4. Create an Alarm Tile with the bundled sound in Spatial mode and confirm radius/distance behavior.
5. Test Alarm Entire Scene and GM Only modes with at least one player client connected.
6. Select a Custom Sound with File Picker, Preview it locally, save it, and activate the trap.
7. Test one-shot and sustained Alarm playback.
8. Test a repeatable Alarm with cooldown and confirm one movement/open event cannot spam overlapping activation callbacks.
9. Test Alarm Door and Alarm Item Pile trigger sources.
10. Test Spatial Alarm trigger origin and Separate Origin; confirm Entire Scene and GM Only skip positional-origin placement entirely; delete a Spatial Separate Origin and confirm the whole trap is removed.
11. Discover both a Spell Trap and an Alarm Trap through Passive Perception and confirm shared discovery state.
12. DISARM Tile, Door, and Item Pile sources from valid range; verify out-of-range rejection.
13. Verify one-attempt-per-Actor and required-item/proficiency gates.
14. Trigger a dangerous disarm failure on an Alarm Trap and confirm the Alarm payload fires.
15. Test a native attack spell and a native saving-throw spell.
16. Test a measured-template Spell Trap and compare preview, saved overlay, and native activation placement.
17. Test one leveled spell at base Spell Slot and one upcast Spell Slot.
18. Test a cantrip at Caster Levels 1, 5, 11, and 17 where applicable.
19. With compatible EasyFix active, test Magic Missile base/upcast, Scorching Ray, and Eldritch Blast tiers.
20. With EasyFix disabled, confirm ordinary Spell Trap and all Alarm Trap audio paths still work without integration errors.
21. Open Scene Manager, filter Spell/Alarm, edit one of each, change Scene, and confirm manager/runtime state follows the active Scene.
