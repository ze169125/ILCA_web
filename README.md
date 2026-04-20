# ILCA_web — Pampero PWA

Progressive Web App para tracking ao vivo de veleiros de classe one-design
(ABCL Lightning, ILCA/Laser).  Bússola + inclinômetro + velocidade, grava
offline em IndexedDB, upload em batch de 5 s para o servidor, export GPX
com extensões `pampero:` ao final.

Servida em produção: https://pampero.pop.coop/app/setup.html

## Stack
Vanilla JS + HTML + CSS — **sem framework, sem bundler, sem build**.
Dexie em `vendor/` para IndexedDB.  Service Worker à mão.

## Layout
```
index.html     tela principal (compass + heel + SOG)
setup.html     primeira execução: pede número de vela
app.js         orquestração (init, 1 Hz tick, wake lock, menu)
sensors.js     bússola (iOS webkitCompassHeading, Android absolute, GPS fallback)
               + heel com EMA α=0.1 + GPS watchPosition
storage.js     Dexie — tabela points
uploader.js    batch POST com backoff exponencial 5→10→20→60s
gpx.js         export GPX com extensões pampero:
ui.js          canvas render (compass + heel) + DOM
style.css      dark, alto contraste, Wiphala accents
sw.js          Service Worker cache-first
manifest.webmanifest
vendor/dexie.min.js
icons/icon-{192,512}.png
```

## Servir estático
```sh
python3 -m http.server 8000
```
HTTPS é obrigatório em celular real (sensores de orientação exigem).

## Endpoint de backend esperado
`POST /api/track` com `{sail_number, points:[{t,lat,lon,sog,cog,heading,heel,acc}]}`.
Veja `ILCA_SERVER` para a implementação.
