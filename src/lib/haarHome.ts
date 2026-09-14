// HAAR HOME - the one folder Haar lives in on Colin's machine.
// Picked once (File System Access API, Chrome), remembered via IndexedDB
// (directory handles survive restarts there; permission may need one click to re-grant).
// Structure: <home>/Haar/Wavs/  - saves land here, opens start here.

let homeHandle: FileSystemDirectoryHandle | null = null;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('haar-home', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbGet(key: string): Promise<any> {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    tx.onsuccess = () => res(tx.result); tx.onerror = () => res(null);
  });
}
async function idbSet(key: string, val: any): Promise<void> {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
    tx.onsuccess = () => res(); tx.onerror = () => res();
  });
}

export async function pickHome(): Promise<boolean> {
  try {
    // @ts-ignore - File System Access API
    homeHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet('home', homeHandle);
    console.log('[home] picked:', homeHandle!.name);
    return true;
  } catch { return false; }   // user cancelled
}

export async function getHome(): Promise<FileSystemDirectoryHandle | null> {
  if (homeHandle) return homeHandle;
  const stored = await idbGet('home');
  if (!stored) return null;
  // permission may need re-granting after a restart - one click
  // @ts-ignore
  const perm = await stored.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') { homeHandle = stored; return homeHandle; }
  // @ts-ignore
  const req = await stored.requestPermission({ mode: 'readwrite' });
  if (req === 'granted') { homeHandle = stored; return homeHandle; }
  return null;
}

export async function wavsDir(): Promise<FileSystemDirectoryHandle | null> {
  const home = await getHome();
  if (!home) return null;
  const haar = await home.getDirectoryHandle('Haar', { create: true });
  return haar.getDirectoryHandle('Wavs', { create: true });
}

