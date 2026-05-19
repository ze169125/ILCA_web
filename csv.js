/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * csv.js — build + share CSV from the local IndexedDB store.
 */
(function () {
  'use strict';

  const FIELDS = ['t', 'sail_number', 'lat', 'lon', 'sog', 'cog', 'heading', 'heel', 'acc'];

  function csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCsv(points, defaultSailNumber) {
    const lines = [FIELDS.join(',')];
    for (const p of points) {
      const row = FIELDS.map(f => {
        if (f === 'sail_number') return csvEscape(p.sail_number || defaultSailNumber);
        return csvEscape(p[f]);
      });
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  async function share(sailNumber) {
    if (!window.Storage) return;
    const points = await Storage.allPoints();
    const text = buildCsv(points, sailNumber);
    const blob = new Blob([text], { type: 'text/csv' });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    await Share.shareOrDownload(blob, `pampero-${sailNumber}-${stamp}.csv`);
  }

  window.CSV = { buildCsv, share };
})();
