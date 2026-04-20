/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * uploader.js — batches to POST /api/track every 5s with exponential backoff.
 */
(function () {
  'use strict';

  const API = '/api/track';
  const BASE_INTERVAL = 5000;
  const MAX_INTERVAL = 60000;

  let sailNumber = null;
  let interval = BASE_INTERVAL;
  let timer = null;
  let running = false;
  let lastError = null;
  let lastQueued = 0;

  async function tick() {
    if (!running || !window.Storage) return schedule();
    try {
      const batch = await Storage.takePending(200);
      lastQueued = await Storage.pendingCount();
      if (!batch.length) {
        lastError = null;
        interval = BASE_INTERVAL;
        return schedule();
      }
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sail_number: sailNumber,
          points: batch.map(({ id, uploaded, ...p }) => p),
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await Storage.markUploaded(batch.map(p => p.id));
      lastQueued = await Storage.pendingCount();
      lastError = null;
      interval = BASE_INTERVAL;
    } catch (err) {
      lastError = err;
      interval = Math.min(MAX_INTERVAL, Math.max(BASE_INTERVAL, interval * 2));
      console.warn('[uploader] fail, next in', interval, err);
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (running) timer = setTimeout(tick, interval);
  }

  function start(sn) {
    sailNumber = sn;
    if (running) return;
    running = true;
    schedule();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
  }

  function status() {
    return { queued: lastQueued, error: !!lastError, nextInMs: interval };
  }

  window.Uploader = { start, stop, status };
})();
