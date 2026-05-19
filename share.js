/* Copyright (c) 2026 PopSolutions Cooperativa
 * SPDX-License-Identifier: CHARRUA-1.2
 * Licença CHARRUA v1.2 — ver LICENSE ou https://gitlab.fing.edu.uy/charrua/licencia
 *
 * share.js — Web Share API with download fallback.
 *
 * Opens the OS share sheet (Email, AirDrop, WhatsApp, Files, etc) when
 * supported; otherwise triggers a regular download.
 */
(function () {
  'use strict';

  async function shareOrDownload(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        console.warn('[share] failed, falling back to download', err);
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  }

  function nameForExport(sailNumber, ext, when) {
    const d = when instanceof Date ? when : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`;
    const safe = String(sailNumber || 'sem-numero').replace(/[^A-Za-z0-9_-]/g, '-');
    return `${safe}-${stamp}.${ext}`;
  }

  window.Share = { shareOrDownload, nameForExport };
})();
