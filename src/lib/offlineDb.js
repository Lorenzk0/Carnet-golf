import { openDB } from 'idb'

// Persistance locale pour l'offline-first : `cache` garde la dernière valeur connue de
// chaque clé de stockage (secours en lecture si le réseau échoue), `queue` garde les
// écritures pas encore confirmées par Supabase (rejouées au retour du réseau).
const DB_NAME = 'carnet-golf-offline'
const DB_VERSION = 1

const dbPromise =
  typeof indexedDB !== 'undefined'
    ? openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('cache')
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
        },
      })
    : null

export async function cacheGet(key) {
  if (!dbPromise) return undefined
  return (await dbPromise).get('cache', key)
}

export async function cacheSet(key, value) {
  if (!dbPromise) return
  await (await dbPromise).put('cache', value, key)
}

export async function cacheDelete(key) {
  if (!dbPromise) return
  await (await dbPromise).delete('cache', key)
}

// Une seule écriture en attente par clé : chaque storeSet envoie un instantané complet
// (pas un delta), donc rejouer uniquement la plus récente suffit — pas besoin de
// conserver l'historique des tentatives intermédiaires.
export async function queueAdd(op) {
  if (!dbPromise) return
  const db = await dbPromise
  const tx = db.transaction('queue', 'readwrite')
  const all = await tx.store.getAll()
  for (const e of all) {
    if (e.key === op.key) await tx.store.delete(e.id)
  }
  await tx.store.add({ ...op, queuedAt: Date.now() })
  await tx.done
}

export async function queueAll() {
  if (!dbPromise) return []
  return (await dbPromise).getAll('queue')
}

export async function queueRemove(id) {
  if (!dbPromise) return
  await (await dbPromise).delete('queue', id)
}
