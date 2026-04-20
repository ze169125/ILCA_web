/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * app.js — orchestration: init, wake lock, 1Hz tick, menu wiring.
 */
(function () {
  'use strict';

  const sailNumber = (localStorage.getItem('pampero.sail') || '').toUpperCase();
  if (!sailNumber) {
    location.replace('setup.html');
    return;
  }
  UI.setSailBadge(sailNumber);

  let wakeLock = null;
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (err) {
        console.warn('[app] wakeLock failed', err);
      }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
  });

  async function init() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); }
      catch (e) { console.warn('[app] sw register failed', e); }
    }
    await Sensors.start();
    await requestWakeLock();

    // Storage/uploader may not exist yet in early bring-up — guard calls.
    if (window.Storage && typeof Storage.init === 'function') {
      await Storage.init();
    }
    if (window.Uploader && typeof Uploader.start === 'function') {
      Uploader.start(sailNumber);
    }

    UI.setStatus('pronto', 'ok');
    setInterval(tick, 1000);
  }

  async function tick() {
    const snap = Sensors.read();
    UI.render(snap);

    if (snap.lat != null && snap.lon != null && window.Storage) {
      await Storage.addPoint({
        t: snap.t,
        lat: snap.lat,
        lon: snap.lon,
        sog: snap.sog,
        cog: snap.cog,
        heading: snap.heading,
        heel: snap.heel,
        acc: snap.acc,
      });
    }

    if (window.Uploader) {
      const q = Uploader.status();
      if (q.error) {
        UI.setStatus(`erro upload (${q.queued} na fila)`, 'error');
      } else if (q.queued > 0) {
        UI.setStatus(`fila: ${q.queued}`, 'warn');
      } else {
        UI.setStatus('online', 'ok');
      }
    }
  }

  // Menu wiring
  const menu = document.getElementById('menu');
  document.getElementById('menu-btn').addEventListener('click', () => menu.showModal());
  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'close') {
      menu.close();
    } else if (action === 'zero-heel') {
      const ok = Sensors.zeroHeel();
      UI.setStatus(ok ? 'heel zerado' : 'sem leitura pra zerar', ok ? 'ok' : 'warn');
      menu.close();
    } else if (action === 'export-gpx') {
      menu.close();
      if (window.GPX && typeof GPX.download === 'function') {
        await GPX.download(sailNumber);
      } else {
        UI.setStatus('gpx indisponível', 'warn');
      }
    } else if (action === 'stop') {
      if (confirm('Parar regata e limpar fila local?')) {
        if (window.Storage && Storage.clearAll) await Storage.clearAll();
        localStorage.removeItem('pampero.sail');
        location.replace('setup.html');
      } else {
        menu.close();
      }
    }
  });

  init();
})();
