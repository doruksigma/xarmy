import {
  decodeSave,
  listSaves,
  loadLocal,
  SAVE_CHANGE_EVENT,
  type SaveSlot,
  type SaveSummary,
} from "./storage";
import type { World } from "./types";

export const SAVE_CHANNEL = "xarmy-europa-auto-change";
const DATABASE = "xarmy-europa-auto-v1";
const STORE = "saves";
const AUTOMATIC_SLOTS = ["auto-1", "auto-2"] as const;
type AutomaticSlot = (typeof AUTOMATIC_SLOTS)[number];
const WRITE_ERROR =
  "Cihaz kaydı yapılamadı. Depolama iznini/boş alanı kontrol et veya JSON dosyası indir.";
const READ_ERROR =
  "Otomatik kayıt okunamadı. Cihaz depolama iznini kontrol et.";

let connection: Promise<IDBDatabase> | undefined;
let writes: Promise<void> = Promise.resolve();

function database(): Promise<IDBDatabase> {
  if (connection) return connection;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error(READ_ERROR));
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // An open request may succeed after its blocked event already rejected.
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      const reset = () => {
        db.close();
        if (connection === opening) connection = undefined;
      };
      db.onversionchange = reset;
      db.onclose = reset;
      resolve(db);
    };
  });
  connection = opening;
  void opening.catch(() => {
    if (connection === opening) connection = undefined;
  });
  return opening;
}

function committedSave(
  db: IDBDatabase,
  slot: AutomaticSlot,
  world: World,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error(WRITE_ERROR));
    transaction.onerror = () => reject(new Error(WRITE_ERROR));
    // IndexedDB stores the structured snapshot directly. In particular, do not
    // JSON.stringify or synchronously write localStorage during an active day.
    transaction.objectStore(STORE).put(
      {
        format: "xarmy-europa-1936",
        version: 2,
        savedAt: new Date().toISOString(),
        world,
      },
      slot,
    );
  });
}

function announceSave(slot: AutomaticSlot) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SAVE_CHANGE_EVENT));
  // Same-origin tabs do not receive native storage events for IndexedDB. A
  // failed notification must never turn an already committed save into failure.
  try {
    const channel = new BroadcastChannel(SAVE_CHANNEL);
    try {
      channel.postMessage({ slot });
    } finally {
      channel.close();
    }
  } catch {
    // Browsers without BroadcastChannel still refresh on opening the archive.
  }
}

export function saveAutomatic(
  slot: AutomaticSlot,
  world: World,
): Promise<void> {
  const operation = writes.then(async () => {
    try {
      await committedSave(await database(), slot, world);
    } catch {
      throw new Error(WRITE_ERROR);
    }
    announceSave(slot);
  });
  // Keep invocation order, including consecutive saves to the same slot. A
  // rejected write remains visible to its caller but cannot poison later saves.
  writes = operation.catch(() => undefined);
  return operation;
}

type StoredSave = { present: false } | { present: true; value: unknown };
async function readAutomatic(slot: AutomaticSlot): Promise<StoredSave> {
  let db: IDBDatabase;
  try {
    db = await database();
    return await new Promise<StoredSave>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      let snapshot: StoredSave = { present: false };
      transaction.oncomplete = () => resolve(snapshot);
      transaction.onabort = () => reject(new Error(READ_ERROR));
      transaction.onerror = () => reject(new Error(READ_ERROR));
      const request = transaction.objectStore(STORE).openCursor(slot);
      request.onsuccess = () => {
        // A cursor distinguishes an absent record from a corrupt value of
        // undefined. Only a genuinely absent record may use a legacy save.
        const cursor = request.result;
        if (cursor) snapshot = { present: true, value: cursor.value };
      };
    });
  } catch {
    throw new Error(READ_ERROR);
  }
}

function validatedWorld(value: unknown): World {
  // Lists are only requested while the archive/setup is visible, and explicit
  // loads pause the simulation before replacing the current campaign.
  // Preserve all existing format/size/schema checks and save migrations there.
  const text = JSON.stringify(value);
  if (typeof text !== "string") throw new Error("Okunamayan kayıt");
  return decodeSave(text);
}

export async function loadBrowserSave(slot: SaveSlot): Promise<World> {
  await writes;
  if (slot !== "auto-1" && slot !== "auto-2") return loadLocal(slot);
  const stored = await readAutomatic(slot);
  return stored.present ? validatedWorld(stored.value) : loadLocal(slot);
}

export async function listBrowserSaves(): Promise<SaveSummary[]> {
  await writes;
  const legacy = listSaves();
  const automatic = await Promise.all(
    AUTOMATIC_SLOTS.map(async (slot): Promise<SaveSummary> => {
      try {
        const stored = await readAutomatic(slot);
        if (!stored.present) return legacy.find((s) => s.slot === slot)!;
        const world = validatedWorld(stored.value);
        return {
          slot,
          label: `${world.countries[world.player].name} · ${world.day}. gün`,
          valid: true,
        };
      } catch {
        // Denied access or a corrupt IndexedDB entry must not expose an older
        // localStorage snapshot as though it were the current automatic save.
        return { slot, label: "Okunamayan kayıt", valid: false };
      }
    }),
  );
  return legacy.map(
    (summary) => automatic.find((s) => s.slot === summary.slot) ?? summary,
  );
}
