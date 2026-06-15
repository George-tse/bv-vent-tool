import { openDB } from 'idb';

const DB_NAME    = 'bv-vent-tool';
const DB_VERSION = 1;

const getDB = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('surveys')) {
      db.createObjectStore('surveys', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('photos')) {
      const s = db.createObjectStore('photos', { keyPath: 'id' });
      s.createIndex('bySurvey', 'surveyId', { unique: false });
    }
    if (!db.objectStoreNames.contains('fan_events')) {
      db.createObjectStore('fan_events', { keyPath: 'id' });
    }
  },
});

// ── Surveys ───────────────────────────────────────────────────────────────────

export const getAllSurveys = async () => {
  const db = await getDB();
  const all = await db.getAll('surveys');
  return all.sort((a, b) => b.date.localeCompare(a.date));
};

export const getSurvey = async (id) => (await getDB()).get('surveys', id);

export const saveSurvey = async (survey) => {
  // Never store photo blob data inside survey — photos live in their own store
  const lean = {
    ...survey,
    readings: survey.readings.map(r => ({ ...r, photos: (r.photos || []).map(p => ({ id: p.id, name: p.name })) })),
  };
  return (await getDB()).put('surveys', lean);
};

export const deleteSurvey = async (id) => (await getDB()).delete('surveys', id);

export const getUnsyncedSurveys = async () => {
  const all = await getAllSurveys();
  return all.filter(s => !s.synced);
};

// ── Photos ────────────────────────────────────────────────────────────────────
// Each photo: { id, surveyId, stationId, name, data }
// data = base64 data URL (from FileReader)

export const savePhoto = async (photo) => (await getDB()).put('photos', photo);

export const getPhotosForSurvey = async (surveyId) => {
  const db  = await getDB();
  const tx  = db.transaction('photos', 'readonly');
  const idx = tx.store.index('bySurvey');
  return idx.getAll(surveyId);
};

export const deletePhotosForSurvey = async (surveyId) => {
  const photos = await getPhotosForSurvey(surveyId);
  const db = await getDB();
  for (const p of photos) await db.delete('photos', p.id);
};

// ── Fan events ────────────────────────────────────────────────────────────────

export const getAllFanEvents = async () => {
  const db  = await getDB();
  const all = await db.getAll('fan_events');
  return all.sort((a, b) => b.date.localeCompare(a.date));
};

export const saveFanEvent = async (event) => (await getDB()).put('fan_events', event);

export const getUnsyncedFanEvents = async () => {
  const all = await getAllFanEvents();
  return all.filter(e => !e.synced);
};
