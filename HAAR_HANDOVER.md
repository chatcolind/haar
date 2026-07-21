# HAAR — SESSION HANDOVER (complete state)
**Upload this to the new chat. Source of truth. Where companion docs conflict, THIS wins.**

_State as of 2026-07-21. Repo main. Previous handover's Slice 6 cosmos state all still true (two-level world, per-const tape reels, AKAI rig, planets, survey key) — see git history/HAAR_MASTER for detail. This doc adds two sessions of findings and THE NEW DIRECTION._

## THE LAWS (paid for in hours — never re-derive)
1. **Sound = SOURCE × transformation. Granulation rearranges time; it CANNOT create timbre.** A choir/flute/bass difference can only come from the source. Haar has been starving on one static synth tone + two wavs. This is THE finding.
2. **Feedback has no sound of its own — it amplifies whatever changes per pass.** (Too much per-pass transform = siren; zero = loop pedal; deliberate small transform = instrument.)
3. **A family = a different topology, verifiable in source code** (different signal graph), not a different schedule. Twelve schedules of one graph = variations on a theme (proven by ear).
4. **Before proposing ANY feature: one sentence stating what Haar cannot currently do, checked against code.** If unwritable, the feature doesn't exist. When an implementation fails twice, question the PREMISE.
5. The Microcosm never generates its own tone. VOICES is dead — killed because Haar is ALREADY a self-sustaining drone machine (engines self-clock; pitch stack = home+tuning+register+chordStep+conductor holds chords hands-off).
6. Main is always playable. Spike code never ships dirty.

## THE ENGINE BENCH (protocol + verdicts)
Protocol: cheap throwaway spike → audition on THREE materials (synth, cello wav, birds wav) → Colin scores → pass/park/cut. Spikes judge the ROOM (topology character), not the finish; mind-blowing is the tuning bench's job. WARP's tick = the audition body (currently left as the RITUAL phrase — restore/replace when family builds start).
- **CLOUD** ✓ incumbent (grain-scatter; TUNNEL + MOSAIC are its proof).
- **LATHE** ✓ 70 — feedback × per-pass transform (down-semi+dark = descent/erosion; up = shimmer axis). Character: trails the player ~ring-length (memory = latency — design around, disclose). Debts: ring click-safety (write-head collisions), tempo-locked ring length, overlapping descents on key change.
- **COMB** ✓ 75 — tuned resonator bank (root/fifth/octave strings) excited by the orb's voice. Instant character, all 3 materials passed, birds strongest. Real build needs live key/scale tracking (spike hardcoded Bb 116.54).
- **RITUAL** provisional — composed gesture phrases on the grid. Verdict "could work, control is key" — only earns its slot if phrases are COMPOSABLE (grid/subdiv/fill/seed as its brain), else it's a lick.
- **SIFT** parked at two strikes — spectral gate crackled twice (bin flicker), do not re-patch; revisit only as a redesign. **PRISM** unheard (FFT cost).
- HAZE flesh spike (env/tilt grain fields): env+tilt worklet fields were REVERTED with the worklet; the haze tick in microcosm.ts may still send env/tilt harmlessly (worklet ignores unknown fields) — clean when convenient.

## THE RECIPE SYSTEM (built, proven, kept)
- `CLOUD_RECIPES` in microcosm.ts: engines as data. `tickCloud(recipeId)` = the one player. TUNNEL migrated; **A/B chip top-right of field (RECIPE/LEGACY) — Colin verdict: identical.**
- `SHIPPED_RECIPES` frozen copy; statics recipeGet/recipeSet/recipeReset; bridges microcosmRecipeGet/Set/Reset/AB.
- **WORKBENCH (dev skin)**: TUNNEL orb-back → green ENTER chip → full-screen dial view (10 dials: voices base/density, len base/+X, memory min/range, tick base/-density, gain, pan width) + ROLL (dice all dials) + RESET. Live-writes the shared recipe (per-engine-type today; per-orb later with SAVE NEW). Known bug: dial jumps mid-grain click (needs ramping). Verdict: dials = different SOUNDS, families = different ORBS. Styling pass deferred until more families exist (no web furniture in the final skin).