export async function writeWav(name: string, bytes: ArrayBuffer): Promise<boolean> {
  const dir = await wavsDir();
  if (!dir) return false;
  // never overwrite: collide -> date-stamped sibling
  let fname = name + '.wav';
  try { await dir.getFileHandle(fname); fname = name + '_' + Date.now() + '.wav'; } catch {}
  const fh = await dir.getFileHandle(fname, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
  console.log('[home] wrote', 'Haar/Wavs/' + fname);
  return true;
}

export async function instrumentsDir(): Promise<FileSystemDirectoryHandle | null> {
  const home = await getHome();
  if (!home) return null;
  const haar = await home.getDirectoryHandle('Haar', { create: true });
  return haar.getDirectoryHandle('Instruments', { create: true });
}

export async function writeInstrument(name: string, json: string): Promise<boolean> {
  const dir = await instrumentsDir();
  if (!dir) return false;
  // songs OVERWRITE by name (unlike wavs): saving a song again updates it - the expected verb
  const fh = await dir.getFileHandle(name + '.json', { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.close();
  console.log('[home] wrote', 'Haar/Instruments/' + name + '.json');
  return true;
}

export async function saveWavAs(name: string, bytes: ArrayBuffer): Promise<string | null> {
  // THE SAVE DIALOG for wavs - rooted in Haar/Wavs, browse anywhere, New Folder, yours.
  try {
    const dir = await wavsDir();
    // @ts-ignore
    const fh = await window.showSaveFilePicker({
      suggestedName: name + '.wav',
      types: [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }],
      startIn: dir || 'music',
    });
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
    return fh.name;
  } catch { return null; }   // cancelled
}

export async function saveInstrumentAs(name: string, json: string): Promise<string | null> {
  // THE SAVE DIALOG - every save. See the folders, make new ones, choose. 1999 rules.
  try {
    const dir = await instrumentsDir();
    // @ts-ignore
    const fh = await window.showSaveFilePicker({
      suggestedName: name + '.json',
      types: [{ description: 'Haar instrument', accept: { 'application/json': ['.json'] } }],
      startIn: dir || 'documents',
    });
    const w = await fh.createWritable();
    await w.write(json);
    await w.close();
    return fh.name;
  } catch { return null; }   // cancelled
}

export async function openInstrumentFile(): Promise<string | null> {
  // browse the library: OS picker rooted in Haar/Songs (folders, subfolders, 500 songs - Finder's problem, solved)
  try {
    const dir = await instrumentsDir();
    // @ts-ignore
    const [fh] = await window.showOpenFilePicker({
      types: [{ description: 'Haar instruments', accept: { 'application/json': ['.json'] } }],
      startIn: dir || 'documents',
    });
    const f = await fh.getFile();
    return await f.text();
  } catch { return null; }   // cancelled
}

// ── SONGS: a song is a PACKAGE on disk - Haar/Songs/<name>/song.json + blocks/*.wav ──
// Blocks are recorded audio: immutable, never overwritten. The song file owns position.
// Move a song folder and its audio goes with it. Nothing lives outside the package.
/** gain (dB), fadeIn / fadeOut (bars): the take's voice, applied at play time, never written into the wav */
export type HaarBlock = { gain?: number; fadeIn?: number; fadeOut?: number; id: string; startBar: number; lenBars: number; name: string; file: string; srcBars?: number; offset?: number; perf?: string; instrument?: string };
export type HaarTrack = { id: string; name: string; blocks: HaarBlock[]; mute?: boolean; solo?: boolean };
export type HaarSong  = { name: string; bpm: number; tracks: HaarTrack[] };

export async function songDir(name: string, create: boolean = true): Promise<FileSystemDirectoryHandle | null> {
  const home = await getHome();
  if (!home) return null;
  try {
    const haar  = await home.getDirectoryHandle('Haar', { create: true });
    const songs = await haar.getDirectoryHandle('Songs', { create: true });
    return await songs.getDirectoryHandle(name, { create });
  } catch { return null; }   // create=false and the song does not exist
}
export async function blocksDir(song: string): Promise<FileSystemDirectoryHandle | null> {
  const dir = await songDir(song);
  return dir ? dir.getDirectoryHandle('blocks', { create: true }) : null;
}
export async function writeBlock(song: string, file: string, bytes: ArrayBuffer): Promise<boolean> {
  const dir = await blocksDir(song);
  if (!dir) return false;
  // blocks NEVER overwrite: a block file is unique by id, so a collision is a bug - refuse loudly
  try { await dir.getFileHandle(file); console.warn('[home] block exists, refusing overwrite:', file); return false; } catch {}
  const fh = await dir.getFileHandle(file, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
  console.log('[home] wrote', 'Haar/Songs/' + song + '/blocks/' + file);
  return true;
}
export async function readBlock(song: string, file: string): Promise<ArrayBuffer | null> {
  const dir = await songDir(song, false);
  if (!dir) return null;
  try {
    const blocks = await dir.getDirectoryHandle('blocks');
    const fh = await blocks.getFileHandle(file);
    return await (await fh.getFile()).arrayBuffer();
  } catch { return null; }
}
export async function writeSongFile(song: HaarSong): Promise<boolean> {
  const dir = await songDir(song.name);
  if (!dir) return false;
  // the song file OVERWRITES: saving again updates the arrangement, the blocks stay put
  const fh = await dir.getFileHandle('song.json', { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(song, null, 2));
  await w.close();
  console.log('[home] wrote', 'Haar/Songs/' + song.name + '/song.json');
  return true;
}
export async function readSongFile(name: string): Promise<HaarSong | null> {
  const dir = await songDir(name, false);
  if (!dir) return null;
  try { const fh = await dir.getFileHandle('song.json'); return JSON.parse(await (await fh.getFile()).text()) as HaarSong; }
  catch { return null; }
}

// Generic package writer: Songs/<song>/<dir>/<file>. Immutable by default - an existing file is left alone
// (sources and instrument snapshots dedupe by name); overwrite=true for files that are meant to update.
export async function writeInPackage(song: string, dir: string, file: string, data: ArrayBuffer | string, overwrite: boolean = false): Promise<boolean> {
  const sd = await songDir(song);
  if (!sd) return false;
  const d = await sd.getDirectoryHandle(dir, { create: true });
  if (!overwrite) { try { await d.getFileHandle(file); return true; } catch {} }
  const fh = await d.getFileHandle(file, { create: true });
  const w = await fh.createWritable(); await w.write(data); await w.close();
  console.log('[home] wrote', 'Haar/Songs/' + song + '/' + dir + '/' + file);
  return true;
}

export async function hasHome(): Promise<boolean> { return (await getHome()) !== null; }
