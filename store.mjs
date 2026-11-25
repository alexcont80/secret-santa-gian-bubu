import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { initial, requireThat } from './domain.mjs';

function encode(state) {
  const data = JSON.stringify(state);
  requireThat(Buffer.byteLength(data) < 800_000, 409, 'Spazio della festa esaurito. Contatta gli organizzatori.');
  return data;
}

export async function makeStore(settings) {
  if (settings.mode === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    await mkdir(dirname(settings.dbPath), {recursive:true});
    const db = new DatabaseSync(settings.dbPath);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS party (id INTEGER PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY,content BLOB NOT NULL)');
    const read = db.prepare('SELECT data FROM party WHERE id=1');
    const save = db.prepare('INSERT INTO party(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
    return {
      read:async () => JSON.parse(read.get()?.data ?? JSON.stringify(initial())),
      mutate:async fn => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const state=JSON.parse(read.get()?.data ?? JSON.stringify(initial()));
          const result=fn(state);
          save.run(encode(state));
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      putPhoto:async (id, content) => db.prepare('INSERT INTO images(id,content) VALUES(?,?)').run(id,content),
      getPhoto:async id => {const photo=db.prepare('SELECT content FROM images WHERE id=?').get(id); return photo ? Buffer.from(photo.content) : null;},
      deletePhoto:async id => db.prepare('DELETE FROM images WHERE id=?').run(id),
      close:() => db.close()
    };
  }

  const {initializeApp} = await import('firebase-admin/app');
  const {getFirestore} = await import('firebase-admin/firestore');
  const options = settings.project ? {projectId:settings.project} : {};
  if (settings.bucket) options.storageBucket=settings.bucket;
  const app = initializeApp(options, 'secret-santa');
  const db = settings.database ? getFirestore(app,settings.database) : getFirestore(app);
  const party = db.collection('events').doc('gian-bubu-2026');
  const photos = party.collection('images');
  const storage = settings.bucket ? (await import('firebase-admin/storage')).getStorage(app).bucket() : null;
  const file = id => storage.file('gian-bubu-2026/photos/'+id+'.webp');
  let cached, validUntil=0, pending, revision=0;
  function read() {
    if (cached && Date.now() < validUntil) return Promise.resolve(cached);
    if (pending) return pending;
    const requestedRevision=revision;
    const loading=party.get().then(snapshot=>{
      const data=JSON.parse(snapshot.get('data') ?? JSON.stringify(initial()));
      if (requestedRevision===revision) {
        cached=data;
        validUntil=Date.now()+2000;
      }
      return data;
    }).finally(()=>{if(pending===loading)pending=null;});
    pending=loading;
    return loading;
  }
  return {
    read,
    mutate: async fn => {
      const result=await db.runTransaction(async tx => {
        const before=await tx.get(party);
        const state=JSON.parse(before.get('data') ?? JSON.stringify(initial()));
        const outcome=fn(state);
        tx.set(party,{data:encode(state)});
        return outcome;
      });
      revision++;
      validUntil=0;
      pending=null;
      return result;
    },
    putPhoto: async (id,content) => storage ? file(id).save(content,{contentType:'image/webp',resumable:false,preconditionOpts:{ifGenerationMatch:0}}) : photos.doc(id).create({content}),
    getPhoto: async id => {
      if (!storage) return (await photos.doc(id).get()).get('content') ?? null;
      try { return (await file(id).download())[0]; }
      catch (error) { if (error.code === 404) return null; throw error; }
    },
    deletePhoto: async id => storage ? file(id).delete({ignoreNotFound:true}) : photos.doc(id).delete()
  };
}
