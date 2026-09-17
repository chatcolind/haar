# HAAR — Handover, 17 Sept 2026 (evening)

Paste this at the start of the next chat. Then run the state check under §1 before touching anything. **Read THE REEL, THE WORDS, THE ROOM and THE ENGINES in `docs/ARRANGE.md` first.**

## 0. Who / what
Unchanged from the 16 Sept handover (`docs/HAAR-HANDOVER-2026-09-16.md`): repo, laws, architecture. This file carries what changed on the 17th and the work order.

## 1. State check
Last commit: the click runs only while something does. Tree clean. Push when Colin says (`git push origin main`).

## 2. Laws - additions
- Anchors by line fingerprint; `\s*`-tolerant regex when a line was only seen pasted. A failed assert writes nothing; always ask for the `WROTE` lines.
- Bisecting is `git stash push -m x` / `git checkout <hash>` / `git checkout main && git stash pop` - never `git checkout -- <file>`.
- Worklet edits (`public/microcosm-processor.js`): `node --check` after, hard reload.
- When a change makes it worse, revert it with a targeted replace, in the same turn, before thinking again (the read-shallow attempt on 17 Sept).

## 3. Done on the 17th (all banked)
- **THE KEYS**: one `keyboardRow`, Build's console and a floating glass strip in Arrange behind a KEYS pill beside ARRANGE / MIX.
- **Tempo live** on the transport: drag or scroll the BPM; the song file carries it.
- **One click**: `arrClick` is `metroOn`; the click runs only while the instrument, the tape or a recording runs.
- **LOCK is locked and tight**: locked engines fire on grid lines on the audio clock from the bar anchor (`microcosm.barAnchor`, set from every `barAudioAnchorRef` re-anchor via `microcosmBarAnchor`); the locked tick looks 30 ms ahead and stamps grains with `at` (a frame); the worklet holds a grain per sample until its frame (`wait`). Tempo / division changes rejoin at the next line.
- **LOCK quantises the finger**: `playAt` waits for the beat (`microcosmNextBeat`: a press just after a beat is that beat; later waits; lands 45 ms early so grains born on the beat carry it); a release before the beat is queued. On a **locked synth** the synth holds its root and the grains are pitched by rate through the conductor (as a wave's are) - old grains overlap at the old note, new ones land on the beat. Rate caps at +2 octaves. FREE untouched.
- Reverted: reading the ring shallow for locked grains (clipping, gaps).

## 4. Next
- **THE ENGINES** work order in ARRANGE.md - step 0 is done; step 1 (Mosaic as a recipe + live card) is next when Colin says go.
- Snags in the order they hurt. Known: an empty stock `Instrument 1` beside the real one in the rack; the lane header truncates long names; FREEZE broken on synth; Fauve buggy; `[render]` log still on; ROOM step 4 (REC off Build) held.
- Product notes (not code): sell as an instrument with a room, pitched beside Ableton; iPad via Capacitor (storage adapter + CoreMIDI) is realistic, AUv3/VST is not; price band £20-30 iPad / £40-60 desktop; the engines and one three-minute video matter more than any of it.

## 5. How Colin works
Unchanged. "Re assess" = pause and say whether the plan is still right. "Don't just agree" = argue the other side first. When he says a change is terrible, revert before reasoning.
