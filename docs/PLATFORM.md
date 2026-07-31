<!--
Research conducted 2026-07-31 for GROUND TRACK. Two independent research passes:
Steam publishing process, and web-vs-native engine viability. Figures carry source
URLs; re-verify before building a launch calendar or signing anything.
-->

# Platform and engine

## The decision in one line

Build the prototype in three.js/TypeScript, architect the simulation core to be
engine-independent, and defer the engine commitment until the prototype answers
the audience question. Rule out one option now: do not plan to ship a 3D
three.js game to Steam wrapped in Electron.

---

## Part 1 - Publishing on Steam

### Mechanics (the easy part)

| Item                           | Figure                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Steam Direct fee               | $100 per app, credited back after $1,000 adjusted gross revenue. Not refundable if you never ship. |
| Vetting wait                   | 30 days from paying the fee before release is permitted                                            |
| Store page minimum             | Live as "Coming Soon" at least 14 days before release                                              |
| Store/build review             | 3-5 business days each; re-review after changes is another 3-5                                     |
| Realistic cold start to launch | 2-3 months                                                                                         |
| Post-launch                    | No discounts permitted for the first 30 days                                                       |

Source: partner.steamgames.com/doc/gettingstarted/appfee, /onboarding,
/store/review_process, /marketing/discounts.

**Uploading is genuinely simple.** SteamPipe takes the finished install folder -
your executable plus assets, exactly as it should sit on a player's disk. No
installer, no proprietary package format, no engine requirement. You define
depots (usually one per platform) and branches (release channels) in VDF scripts
and push with `steamcmd`. Steam handles install and patching.

Platform notes: macOS builds must be 64-bit and **notarized by Apple by you** -
Valve does not do it. Native Linux is optional; most indies ship the Windows
build and let Proton cover Linux and Steam Deck.

### Steam Deck

Deck Verified requires deliberate work, and two requirements bite this design
specifically: full functionality from the default controller config, and support
for Steam's on-screen keyboard wherever text entry is required. **This game's
core input is typing numbers**, so on-screen keyboard integration is not
optional if Deck matters.

Source: partner.steamgames.com/doc/steamdeck/compat

### Ratings

Steam is not part of IARC; it runs its own content survey and applies internal
age gating. A children's math game with no mature content produces an all-ages
result with no descriptors. One regional exception: since 15 Nov 2024, German
law requires a valid USK age rating or games are hidden from German customers.

### The account problem

Steamworks onboarding requires signing a binding Distribution Agreement and NDA,
a bank account in the payee's own legal name, and a valid tax ID (W-9 for US
persons). Steam publishes no explicit minimum partner age, but these three
requirements together mean a minor generally cannot be the contracting party.

**Practical consequence: a parent or guardian would need to own the Steamworks
partner account.** You can build and own the game entirely; the commercial
entity is the constraint. Worth settling early, not at launch.

### The audience problem

This is the finding that matters most.

Steam's own Subscriber Agreement bars under-13 accounts outright: _"You may not
become a Subscriber if you are under the age of 13."_ The intended players
cannot legally hold accounts. There is also no kids or family storefront section
on Steam - discovery is tags, wishlists, curators and sales events, all built
around adult PC gamers shopping for themselves.

Comparable titles on Steam, pulled from their store pages:

| Game             | Released | Price | Reviews |
| ---------------- | -------- | ----- | ------- |
| Math Fun         | Oct 2017 | $4.99 | 85      |
| Zeus vs Monsters | Feb 2016 | $5.99 | 25      |
| MathLand         | May 2023 | $5.99 | 10      |

Applying the Boxleiter estimate (roughly 30-50 owners per review at this tier),
these sold in the low hundreds to low thousands of copies over years. Directional,
not precise - Valve does not publish unit sales.

Neither of the two best-known children's math products ships on Steam. Prodigy
and DragonBox are both mobile/browser, both freemium or subscription. Prodigy
converts under 5% of parents at roughly $107/year - a model Steam's one-time
purchase pattern cannot host.

**Conclusion: Steam is a poor primary channel for a game positioned as
grade-school education.** It is a reasonable secondary SKU later. The channels
that work for this category are mobile app stores with family sections,
browser-based distribution direct to schools, and district licensing.

---

## Part 2 - Web tech vs native engine

### The crux finding

The proven "web game ships on Steam" precedent is **entirely 2D**. Vampire
Survivors is Phaser (2D canvas, 1M+ copies). Cookie Clicker is HTML5/JS. Both
are wrapped in a Chromium shell, most likely NW.js.

