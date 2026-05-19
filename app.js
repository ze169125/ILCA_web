/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * app.js — orchestration: init, wake lock, 2Hz render + 1Hz storage tick.
 *
 * Uploader is currently *not started* — there's no backend. Data lives in
 * IndexedDB and is shared via menu → Compartilhar GPX / CSV. To revive the
 * upload pipeline, set up a /api/track endpoint and call Uploader.start(sn).
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

    if (window.Storage && typeof Storage.init === 'function') {
      await Storage.init();
    }

    UI.setStatus('pronto', 'ok');
    setInterval(renderTick, 500);
    setInterval(slowTick, 1000);
  }

  function renderTick() {
    UI.render(Sensors.read());
  }

  async function slowTick() {
    const snap = Sensors.read();
    if (snap.lat != null && snap.lon != null && window.Storage) {
      await Storage.addPoint({
        t: snap.t,
        sail_number: sailNumber,
        lat: snap.lat,
        lon: snap.lon,
        sog: snap.sog,
        cog: snap.cog,
        heading: snap.heading,
        heel: snap.heel,
        acc: snap.acc,
      });
    }
    if (window.Storage && typeof Storage.pendingCount === 'function') {
      const n = await Storage.pendingCount();
      UI.setStatus(`gravando · ${n} pts · ${snap.sampleHz}Hz`, 'ok');
    }
  }

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
    } else if (action === 'share-gpx') {
      menu.close();
      if (window.GPX && typeof GPX.share === 'function') {
        await GPX.share(sailNumber);
      } else {
        UI.setStatus('gpx indisponível', 'warn');
      }
    } else if (action === 'share-csv') {
      menu.close();
      if (window.CSV && typeof CSV.share === 'function') {
        await CSV.share(sailNumber);
      } else {
        UI.setStatus('csv indisponível', 'warn');
      }
    } else if (action === 'stop') {
      if (confirm('Parar regata e limpar dados locais?')) {
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
