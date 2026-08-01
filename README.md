# GROUND TRACK

You own a small satellite network. The flight computer solves the transfer,
prints the whole maneuver card, and stops one line short. You close it.

The only control input in the game is one small whole number - and real
Keplerian orbits, real transfer burns and real constellation geometry are what
obey it. The single idea underneath everything: **the machine finds the shape,
you give it the size.**

## Run it

```bash
npm install
npm run dev
```

## Where it is

**Milestone 2 - one card, one number.** One real orbit drawn as a hairline
trace, dashed where it passes behind the planet. HERON-1 coasts toward its
node, the flight computer prints the maneuver card and stops one line short,
and the player types the burn duration. The number is typed, executed and
corrected - never graded: whatever lands in the blank burns for exactly that
many real seconds of integrated thrust, the ellipse deforms live, and an off
entry simply earns a smaller correction card at the next node. The target
ring goes dashed to solid when the apoapsis settles onto it.

Next: propellant pressure tuned against real players, then the second
satellite and the first constellation card.

## Why the physics is real

The player does easy arithmetic. The world does not fake the rest of it.
`src/sim` is a genuine two-body propagator - Kepler's equation solved by
Newton's method, classical elements to state vectors and back, and instantaneous
burns - and it is pure, with no rendering, DOM, clock or randomness anywhere in
it. That is what lets the whole ruleset be tested in milliseconds:

- specific energy and angular momentum are conserved along a coasting orbit
- the period obeys Kepler's third law, and a 500 km orbit comes out at 94 minutes
- state vectors round-trip back to the elements they came from
- **a burn of duration t produces the apoapsis the maneuver card predicted**

That last test is the game's premise under CI: the number the player types and
the number the world obeys are the same number.

## Documentation

| File                                   | What it is                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| [docs/DIRECTION.md](docs/DIRECTION.md) | The creative direction. Binding on visual work.                |
| [docs/PLATFORM.md](docs/PLATFORM.md)   | Why this is a web game, with the Steam research behind it.     |
| [docs/LOOP.md](docs/LOOP.md)           | How the agent loop should run, and when to switch it on.       |
| [AGENTS.md](AGENTS.md)                 | Invariants and the verify commands. Read before changing code. |

## License

MIT.
