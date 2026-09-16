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

## THE WORDS - ratified 14 Sept 2026, evening. These replace "orb / front / constellation / layer".
  ENGINE       one voice. In the code it is still an orb (Orb.tsx, orbIds). On the horizon it is a skyline of light.
  INSTRUMENT   one source through its engines: a wav through Tunnel, Mosaic and Shimmer is one instrument.
               In the code it is a constellation. Its moon is above its stretch of the horizon.
  THE RACK     the instruments loaded now. A circle bottom-right opens it: one row per instrument, its moon's
               colour, name (tap to select - its moon lights), M, S. All drone / all touch beneath.
               Empty until an instrument has an engine. + new is NOT a rack verb - the bright ball is the door.
  SONG         the package on disk. Saving the arrangement writes every instrument in the rack into it;
               opening the song brings the rack back with the last selected instrument on the sky. (next)
  SAVE         saves the SELECTED instrument (source + engines) under its name; the name sits under HAAR;
               save again = same name, no questions. OPEN loads a saved instrument INTO the rack with fresh
               engine ids. (next)
  BUILD        has no floating transport. REC is a red ring in Haar's console beside Start, the target track
               a badge on the ring; rolling shows as one quiet readout top-centre and red ripples; Song ▶ plays
               the tape under whatever is loaded. Arrange hushes every engine (touch) and Build restores them.
  ARRANGE      waves in the slabs (normalised), the playhead a beam of light, white type on Skye. A take's
               card: gain (dB), NORMALISE, fade in / out (bars, drawn on the slab, ramps on the tape),
               SPLIT AT HEAD, OPEN INSTRUMENT (its snapshot back into Build), DELETE. M / S per track,
               instant. UNDO on the header. Rename take and track by tapping.
  Rejected on the way: literal clouds (soft, bokeh, comedy), a rising sun (cheesy), a black transport bar
  in Build, a permanently open rack panel, a top-left snapshot rack.

## THE ROOM - ratified 16 Sept 2026. Recording moves to Arrange. A track owns an instrument.

Recording belongs where you can see time. "Come in at bar 16" is an Arrange sentence; Build has no bar 16. So:

**A track carries an instrument.** Tap a track's header and the rack opens - the song's instruments - and you pick one. The track now has a voice. It stays on the track and in the song file (`HaarTrack.instrument`). One instrument may sit on several tracks.

**Record on the track.** REC records the track's instrument onto the track, from the head, in one of two ways:
- **touch** - you play it in. The instrument is armed and silent until you press.
- **drone** - it plays itself; your hands are on XY and the knobs.
Every take still carries its snapshot, as now. The take is recorded dry - the instrument's own voice, before the channel - so a take is never baked with today's reverb.

**Engines through the desk.** An instrument on a track is heard through that track's channel: mute → level → EQ → pan → sends → master. Four things follow at once: you hear the instrument in the mix while you play or record; PRINT hears it, so a performance prints; the strip's light shows real signal per instrument; the tape and the instrument are one world, not two. The desk is the only way out.

**The engine card.** With an instrument on the track, a door opens its inner room as a glass card over Skye - XY and the knobs first, the whole room later. It is live: parameters move while the song plays, while a take records, while PRINT runs.

**Build keeps building.** Build is where instruments are made and auditioned: engines, sources, the rack, Start. REC leaves Build's console, with its target-track badge, once Arrange's REC is proven. Build's instrument is heard through a plain channel (flat, no sends) or through its assigned track's channel - decided when engines move to the desk.

**Order, each step a working machine:**
1. Instrument per track: the field, the picker on the header, REC in Arrange with touch / drone. Build's REC stays until this is proven.
2. Engines through the desk.
3. The engine card on Skye.
4. REC off Build's console.

Words: the **track's instrument** (what it carries), **arm** (select the track; its instrument is the one that sounds), **the card** (the instrument's inner room, in Arrange).
