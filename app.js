/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * app.js — orchestration: init, wake lock, 2Hz render + 1Hz storage tick.
 *
 * Recording is gated by localStorage 'pampero.recording'. The race start time
 * is captured in 'pampero.raceStart' on first Comecar press, used for the
 * export filename. Uploader is intentionally not started — no backend; data
 * lives in IndexedDB and is shared via menu → Compartilhar GPX/CSV.
 */
(function () {
  'use strict';

  const RECORDING_KEY = 'pampero.recording';
  const RACE_START_KEY = 'pampero.raceStart';
  const HEADING_SOURCE_KEY = 'pampero.headingSource';

  function getHeadingSource() {
    return localStorage.getItem(HEADING_SOURCE_KEY) === 'gps' ? 'gps' : 'auto';
  }
  function setHeadingSource(v) {
    if (v === 'gps') localStorage.setItem(HEADING_SOURCE_KEY, 'gps');
    else localStorage.removeItem(HEADING_SOURCE_KEY);
    refreshHeadingSourceLabel();
  }
  function refreshHeadingSourceLabel() {
    const el = document.getElementById('heading-source-label');
    if (el) el.textContent = getHeadingSource() === 'gps' ? 'GPS' : 'Bússola';
  }

  const sailNumber = (localStorage.getItem('pampero.sail') || '').toUpperCase();
  if (!sailNumber) {
    location.replace('setup.html');
    return;
  }
  UI.setSailBadge(sailNumber);

  function isRecording() {
    return localStorage.getItem(RECORDING_KEY) === '1';
  }
  function startRecording() {
    if (!localStorage.getItem(RACE_START_KEY)) {
      localStorage.setItem(RACE_START_KEY, new Date().toISOString());
    }
    localStorage.setItem(RECORDING_KEY, '1');
  }
  function stopRecording() {
    localStorage.removeItem(RECORDING_KEY);
  }

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

    refreshHeadingSourceLabel();
    UI.setStatus('pronto', 'ok');
    setInterval(renderTick, 500);
    setInterval(slowTick, 1000);
  }

  function renderTick() {
    UI.render(Sensors.read());
  }

  async function slowTick() {
    const snap = Sensors.read();
    const rec = isRecording();

    if (rec && snap.lat != null && snap.lon != null && window.Storage) {
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
      const mark = rec ? '●' : '○';
      const label = rec ? 'gravando' : 'parado';
      UI.setStatus(`${mark} ${label} · ${n} pts · ${snap.sampleHz}Hz`, rec ? 'ok' : 'warn');
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
    } else if (action === 'start-race') {
      startRecording();
      UI.setStatus('regata iniciada', 'ok');
      menu.close();
    } else if (action === 'stop-race') {
      stopRecording();
      UI.setStatus('regata parada (dados mantidos)', 'warn');
      menu.close();
    } else if (action === 'zero-heel') {
      const ok = Sensors.zeroHeel();
      UI.setStatus(ok ? 'heel zerado' : 'sem leitura pra zerar', ok ? 'ok' : 'warn');
      menu.close();
    } else if (action === 'toggle-heading-source') {
      const next = getHeadingSource() === 'gps' ? 'auto' : 'gps';
      setHeadingSource(next);
      UI.setStatus(`fonte: ${next === 'gps' ? 'GPS' : 'Bússola'}`, 'ok');
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
    } else if (action === 'clear-data') {
      if (confirm('Apagar todos os dados locais e o número do barco?')) {
        if (window.Storage && Storage.clearAll) await Storage.clearAll();
        stopRecording();
        localStorage.removeItem(RACE_START_KEY);
        localStorage.removeItem('pampero.sail');
        location.replace('setup.html');
      } else {
        menu.close();
      }
    }
  });

  init();
})();
