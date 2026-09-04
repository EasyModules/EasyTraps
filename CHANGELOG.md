# Changelog

## 1.0.0 — First Public Release

- First official public release of EasyTraps.
- Added configurable **Spell Traps** that execute selected D&D 5e spells through the system's native Activity workflow.
- Added **Alarm Traps** with bundled or custom audio, Spatial, Entire Scene, and GM Only audibility, one-shot or time-limited repeat playback, cooldowns, and optional chat notifications.
- Added shared **Tile**, **Door**, and optional **Item Pile** trigger sources.
- Added trigger-origin and separate-origin placement, saved spell areas, measured-template placement, and custom rectangular target zones.
- Added automatic **Passive Perception discovery**, configurable detection range and line of sight, shared party discovery state, and optional pause-on-discovery behavior.
- Added player-facing **DISARM** interaction with configurable DC, skill, proficiency and required-item gates, one-attempt-per-Actor rules, dangerous failures, natural-1 activation, and optional critical success.
- Added single-use and repeatable trap lifecycle handling, rearming, cooldowns, linked-source cleanup, and safe deletion behavior.
- Added the **EasyTraps Scene Manager** for filtering, inspecting, editing, revealing, hiding, arming, and disarming traps on the active Scene.
- Added managed **Create Spell Trap** and **Create Alarm Trap** macros plus the public `game.easyTraps` API.
- Added native **Game Settings → Configure Settings → EasyTraps Configuration** access while preserving EasyModules Hub integration.
- Added configurable spell-compendium sources, favorite spells, Tile artwork, creation defaults, discovery defaults, and disarm defaults.
- Added optional **EasyFix Multi-Hit** integration for compatible multi-hit Spell Traps, with a native D&D 5e fallback when EasyFix is unavailable.
- Added GM-only Spatial Alarm hearing-range preview on the canvas.
- Added support for square-grid scenes with scene-unit-safe imperial and metric distance handling.
- Bundled two attributed Pixabay audio assets for disarm feedback and the default Clock Alarm.
- Added compatibility documentation, third-party notices, and the EasyModules Software License.
- Verified the release baseline on **Foundry VTT 14.365**, **D&D 5e 5.3.3**, and **Monk's Active Tile Triggers 14.01**.
