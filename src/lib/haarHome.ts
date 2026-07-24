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

export async function songsDir(): Promise<FileSystemDirectoryHandle | null> {
  const home = await getHome();
  if (!home) return null;
  const haar = await home.getDirectoryHandle('Haar', { create: true });
  return haar.getDirectoryHandle('Songs', { create: true });
}

export async function writeSong(name: string, json: string): Promise<boolean> {
  const dir = await songsDir();
  if (!dir) return false;
  // songs OVERWRITE by name (unlike wavs): saving a song again updates it - the expected verb
  const fh = await dir.getFileHandle(name + '.json', { create: true });
  const w = await fh.createWritable();
  await w.write(json);
  await w.close();
  console.log('[home] wrote', 'Haar/Songs/' + name + '.json');
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

export async function saveSongAs(name: string, json: string): Promise<string | null> {
  // THE SAVE DIALOG - every save. See the folders, make new ones, choose. 1999 rules.
  try {
    const dir = await songsDir();
    // @ts-ignore
    const fh = await window.showSaveFilePicker({
      suggestedName: name + '.json',
      types: [{ description: 'Haar song', accept: { 'application/json': ['.json'] } }],
      startIn: dir || 'documents',
    });
    const w = await fh.createWritable();
    await w.write(json);
    await w.close();
    return fh.name;
  } catch { return null; }   // cancelled
}

export async function openSongFile(): Promise<string | null> {
  // browse the library: OS picker rooted in Haar/Songs (folders, subfolders, 500 songs - Finder's problem, solved)
  try {
    const dir = await songsDir();
    // @ts-ignore
    const [fh] = await window.showOpenFilePicker({
      types: [{ description: 'Haar songs', accept: { 'application/json': ['.json'] } }],
      startIn: dir || 'documents',
    });
    const f = await fh.getFile();
    return await f.text();
  } catch { return null; }   // cancelled
}

export async function hasHome(): Promise<boolean> { return (await getHome()) !== null; }