Research found **no verified commercially successful 3D WebGL game on Steam** -
searched three.js, Babylon.js and PlayCanvas specifically. Babylon has one small
title; the three.js forum shows developers planning this, not shipping hits.

"No evidence found" is not proof of impossibility, but it means choosing this
path is pioneering, not following.

### Electron's specific tax

The Steam overlay is **broken by default under Electron**. Chromium's partial
repaint optimization stops redrawing when it thinks nothing changed, which
prevents Valve's overlay paint hook from firing - the overlay fails to appear or
freezes. Confirmed in electron/electron#3340 and ceifa/steamworks.js#97, #102.

The documented workaround is a permanent hack: launch with `--in-process-gpu`
and run a hidden full-screen canvas with a continuous requestAnimationFrame loop
forcing a repaint every frame purely to keep the hook alive. That is an ongoing
cost, not a setup step.

Add ~120-150MB of bundled Chromium for what is meant to be a lightweight
low-poly game, and a Steamworks binding (steamworks.js) that is functional and
community-sustained but slow-moving.

Tauri is structurally more attractive (native webview, single-digit MB shell) but
immature for games: WKWebView has weaker WebGL2 behaviour than bundled Chromium,
Steam overlay support is an open unresolved issue (tauri-apps/tauri#6196), and no
shipped commercial Steam game uses it.

### Native engines

**Godot 4** exports native executables directly. GodotSteam is a mature
GDExtension, actively released into 2026, covering achievements, cloud saves,
rich presence and overlay. MIT licensed, free forever, no revenue threshold.
Direct precedent for this aesthetic: **Cruelty Squad** is Godot, stylized
low-poly 3D, roughly $19.7M gross.

**Unity** has the more industry-hardened pipeline and deeper stylized-asset
ecosystem. The 2023 Runtime Fee was fully scrapped in Sept 2024; Personal is free
under $200k trailing revenue, with seat costs above that. A Short Hike is the
reference for this exact calm low-poly look.

Flat shading is a mesh-normal import setting, not an engine capability - both
handle the art direction fine.

**Trap worth knowing: Godot's C# cannot export to web.** Dropped in Godot 4.0
when C# moved to .NET Core hosting APIs, still true in 2026
(godotengine/godot#70796). If you want Godot _and_ a browser build, you must
write GDScript.

### The AI-agent factor

Real and confirmed: GDScript has materially thinner LLM training data than
TypeScript, with documented failure modes of mixing Godot 3 and 4 APIs and
inventing plausible method names. Three mitigations: these are compile-time
catchable errors that an agent loop with a test cycle absorbs; Claude models are
currently reported as the strongest for GDScript; and Godot with C# is an escape
hatch with rich training data, at the cost of web export.

For an agent-driven development loop, TypeScript remains the highest-yield
language by a clear margin.

### Web export quality

Godot 4.3/4.4 web export is usable but compromised: Compatibility renderer only
(no Forward+), ~25-35MB for an empty project, and macOS/iOS Safari currently
broken via upstream SharedArrayBuffer/WebGL2 bugs. Unity WebGL is more hardened
but CPU-bound on draw-call dispatch.

A three.js build has no export step at all - the dev build _is_ the browser
build, always current, no renderer downgrade. That is a genuine advantage
neither engine can match.

---

## The recommendation

**The engine decision is downstream of an unresolved product decision**, so make
that one first:

- Positioned as education for children -> web and mobile are the channels, Steam
  is marginal, and three.js is correct.
- Positioned as a calm satellite-operations systems game for teens and adults ->
  Steam is viable, and a native engine is worth the port.

Note that GROUND TRACK as designed is much closer to the second than the first.

**Regardless of which way that goes, start in three.js**, because:

1. The direction document says the first thing to prototype is propellant
   pressure tuning with real children. That is a design question, not an engine
   question, and a browser link can be sent to a child where a Steam build
   cannot.
2. Agent-driven iteration is materially faster in TypeScript.
3. Committing to Godot now bets on the Steam-first answer before it is known.

**Architect for portability from day one.** The lesson from Locus applies
directly: keep the simulation core pure and engine-independent - orbital
mechanics, maneuver-card generation, grade adaptation, progression - with zero
rendering dependencies, fully testable headlessly. Then a future port is
"rewrite the renderer," not "rewrite the game."

**Ruled out now:** shipping a 3D three.js game to Steam wrapped in Electron. No
precedent, a permanent overlay hack, and heavy bundle cost for a game whose whole
identity is lightness. If Steam becomes the goal, port the renderer to Godot.
