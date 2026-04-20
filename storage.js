/* storage.js — IndexedDB via Dexie (loaded as global `Dexie`).
 *
 * Table: points
 *   id (++), t (iso), lat, lon, sog, cog, heading, heel, acc, uploaded (0|1)
 */
(function () {
  'use strict';

  if (typeof Dexie === 'undefined') {
    console.warn('[storage] Dexie not loaded; storage disabled.');
    window.Storage = { init: async () => {}, addPoint: async () => {}, clearAll: async () => {} };
    return;
  }

  const db = new Dexie('pampero');
  db.version(1).stores({
    points: '++id, t, uploaded',
  });

  async function init() {
    await db.open();
  }

  async function addPoint(p) {
    await db.points.add({ ...p, uploaded: 0 });
  }

  async function takePending(limit = 200) {
    return db.points.where('uploaded').equals(0).limit(limit).toArray();
  }

  async function markUploaded(ids) {
    if (!ids.length) return;
    await db.points.where('id').anyOf(ids).modify({ uploaded: 1 });
  }

  async function pendingCount() {
    return db.points.where('uploaded').equals(0).count();
  }

  async function allPoints() {
    return db.points.orderBy('t').toArray();
  }

  async function clearAll() {
    await db.points.clear();
  }

  window.Storage = {
    init, addPoint, takePending, markUploaded, pendingCount, allPoints, clearAll,
  };
})();
