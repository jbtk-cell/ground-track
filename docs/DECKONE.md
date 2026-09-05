# Deck One

This document is a REPORT on the expansion of 2026-09-05, at the owner's
direction: "make it a lot bigger... quadruple the number of rooms... kind of
like a maze... a few secret rooms that would only open once you unlock a
certain thing... this is the first area... a giant ass spaceship." The
binding direction documents still bind; this records what was built and why.

## What Station Kepler is now

Fifty-three compartments: the twelve bespoke rooms of the original run, and
forty-one generated rooms in four wings and a keel, all Blender-built and
Cycles-lit. The deck is a maze with three loops (hab-crown, works-berth,
science-berth), five locked doors, and six secret or sealed rooms. The deck
chart is generated from the live layout by scripts/deck-map-data.ts +
deck-map-page.mjs.

THE SOURCE OF TRUTH is src/env/station/deckplan.ts: every generated room is
a record there - rectangle, ports, family, furniture, floors, purpose, and
which key its doors want. The runtime compartments
(src/env/blender/generated.ts), the Blender build
(tools/blender/build_generated.py via deckplan.json), the pinned poses, the
gate lists and the map all derive from it. Editing the record IS editing the
room.

## The gameplay frame

The owner's stated model is Prodigy-shaped: stations to operate, arenas to
meet things in, questions to answer, rooms that reward finding them. Every
room carries a `purpose` naming its hook - THE SERVERS' drill terminals are
the question stations, THE MESS and THE HOLD are the arenas, THE BUNKS and
THE WARD the rest/heal anchors, THE SHOP the crafting bench, THE COMMS the
quest console, THE CHARTS the in-game map room, THE ARCHIVE the lore
library (which is also the answer to "what is the bookcase room for": THE
RACKS is the stores - inventory made walkable - and THE ARCHIVE is the
reading room). The purposes are hooks, not implementations: each room has
operable points wired to honest counters, ready for the systems to arrive.

## Locks and secrets

A connection may carry `locked: '<key>'` (ports.ts). A locked door is a real
join for layout - the room is placed, on the drawings, part of the deck -
but the station keeps it sealed until `unlock(key)`. Five keys exist:
prybar (the furnace panel into THE KEEL), sounding (the drystores panel
into THE VOID), manifest-key (THE BOND vault), clearance (THE ANNEX),
sigil (THE CACHE). The playable gate walks a locked door both ways: shut it
must stop the body, opened it must not. `unlock('*')` is the harness path;
the game will turn keys through play.

## Geometry discipline

Generated rooms are designed in WORLD coordinates (all land at yaw 0), port
planes on rect edges, 0.1 m walls inside the rect; loops close by
construction because both sides of every seam come from the same numbers.
scripts/check-deckplan.ts verifies alignment, overlap and door-corner
clearance. Four bespoke rooms grew doorways for the wings: the spine (two
side doors), the crown (starboard door onto THE RETURN's ramp), the berth
(east and west hatches; the manifest board moved to a diagonal facet), and
the crawl - whose blind end's bolted blank finally unbolted onto a LOW_SEAM
hatch (1.02 x 1.86, all its ceiling allows over the 0.6 deck), the third
and last seam size.

## Floors above

The owner's larger shape - multiple decks, unlocked after visiting planets -
is deliberately NOT designed here. What this expansion establishes for it:
rooms as records scale (forty-one rooms cost one spec file and one
builder), locked connections already express "sealed until the game says
so", and THE ENGINE GALLERY and THE HOLD are sized to say "this ship is
bigger than this deck" out loud.
