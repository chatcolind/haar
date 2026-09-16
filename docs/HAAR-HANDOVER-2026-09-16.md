# HAAR — Handover, 16 Sept 2026 (evening)

Paste this at the start of the next chat. Then run the state check under §1 before touching anything.

---

## 0. Who / what

Haar is a browser granular instrument + song creator. Owner: Colin (Blind Panda). Repo `github.com/chatcolind/haar` (main), local `~/Desktop/haar`, dev `localhost:3000/field`, live `haar-pi.vercel.app`. Next.js 14, custom AudioWorklet, no Tone.js on the hot path. Colin runs commands in zsh and pastes output / screenshots. **The spec is `docs/ARRANGE.md` — read THE REEL, THE WORDS and THE ROOM blocks first each session.**

## 1. State check (run first)

Last commit as of handover: the instByName fix (a track's instrument resolves to the constellation with engines). Working tree clean. `origin/main` is ~35 commits behind — push when Colin says.

## 2. The laws (binding)

1. NO GUESSING — read before write. Every edit is a python heredoc with an assert per anchor; a failed assert writes nothing.
2. **Anchors come from a real read of the file, never from pasted output.** Paste collapses spaces (`gain:number`, `oft.blocks`). Prefer **line fingerprints** (a line containing two distinctive tokens, replace the whole line) or line numbers after a `sed -n` read; tolerate spaces with `\s*` regex when the line was only seen pasted.
3. Always ask Colin for the script's printed `WROTE …` lines before assuming it landed.
4. **Never `git checkout -- <file>`.** Bisecting is fine: `git stash push -m x`, `git checkout <hash>`, test, `git checkout main && git stash pop`.
5. `node --check public/microcosm-processor.js` after any worklet edit; hard reload after worklet or constant changes.
6. Fail twice → stop, read the actual code, re-plan. Add a one-line `console.log` diagnostic rather than a third guess.
7. Commit early with narrative messages. Colin says "bank" = commit. No `!` inside double quotes in zsh.
8. A fresh start is empty: nothing auto-restores on reload. Songs return through OPEN SONG, instruments through the Open door.

## 3. Architecture (files that matter now)

- `src/app/field/page.tsx` (~4,900 lines) — the whole UI and most state. Key functions: `arrPlay` (toggle; opens/closes the PRINT tap), `arrExport`, `arrPrint`/`arrPrintFinish`, `arrDecodeBlocks`, `arrTrackChange` (one door for track patches; writes an instrument snapshot into the package when a track takes an instrument), `arrOpenSong`, `playAt` (the finger; gated by `armRef` in Arrange), `instByName`, the **arm effect** (Arrange: gate + modes + `microcosmInstrumentRoute(track)` + `doStart`), the **card** (the `{focused && …}` block, rendered in a draggable window when `arrangeOpen`), the retune effect (waits for Build), Create's audition (`previewEngine(engineType, pid)`, `previewIdsRef`, badge removes its preview).
- `src/audio/cuts.ts` — `cutBlocks()`: the arranger's maths, no audio. Live tape and offline render both read it.
- `src/audio/render.ts` — `renderSong()`: offline mixdown through a `TapeMixer` on an `OfflineAudioContext`; `playCut` mirrors `tapePlay`; `songEndBar`.
- `src/audio/tapeMixer.ts` — the desk (channel = mute → level → EQ → pan → master; sends; limiter). **`tapStart(from)/tapStop()`**: a ScriptProcessor tap on the master for PRINT.
- `src/audio/microcosm.ts` — core. `tapePlay`, `tapeMixer()`, `tapeTapStart/Stop`, **`instBus`** (the whole instrument leaves through one unity gain) and **`instrumentRoute(track|null)`** (Build: destination; Arrange: the armed track's channel). Recorder taps the master reel before the bus — takes are dry.
- `src/audio/engine.ts` — bridge exports (`microcosm*`), `samplerExportWavStereo(L,R,name,sr,bytesOnly)` (16-bit stereo wav bytes), `samplerClick`.
- `src/components/arrange/ArrangeRoom.tsx` — lanes (`ROW_H = 88`), lane header (name · ♪ instrument picker · T/D · ◐ card door · M S · block count), slabs, the take's card, mixer strips, header doors NEW SONG · UNDO · SAVE SONG · OPEN SONG · EXPORT · PRINT.
- `src/components/transport/Transport.tsx` — Arrange only; status line speaks `printed ·` / `exported ·` in full voice.
- `src/lib/haarHome.ts` — File System Access. `HaarTrack` now has `instrument?: string` (the rack name) and `recMode?: 'touch'|'drone'`. `writeInPackage(song, dir, file, bytes|string, overwrite)`.

## 4. THE ROOM (design, ratified 16 Sept — in `docs/ARRANGE.md`)

Recording moves to Arrange. A track carries an instrument (by rack name). Arm = the selected track's instrument answers the key (a gate in `playAt`, not a mute), in the track's mode (T touch / D drone); everything else is deaf. Engines through the desk: the armed instrument sounds through its track's channel, so EQ/sends/fader, the strip's light and PRINT hear it. The card = the instrument's inner room as a draggable glass window over Skye, live while the song plays; breadcrumb carries the instrument's other engines. Build keeps building; REC leaves Build's console last (step 4, **not done** — hold until Colin has recorded real takes in Arrange).

## 5. What exists now (all committed)

- **EXPORT**: offline mixdown → `Songs/<song>/mix/<song>.wav`, from a cold open (decodes first). `[render] n cuts · bars · peak` in console.
- **PRINT**: real-time bounce with a count-in (four beats on `samplerClick`, tape rolls on the downbeat via `arrPrintT0Ref`), tap on the master, stops itself 3 s after the last block or on the play toggle → `mix/<song> print.wav`. Hears the instrument (step 2). Desk stays as it was.
- Arrange opens quiet: OPEN SONG's retune press waits for Build.
- Instrument per track, picker from the live rack, name follows the instrument on stock-named tracks, snapshot written into the package on assignment, `instByName` prefers the constellation with engines.
- Arm (gate + mode + route + doStart), REC in Arrange records the track's instrument, take's card back, a landed take decodes at once.
- The card window (1180×680, drag by the top strip between the breadcrumb and ×), engine pills in the breadcrumb.
- Create auditions the queue together; the badge removes that engine's preview.

## 6. Next (in order)

1. **Colin's snag list** — he is using it; take snags in the order they hurt.
2. Known snags: an empty stock `Instrument 1` stays in the rack beside the real one (Create leftover); the PRINT count-in click is the sampler's, not the bar clock's; the instrument row on the lane header truncates long names; `[render]` log still on.
3. THE ROOM step 4: REC off Build's console (only when Colin says).
4. Instrument files should carry their source wav bytes (still reference IndexedDB ids).
5. Then pass 2: the engines themselves, the sampler's errors, cohesion.

## 7. Known debts / oddities

- Solo re-cuts the tape; mute/level/pan/EQ/sends move in the graph. The live instrument ignores track solo.
- The DynamicsCompressor limiter adds a few ms lookahead — EXPORT and PRINT carry it equally.
- `ScriptProcessorNode` for the PRINT tap is deprecated but universal; a worklet tap is the eventual replacement.
- `tsc --noEmit` baseline is noisy; not a gate.

## 8. How Colin works

Fast, visual, decisive. One thing at a time, real code, no questions unless the answer changes the code. He says "no" bluntly — iterate, don't defend. He pastes terminal output and screenshots the app. Asked "why do we need this?" answer the model in his words (engine, instrument, rack, song, the desk), tied to what he asked for. "Re assess" = pause and say whether the plan is still right before writing. When something goes wrong twice, read; when it goes wrong three times, log.
