# Audio provenance

Every sound in this directory is third-party and **CC0** (public domain
dedication). None of it was generated, and none of it was extracted from
another game - ripping audio out of a commercial title would put someone
else's copyrighted assets in this repository regardless of how it sounded.

| Files                        | Source                                                                | Licence                                                       |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `footstep/footstep00-09.ogg` | [Kenney, RPG Audio](https://kenney.nl/assets/rpg-audio)               | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ui/switch_002.ogg`          | [Kenney, Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `limb/tick_002.ogg`          | [Kenney, Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `limb/close_001.ogg`         | [Kenney, Interface Sounds](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

CC0 does not require attribution. Kenney asks that credit "would be nice but is
not mandatory", and this file is that credit.

## Why ten footsteps

A single footstep sample played on a loop is the audible version of a perfect
sine head bob: the ear locks onto the repeat within a few steps and the walk
stops reading as a body. Ten samples, chosen per step and pitched slightly, is
the cheap fix, and it is the same reason the gait itself carries per-step
variation - see `src/env/player/gait.ts`.

## Why the limb gets its own two

`tick_002` is fired six times per release, once per coupling, and `close_001`
once when the stack shuts. They are deliberately NOT `switch_002`: that one is
the test button, which is the room's only real event, and spending the same
sound on a thing the player's own body does constantly would wear the button's
meaning out inside a minute.

The one synthesised sound in the game is the room tone, and the reason is in
`src/env/player/sound.ts` - it has to be locked to an impeller the player can
watch turning, which a recording cannot be.

## Adding to this directory

New audio must be CC0 or public domain, downloaded from a source that states
the licence, and recorded in the table above with a link. If a sound is only
available under CC-BY, it can still be used, but the attribution then becomes
mandatory and belongs in this file and in the shipped build.
