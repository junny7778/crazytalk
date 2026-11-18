import { useEffect, useState } from "react";

const prefix = "demo-teacher-media:";
const store = "files";
export const isDemoTeacherMedia = (source: string) => source.startsWith(prefix);

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("crazytalk-demo-teacher-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeMedia(change: (files: IDBObjectStore) => void) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      change(transaction.objectStore(store));
    });
  } finally {
    db.close();
  }
}

export async function storeDemoTeacherMedia(files: File[]) {
  const refs = files.map(() => prefix + crypto.randomUUID());
  await writeMedia((records) => files.forEach((file, index) => records.put(file, refs[index])));
  return refs;
}

export async function removeDemoTeacherMedia(refs: string[]) {
  if (refs.length) await writeMedia((records) => refs.forEach((ref) => records.delete(ref)));
}

async function loadMedia(source: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(source);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function useTeacherMediaSource(source: string) {
  const [resolved, setResolved] = useState<{ source: string; url: string }>();
  useEffect(() => {
    if (!isDemoTeacherMedia(source)) return;
    let active = true;
    let url: string | undefined;
    void loadMedia(source).then((file) => {
      if (!active || !file) return;
      url = URL.createObjectURL(file);
      setResolved({ source, url });
    }).catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);
  return isDemoTeacherMedia(source) ? (resolved?.source === source ? resolved.url : undefined) : source;
}
