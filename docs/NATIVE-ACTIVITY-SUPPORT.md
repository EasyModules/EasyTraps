# Native Activity Support

EasyTraps creates traps from `dnd5e` spell Items and executes the selected spell through the native Item/Activity use APIs.

- A spell with one usable casting Activity is selected automatically.
- A spell with multiple usable casting Activities presents an exact Activity choice after **Place trigger**.
- EasyTraps stores the selected Activity ID, target policy, spell origin, and any saved template placement.
- `dnd5e` remains responsible for attacks, saves, damage, effects, concentration, chat, and downstream integrations.
- Saved template replay injects position, elevation, and direction while the active system rebuilds the template's native shape and dimensions.
- The exact final setup shape produced after Foundry snapping is stored separately and reused for the GM overlay and EasyTraps token-overlap checks.
- Pause-on-trigger is enabled for new traps by default and remains configurable per trap. EasyTraps does not resume the game automatically.
- Single-Activity spells enter through `Item.use()` without synthetic keyboard events. Multi-Activity spells replay the exact saved Activity choice.
- Custom target zones use strict positive-area overlap so adjacent Tokens are not selected merely for sharing a border.
- A custom-zone activation creates or reuses a hidden runtime spell copy whose target capacity matches the current creature count, then performs one native spell use with the prepared target set.
- The runtime copy receives the trap's flat save DC and spell attack bonus. The source Item and source Actor are not modified.
- Leveled spells store a per-trap **Spell Slot** from their base level through level 9. The saved slot/scaling configuration is supplied to native use with resource consumption disabled.
- Cantrips remain spell level 0 and store a separate **Caster Level** from 1 to 20. EasyTraps uses that value only to prepare the transient native cantrip scaling path.

## Optional EasyFix Multi-Hit Bridge

When an active EasyFix build exposes the compatible public Multi-Hit runtime API, EasyTraps can delegate the complete hit pool without opening EasyFix's interactive remaining-hit prompt. Current trap targets are distributed in deterministic round-robin order and hit scaling follows the effective EasyFix configuration.

EasyFix remains the owner of its built-in spell presets and controlled Magic Missile VFX/audio/stagger behavior. Explicit per-Item EasyFix configuration remains authoritative. If EasyFix is absent or its public API is incompatible, EasyTraps falls back to normal native `dnd5e` spell use.
