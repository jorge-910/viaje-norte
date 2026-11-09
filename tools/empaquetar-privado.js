#!/usr/bin/env node
/* Genera viaje-privado.json (datos personales + PDF en base64) para importarlo en el móvil.
   Uso: node tools/empaquetar-privado.js
   Lee privado/datos.json y los PDF que cita. El resultado NO se sube al repositorio (.gitignore). */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'privado', 'datos.json');
const out = path.join(root, 'viaje-privado.json');

const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const paths = new Set();
Object.values(data.alojamientos || {}).forEach(a => a.pdf && paths.add(a.pdf));
Object.values(data.billetes || {}).forEach(b => b.pdf && paths.add(b.pdf));

data.pdfs = {};
for (const p of paths) {
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { console.warn('Falta el PDF:', p); continue; }
  data.pdfs[p] = fs.readFileSync(f).toString('base64');
}
data.generado = new Date().toISOString();
fs.writeFileSync(out, JSON.stringify(data));
const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log(`viaje-privado.json: ${Object.keys(data.pdfs).length} PDF, ${mb} MB`);
