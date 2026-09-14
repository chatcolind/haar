# ARRANGE — the tape room. Design spec, ratified 12 Sept 2026.

Haar is three things: an INSTRUMENT BUILDER (CREATE — the field is the instrument,
orbs are voices, constellations are layers, one key moves all of them), a SONG
CREATOR (ARRANGE — this room), and a SAMPLER (sounds in, shaped, fed into orbs).
Ruled out: split keyboard, per-orb polyphony. The tape is the polyphony.

The bar: a SERIOUS song-creation machine. Not "Cubase's feature list" — Cubase's
real model: a recording is editable AS MUSIC, not just as sound.

## The two bodies
Every block has two bodies. Playback only ever touches the first.
- THE RENDER: blocks/blk_x.wav. Plays as a plain native buffer player. No engine,
  no instrument loaded. Sixteen tracks cost nothing. The field stays free.
- THE PERFORMANCE: blocks/blk_x.perf.json. Every note on/off, T-fire, mute punch,
  XY move, level change, with bar-relative time, plus the instrument that made it.
RE-RENDER: load the block's instrument into the field, play its events through it
into the tap, write a new wav, swap it in. Real-time (the engine is live; there is
no offline granular). Per block, chosen. A hardware-sampler bounce, not a DAW freeze.
Audio-only blocks (imports, vocals, bounces) have no performance body: they play and
edit on the bench, they cannot re-render. Same lane, same gestures.

## The song owns its instruments
First time an instrument is recorded into a song, its file is snapshotted into
the package: instruments/<name>.json. A block references the snapshot, never the
live library. The package is self-contained: move the folder, everything comes.

    Songs/<name>/
      song.json                 tracks, blocks, tempo, mix, markers
      blocks/blk_x.wav          the render
      blocks/blk_x.perf.json    the performance
      instruments/<name>.json   snapshot of what made it

Blocks are immutable audio, never overwritten. The song file owns position.
Two blocks may point at one wav.

## The one-door law
Every parameter change — mouse or MIDI — dispatches through the action registry.
The recorder subscribes to the registry. Anything you can do to the instrument while
the tape rolls is automation, for free, without an "automation" feature per control.

## The take
1. Build the instrument in CREATE. Voices you play: TOUCH. Beds you want recorded:
   DRONE, unmuted. WHATEVER IS LIVE AND UNMUTED IS RECORDED. The tape never is.
2. Select a track.
3. REC. Transport rolls if it wasn't. Head arms on the NEXT bar (the rest of this
   bar is the count-in, with the click).
4. Open-ended. Silence at the start is just bars.
5. REC or STOP: the head stops on the NEXT bar boundary. Takes are always whole bars;
   blocks tile; loops are seamless. Free length is not needed — the bench trims.
6. The take lands on the selected track at the bar it started. Overdub = same
   gesture with the tape playing; you hear it, the tap does not.

## Two views of one song
- CREATE gains a TAPE STRIP: transport (play/stop/REC), selected track, a short
  scrolling lane of the last bars. Record without leaving the instrument. AKAI
  transport buttons are registry actions.
- ARRANGE is the whole song: all tracks, full length, gestures, mix, export.
Same state, same clock, same head.

## Blocks on the timeline
Schema: { id, startBar, lenBars, srcBars, offset, name, file, perf?, instrument? }
lenBars > srcBars = repeat (one native player, loop=true, loop length = source,
stopped at the block end). offset = trimmed from the left.
Gestures (all snapped to bar, all undoable):
  tap = select · double-tap = bench on that audio (PROCESS writes a NEW block file)
  drag = move · right edge = extend (loop) or trim · alt-drag / Cmd+D = copy
  (same wav, new entry) · split at head · delete (timeline entry only, file stays)
Performance edit: notes and lanes (XY, mute, level) under the wave; quantise;
change instrument; re-render.

## Tracks
16 lanes. Header: name, level, M, S; tap = record target. Per-track strip
(EQ / comp / sends) on the clean-lane pattern. Master + metering.

## Feature bar
CORE (serious means this): performance+audio capture · open-ended record, stop on
bar · punch in/out · loop-record with takes · split/trim/move/copy/delete with undo ·
note edit + quantise + re-render · per-track strip + automation lanes · master +
metering · loop region + markers · export mixdown and stems.
PRO (after a song exists): comping lanes · crossfades · tempo track · time-stretch
on the timeline · groups/sends · MIDI out.
NOT HAAR: video, notation, VST hosting, surround.
Nothing in CORE is cut (Colin, 12 Sept 2026).

## Build order to one song out
1. One-door law + event capture (every take after this is editable)
2. Open-ended head, stop on bar; track select
3. Tape strip in CREATE
4. Gestures: move / extend / copy / split / delete, undo
5. Mix: track level/pan/M/S, strips, master
6. Export: offline mixdown to the package
Then: performance editor + re-render · loop-record/takes · punch · markers · naming.

## Built so far (Sept 2026)
Chassis · song package on disk · a fixed-length bar-true head (sample-exact, wrong
shape) · tape playback with sweep · song reloads on open · recorder hears clean lanes.

## THE REEL — ratified 14 Sept 2026. The whole instrument is one journey through four skies.
Arrange is the design centre; every other room is built to sit beside it. One glowing horizon
line runs through every scene; the work floats below it; the same transport rides every sky.
Moving between rooms is the reel playing: slow dissolves (~900 ms), the horizon holding still
while the weather changes. The reel strip (rooms as frames, the current one lit) is navigation.
  BUILD           the Great Plains, a supercell at dusk. FRONTS, not orbs: a voice is a storm
                  cell. A settled front is wide and slow (the bed = the dark wall cloud, the
                  pad = the lit anvil); a called-in front is small, ringed, waiting. Lightning
                  inside a front is the sound moving. Drag = drift (XY). Size = level.
  INSIDE A FRONT  Iceland, the aurora. The curtains ARE the sound - density and level move
                  them. Six controls floating in the sky, no more. Mountains are the horizon.
  SAMPLER         Catatumbo, the storm that never stops. The wave is the lake it is lit on;
                  every cut is a strike. Verbs: reverse · fade · to tempo · INTO A FRONT (lit).
  ARRANGE         Skye, the break (see THE LOOK above).
Build order: (1) the Sky layer behind every room with the four scenes and the dissolve;
(2) Arrange re-skinned onto Skye with no tools; (3) fronts replace the orb bodies in Build;
(4) the aurora face and the Catatumbo bench; (5) the reel strip. Spinning orbs are retired.
Reference renders: haar-reel.html (outside the repo).