## ★ THE NEW DIRECTION — THE SOURCES SLICE (next build, fully designed)
**The hard reset. The source side of the equation is the missing half.** Two workflows, one destination:
- **PROSPECTING (live):** guitar/mic plugged in, playing THROUGH an engine live, switching engines while playing, hunting. At "wow" → hit SAMPLE → the moment is kept. Scouting room, not a stage (headphones; latency is character here, never promise pedal-grade monitoring).
- **MINING (loops):** capture 8s of a 70s record / find the clean bar. Three stations: loop CLEAN / loop through ENGINE / loop with FULL CHAIN. Curate, keep or cut.
- Both roads end in the **PANTRY**: named captured sources, equal citizens with wavs, choosable by any constellation (captures ARE buffers — the one-buffer primitive was designed for this; FREEZE proves the capture mechanic).
- **THE SAMPLER STATION ("QUARRY")**: a full-screen station (like cosmos/interior — Haar's proven pattern), NOT a plug-in (a separate AudioContext would make live-through-engine and dual-capture impossible; discovery requires engines inside the loop). Module architecture: narrow contract = "deliver named buffers to the pantry" + read taps. Sampler never reaches into the field; field never knows how captures were made. LAW: finished rooms stay finished; new parts enter as stations behind contracts.
- **v1 scope (ruthless, professional):** record with REAL input metering + gain staging; loop with AUTOMATIC seam crossfade; trim; quantize-to-bars; VARISPEED (tape-style, speed+pitch together — NOT fake timestretch; true stretch later via library if earned); save/retrieve; **dual capture** (CLEAN = ring copy; MANIPULATED = tap at engine bus / chain end — per-engine buses already exist for the reels); **resampling** (output becomes input — the reverb-drowned-voice-as-source move; the professional sampler's soul). Storage: **IndexedDB from day one** (captures are ~11MB/min; localStorage dies at 5MB) + export-to-file.
- **Input hardening (the swamp, budgeted honestly):** getUserMedia with echoCancellation:false, autoGainControl:false, noiseSuppression:false (miss one and guitars drown); device selection; sample-rate mismatches; Safari vs Chrome; 10–30ms+ latency floor. Happy path = days; professional = weeks of device hardening. Build order: 1) the door (input→ring) 2) live scouting through engines 3) SAMPLE-the-moment + tempo-locked loop capture 4) three stations 5) pantry→constellations.
- In-house curated sample library = parallel craft track (timbrally spread: choir/vocal drone, breath-flute, deep bass, struck metal, spoken word). Sample sources for hunting: Freesound (CC0), Pixabay, signaturesounds.org, archive.org.

## PARKED / DEBTS
- Engine bench resumes AFTER sources exist (audition against varied live input — the test environment it always needed). LATHE+COMB proper builds on the recipe system when it does.
- Recipe tempo-lock (FREE/LOCK tick mode riding engineLocked/grid) — recon done (dispatch ~line 554), wiring not.
- Roll/dial click fix (ramp recipe changes). Workbench per-orb recipes + SAVE NEW. Inside-the-planet final skin.
- Older list (post-SOURCES): enter/exit transition, engine-skinned planets (skin reflects anatomy), Syzygy, haar fog (NOTE: LATHE's slow-erosion character may belong here — harvested finding), Long Exposure (design readable-back), Slice 8 persistence, FX/signal-path panel still UI-only, orb-back voices panel = dead UI to strip in its redesign.

## WORKING AGREEMENTS (unchanged, binding)
Colin runs all commands on his Mac (~/Desktop/haar), pastes output. One command block per step; wait; confirm. Two terminals (dev in T1). Hard-reload after every edit, MANDATORY after worklet changes. Python3 heredocs with assert anchors; on assert failure the file is UNTOUCHED — grep the disk, re-anchor by index, never trust scrollback. If something fails twice, question the premise. zsh: no `!` in commit messages, single-quote grep patterns. Effects after state; ref-mirror for rAF/MIDI-touched state. Colin sets the pace; honest worlds-best-designer candour; "feels cheap" is a design verdict to diagnose, never defend. Test song Bb minor 92 BPM. Big pastes may arrive empty — request ≤25-line sed chunks.
