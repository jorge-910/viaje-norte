'use strict';

/* ---------- Estado ---------- */
const STORE_KEY = 'rutaNorte.state';
const TAB_KEY = 'rutaNorte.tab';

/* Datos privados (se rellenan al importar el JSON privado; viven solo en el dispositivo). */
let PRIVATE = null;          // JSON privado sin los archivos
const FILE_URLS = {};        // ruta (PDF o QR) → blob: URL
const PUBLIC_STAYS = JSON.parse(JSON.stringify(STAYS));
const PUBLIC_TRIPS = JSON.parse(JSON.stringify(TRIPS));

const TYPES = {
  train: 'Tren', bus: 'Bus', flight: 'Vuelo', checkin: 'Check-in', checkout: 'Check-out',
  visit: 'Visita', meal: 'Comida', work: 'Trabajo', daily: 'Daily', note: 'Nota',
};

function seedState() {
  const s = {
    seed: SEED_VERSION,
    events: SEED_EVENTS.map(e => ({ ...e, done: false })),
    tasks: SEED_TASKS.map(t => ({ ...t, done: false })),
    updated: new Date().toISOString(),
  };
  if (PRIVATE) mergePrivateIntoState(s, PRIVATE);
  return s;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.events) && Array.isArray(s.tasks)) {
        if (s.seed === SEED_VERSION) return s;
        // Itinerario nuevo: se rehace desde la semilla, conservando lo marcado como hecho
        // y los eventos que añadiste tú.
        const fresh = seedState();
        const done = new Set(s.events.filter(e => e.done).map(e => e.id));
        fresh.events.forEach(e => { if (done.has(e.id)) e.done = true; });
        s.events.filter(e => /^u/.test(e.id) && e.day >= TRIP.start && e.day <= TRIP.end).forEach(e => fresh.events.push(e));
        fresh.doneTasks = s.tasks.filter(t => t.done).map(t => t.id);
        fresh.migrated = true;
        return fresh;
      }
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return seedState();
}
let state = loadState();
if (state.migrated) {
  delete state.migrated;
  setTimeout(() => { save(); toast('Itinerario actualizado con los últimos cambios del viaje.'); }, 0);
}
function save() {
  state.updated = new Date().toISOString();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('No se ha podido guardar en este navegador.'); }
}

/* Reloj. ?now=2026-11-21T12:00 simula otra fecha para probar. */
const clockOffset = (() => {
  const p = new URLSearchParams(location.search).get('now');
  if (!p) return 0;
  const d = new Date(p);
  return isNaN(d) ? 0 : d - new Date();
})();
const now = () => new Date(Date.now() + clockOffset);
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const evDate = (e, which = 'start') => {
  const t = which === 'end' && e.end ? e.end : e.start;
  const d = new Date(`${e.day}T${t}:00`);
  if (which === 'end' && e.end && toMin(e.end) < toMin(e.start)) d.setDate(d.getDate() + 1);
  return d;
};

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sorted = list => [...list].sort((a, b) => a.day.localeCompare(b.day) || toMin(a.start) - toMin(b.start));
const eventsOf = day => sorted(state.events.filter(e => e.day === day));
const mapsUrl = (q, lat, lng) => lat != null
  ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const pin = '<svg class="pin" viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>';

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}

/* ---------- Datos privados: solo en este dispositivo (IndexedDB) ----------
   Los PDF y los QR se guardan como bytes (ArrayBuffer), no como Blob: Safari en iOS
   pierde a veces los Blob guardados en IndexedDB. El Blob se crea al cargar. */

function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('ruta-norte-privado', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (db.objectStoreNames.contains('pdfs')) db.deleteObjectStore('pdfs');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idbTx(store, mode, fn) {
  const db = await idb();
  return new Promise((ok, ko) => {
    const tx = db.transaction(store, mode);
    const res = fn(tx.objectStore(store));
    tx.oncomplete = () => ok(res && 'result' in res ? res.result : res);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error('abort'));
  });
}
function applyPrivate(p) {
  // Vuelve a la base pública y mezcla encima los datos privados.
  Object.keys(STAYS).forEach(k => { STAYS[k] = { ...PUBLIC_STAYS[k], ...((p && p.alojamientos && p.alojamientos[k]) || {}) }; });
  Object.keys(TRIPS).forEach(k => { TRIPS[k] = { ...PUBLIC_TRIPS[k], ...((p && p.billetes && p.billetes[k]) || {}) }; });
  PRIVATE = p;
}
function mergePrivateIntoState(st, p) {
  st.privMerged = true;
  const ids = new Set(st.events.map(e => e.id));
  (p.eventos || []).forEach(e => { if (!ids.has(e.id)) st.events.push({ ...e, done: false }); });
  const tids = new Set(st.tasks.map(t => t.id));
  (p.tareas || []).forEach(t => { if (!tids.has(t.id)) st.tasks.push({ ...t, done: false }); });
  // Títulos con nombre del alojamiento, solo si sigues con el título genérico.
  const gen = p.titulos_genericos || {};
  st.events.forEach(e => { if (p.titulos && p.titulos[e.id] && (!gen[e.id] || e.title === gen[e.id])) e.title = p.titulos[e.id]; });
}
function clearFileUrls() {
  Object.values(FILE_URLS).forEach(u => URL.revokeObjectURL(u));
  Object.keys(FILE_URLS).forEach(k => delete FILE_URLS[k]);
}
async function loadPrivate() {
  try {
    const p = await idbTx('kv', 'readonly', s => s.get('bundle'));
    if (!p) return false;
    const keys = await idbTx('files', 'readonly', s => s.getAllKeys());
    const vals = await idbTx('files', 'readonly', s => s.getAll());
    clearFileUrls();
    keys.forEach((k, i) => {
      const v = vals[i];
      if (v && v.bytes) FILE_URLS[k] = URL.createObjectURL(new Blob([v.bytes], { type: v.type }));
    });
    applyPrivate(p);
    return true;
  } catch (e) { return false; }
}
function b64ToBytes(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
function stripPrivate(st, priv) {
  if (!priv) return;
  const ev = new Set((priv.eventos || []).map(e => e.id)), tk = new Set((priv.tareas || []).map(t => t.id));
  st.events = st.events.filter(e => !ev.has(e.id));
  st.tasks = st.tasks.filter(t => !tk.has(t.id));
  const gen = priv.titulos_genericos || {};
  st.events.forEach(e => { if (gen[e.id] && priv.titulos && e.title === priv.titulos[e.id]) e.title = gen[e.id]; });
  st.privMerged = false;
}
const typeOf = path => /\.png$/i.test(path) ? 'image/png' : /\.jpe?g$/i.test(path) ? 'image/jpeg' : 'application/pdf';
async function importPrivate(p) {
  // Formato nuevo: files {ruta: {type, b64}}. El antiguo traía pdfs {ruta: b64}.
  const files = {};
  Object.entries(p.pdfs || {}).forEach(([k, b64]) => { files[k] = { type: typeOf(k), b64 }; });
  Object.assign(files, p.files || {});
  const bundle = { ...p }; delete bundle.pdfs; delete bundle.files;
  const entries = Object.entries(files).map(([k, f]) => [k, { type: f.type || typeOf(k), bytes: b64ToBytes(f.b64) }]);
  await idbTx('files', 'readwrite', s => { s.clear(); entries.forEach(([k, v]) => s.put(v, k)); });
  await idbTx('kv', 'readwrite', s => s.put(bundle, 'bundle'));
  // Sustituye los datos privados anteriores por los nuevos, conservando lo marcado como hecho.
  const doneEv = new Set(state.events.filter(e => e.done).map(e => e.id));
  const doneTk = new Set(state.tasks.filter(t => t.done).map(t => t.id).concat(state.doneTasks || []));
  stripPrivate(state, PRIVATE);
  if (!(await loadPrivate())) throw new Error('lectura');
  mergePrivateIntoState(state, PRIVATE);
  state.events.forEach(e => { if (doneEv.has(e.id)) e.done = true; });
  state.tasks.forEach(t => { if (doneTk.has(t.id)) t.done = true; });
  delete state.doneTasks;
  save(); reanalyze(); render();
  const pdfOk = Object.keys(FILE_URLS).filter(k => typeOf(k) === 'application/pdf').length;
  const pdfAll = entries.filter(([, v]) => v.type === 'application/pdf').length;
  const qr = Object.keys(FILE_URLS).length - pdfOk;
  toast(`Datos privados guardados en este dispositivo: ${pdfOk} de ${pdfAll} PDF${qr ? ` y ${qr} QR` : ''}.`);
}
async function forgetPrivate() {
  await idbTx('files', 'readwrite', s => s.clear());
  await idbTx('kv', 'readwrite', s => s.clear());
  clearFileUrls();
  stripPrivate(state, PRIVATE);
  applyPrivate(null);
  save(); reanalyze(); render(); toast('Datos privados borrados de este dispositivo.');
}

/* Visor de PDF dentro de la app. En la app instalada del iPhone un enlace blob: en otra
   pestaña no abre nada, así que el PDF se pinta aquí con pdf.js (incluido en vendor/). */
function pdfLink(path, label, cls = 'btn btn--gray', title = label) {
  const ok = path && FILE_URLS[path];
  return ok ? `<button class="${cls}" data-pdf="${esc(path)}" data-title="${esc(title)}">${label}</button>`
    : `<button class="${cls}" disabled>${label} (${path ? 'no importado' : 'pendiente'})</button>`;
}
let pdfjsReady = null;
function loadPdfjs() {
  if (!pdfjsReady) pdfjsReady = new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/pdfjs/pdf.min.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = () => { pdfjsReady = null; ko(new Error('pdfjs')); };
    document.head.appendChild(sc);
  });
  return pdfjsReady;
}
let viewerToken = 0;
async function openPdf(path, title) {
  const url = FILE_URLS[path];
  if (!url) return;
  const v = $('#viewer');
  const token = ++viewerToken;
  v.innerHTML = `<header class="viewer-bar glass">
      <button class="btn btn--plain" data-viewer="close">Cerrar</button>
      <span class="viewer-title">${esc(title || 'PDF')}</span>
      <button class="btn btn--plain" data-viewer="share">Compartir</button>
    </header>
    <div class="viewer-pages" id="viewerPages"><p class="empty">Abriendo…</p></div>`;
  v.dataset.path = path; v.dataset.title = title || 'documento';
  v.hidden = false; document.body.classList.add('no-scroll');
  try {
    const lib = await loadPdfjs();
    const bytes = await (await fetch(url)).arrayBuffer();
    const doc = await lib.getDocument({ data: bytes }).promise;
    const box = $('#viewerPages');
    if (token !== viewerToken) return;
    box.innerHTML = '';
    const width = box.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (token !== viewerToken) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.className = 'viewer-page';
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    if (token !== viewerToken) return;
    // Sin pdf.js (p. ej. sin conexión la primera vez): el visor del sistema dentro de la app.
    $('#viewerPages').innerHTML = `<iframe class="viewer-frame" src="${url}" title="${esc(title || 'PDF')}"></iframe>`;
  }
}
function closePdf() {
  viewerToken++;
  const v = $('#viewer'); v.hidden = true; v.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
async function sharePdf() {
  const v = $('#viewer'); const url = FILE_URLS[v.dataset.path];
  if (!url) return;
  const blob = await (await fetch(url)).blob();
  const name = v.dataset.title.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') + '.pdf';
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { /* cancelado */ }
  } else {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
}
const privateCTA = () => PRIVATE ? '' : `<div class="card"><p style="margin:0 0 10px">Los localizadores, los PDF y los alojamientos no están en la web. Importa tu archivo <b>viaje-privado.json</b>: se guarda solo en este dispositivo.</p>
  <button class="btn btn--block" data-act="import">Importar datos privados</button></div>`;

function countdownParts(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
function countdownHTML(ms) {
  const p = countdownParts(ms);
  const pad = n => String(n).padStart(2, '0');
  if (p.d > 0) return `${p.d}<small>d</small>${pad(p.h)}<small>h</small>${pad(p.m)}<small>m</small>`;
  return `${pad(p.h)}<small>h</small>${pad(p.m)}<small>m</small>${pad(p.s)}<small>s</small>`;
}
function relText(ms) {
  const p = countdownParts(Math.abs(ms));
  const txt = p.d ? `${p.d} d ${p.h} h` : p.h ? `${p.h} h ${p.m} min` : `${p.m} min`;
  return ms >= 0 ? `en ${txt}` : `hace ${txt}`;
}

function dayRoute(day) {
  const tr = eventsOf(day).filter(isTransport).map(tripOf);
  if (tr.length) {
    const short = s => s.replace(/ \(.*\)$/, '').replace(/ Miraflores| Delicias| Concordia| Intermodal| Nord/, '');
    return [short(tr[0].from), ...tr.map(t => short(t.to))].join(' → ');
  }
  const st = Object.values(STAYS).find(s => s.checkinDay < day && s.checkoutDay > day);
  return st ? CITIES[st.city].name : '';
}
function cityOfDay(day) {
  // Día de viaje: hasta que sale el primer transporte sigues en la ciudad de la noche anterior.
  const n = now();
  const firstLeg = eventsOf(day).find(isTransport);
  const leaving = Object.values(STAYS).find(s => s.checkoutDay === day);
  if (day === isoDay(n) && firstLeg && leaving && evDate(firstLeg) > n) return leaving.city;
  const st = Object.values(STAYS).find(s => s.checkinDay <= day && s.checkoutDay > day);
  if (st) return st.city;
  const last = Object.values(STAYS).find(s => s.checkoutDay === day);
  return last ? last.city : 'donostia';
}
function windowText(s) { return !s.checkinFrom ? 'horario pendiente' : s.checkinTo === '23:59' ? `desde ${s.checkinFrom}` : `${s.checkinFrom}–${s.checkinTo}`; }
function checkinWindow(s) { return s.checkinFrom ? `Check-in ${windowText(s)}` : 'Horario de entrada pendiente de confirmar'; }
const marginVal = v => v == null ? '—' : fmtDur(v);
function evSub(e) {
  const parts = [];
  if (isTransport(e)) {
    const t = tripOf(e);
    parts.push(`${t.from} → ${t.to}`);
    if (e.end) parts.push(`llega ${e.end}`);
  } else if (e.stay && STAYS[e.stay]) {
    const s = STAYS[e.stay];
    parts.push(e.type === 'checkin' ? checkinWindow(s) : `Límite ${s.checkoutBy}`);
  } else if (e.end) {
    parts.push(`hasta ${e.end}`);
  }
  if (e.note) parts.push(e.note);
  return parts.join(' · ');
}

/* ---------- Análisis compartido ---------- */
let analysis = {};
function reanalyze() { analysis = analyzeAll(state.events, STAYS); }
function flagged(id) {
  for (const day in analysis) {
    for (const i of analysis[day].issues) if (i.ids.includes(id)) return i.sev;
  }
  return null;
}
function allIssues() { return Object.values(analysis).flatMap(a => a.issues); }

/* ---------- Componentes ---------- */
function eventRow(e, { showCheck = true } = {}) {
  const n = now();
  const past = evDate(e, 'end') < n;
  const f = flagged(e.id);
  const minor = ['work', 'note'].includes(e.type);
  const cls = ['ev', 'k-' + e.type, e.done && 'done', past && 'past', f === 'bad' && 'flag', f === 'warn' && 'flag-warn', minor && 'minor'].filter(Boolean).join(' ');
  return `<li class="${cls}" data-ev="${e.id}">
    <div class="ev-time">${esc(e.start)}${e.end ? `<small>${esc(e.end)}</small>` : ''}</div>
    <div class="ev-rail"><i></i></div>
    <div class="ev-body">
      <div class="ev-type">${TYPES[e.type] || e.type}</div>
      <div class="ev-title">${esc(e.title)}</div>
      ${evSub(e) ? `<div class="ev-sub">${esc(evSub(e))}</div>` : ''}
    </div>
    ${showCheck ? `<button class="check" data-done="${e.id}" aria-pressed="${!!e.done}" aria-label="Marcar como hecho"><span></span></button>` : '<span></span>'}
  </li>`;
}
function timelineHTML(day, withNow) {
  const evs = eventsOf(day);
  if (!evs.length) return '<p class="empty">Sin eventos.</p>';
  const n = now();
  let html = '<ul class="timeline">';
  let nowPlaced = !withNow;
  evs.forEach(e => {
    if (!nowPlaced && evDate(e) > n) {
      html += `<li class="now-line">ahora ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}</li>`;
      nowPlaced = true;
    }
    html += eventRow(e);
  });
  return html + '</ul>';
}
function marginsHTML(day) {
  const a = analysis[day];
  if (!a || !a.margins.length) return '';
  return `<div class="margins">${a.margins.map(m => `
    <div class="margin sev-${m.sev}"><b>${esc(m.label)}</b><span class="val">${marginVal(m.value)}</span><span class="det">${esc(m.detail)}</span></div>`).join('')}</div>`;
}
function issuesHTML(issues, withDay) {
  return issues.map(i => `<div class="issue sev-${i.sev}" ${withDay ? `data-goday="${i.day}"` : ''}>
    <span class="dot"></span><div><p>${esc(i.text)}</p>${withDay ? `<small>${fmtDay(i.day)}</small>` : ''}</div></div>`).join('');
}

/* ---------- Pantalla: Hoy ---------- */
function renderHoy() {
  const n = now();
  const today = isoDay(n);
  const inTrip = today >= TRIP.start && today <= TRIP.end;
  const day = inTrip ? today : (today < TRIP.start ? TRIP.start : TRIP.end);
  const all = sorted(state.events);
  const current = all.find(e => !e.done && e.end && evDate(e) <= n && evDate(e, 'end') > n && isTransport(e));
  const next = all.find(e => !e.done && evDate(e) > n && !['work', 'note'].includes(e.type));

  let html = '';
  if (current) {
    const total = evDate(current, 'end') - evDate(current);
    const pct = Math.min(100, Math.max(0, (n - evDate(current)) / total * 100));
    html += `<div class="hero k-${current.type}" data-ev="${current.id}">
      <div class="hero-label">En curso · ${TYPES[current.type]}</div>
      <div class="hero-title">${esc(current.title)}</div>
      <div class="hero-meta">${esc(evSub(current))}</div>
      <div class="countdown" data-cd="${evDate(current, 'end').getTime()}">${countdownHTML(evDate(current, 'end') - n)}</div>
      <div class="hero-meta">para llegar</div>
      <div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      ${passBtn(current)}
    </div>`;
  }
  if (next) {
    const leave = leaveInfo(next);
    html += `<div class="hero" data-ev="${next.id}">
      <div class="hero-label">${current ? 'Después' : 'Siguiente'} · ${TYPES[next.type]} · ${fmtDay(next.day)}</div>
      <div class="hero-title">${esc(next.title)}</div>
      <div class="hero-meta">${esc(next.start)}${evSub(next) ? ' · ' + esc(evSub(next)) : ''}</div>
      <div class="countdown" data-cd="${evDate(next).getTime()}">${countdownHTML(evDate(next) - n)}</div>
      ${leave ? `<div class="hero-leave">${leave}</div>` : ''}
      ${passBtn(next)}
    </div>`;
  } else if (!current) {
    html += `<div class="hero"><div class="hero-label">Viaje terminado</div><div class="hero-title">No quedan eventos pendientes.</div></div>`;
  }

  if (!PRIVATE) html += privateCTA();
  else if (!inTrip && today < TRIP.start) {
    const pend = state.tasks.filter(t => !t.done).length;
    html += `<div class="card row" data-go="avisos"><span class="dot sev-warn"></span><div class="spacer">${pend} pendientes antes del viaje</div><span class="muted small">Ver avisos ›</span></div>`;
  }

  const a = analysis[day];
  html += `<h2>${inTrip ? 'Hoy' : today < TRIP.start ? 'Primer día' : 'Último día'} · ${fmtDayLong(day)}</h2>`;
  html += `<div class="muted small" style="margin:-4px 0 8px">${esc(dayRoute(day))}</div>`;
  if (a && a.issues.length) html += issuesHTML(a.issues);
  html += marginsHTML(day);
  html += `<div style="margin-top:10px">${timelineHTML(day, inTrip)}</div>`;
  return html;
}
const passBtn = e => isTransport(e) && e.trip ? `<button class="btn btn--glass hero-pass" data-pass="${e.id}">${ICON.ticket}Billete</button>` : '';
function leaveInfo(e) {
  if (!isTransport(e)) return '';
  const co = state.events.find(x => x.day === e.day && x.type === 'checkout' && toMin(x.start) <= toMin(e.start));
  const t = tripOf(e);
  const access = co && STAYS[co.stay] ? STAYS[co.stay].access : null;
  const be = BOARD_BUFFER[e.type];
  const parts = [`Estar en ${esc(t.from)} a las <b>${fromMin(toMin(e.start) - be)}</b>`];
  if (access) parts.push(`salir del alojamiento a las <b>${fromMin(toMin(e.start) - be - access)}</b>`);
  return parts.join(' · ') + (t.ref ? `<div class="muted small" style="margin-top:4px">${esc(t.ref)} · ${esc(t.seat || '')}</div>` : '');
}

/* ---------- Pantalla: Plan (itinerario editable) ---------- */
let openDays = null;
function renderPlan() {
  const today = isoDay(now());
  if (!openDays) openDays = new Set([today >= TRIP.start && today <= TRIP.end ? today : TRIP.start]);
  let html = `<div class="toolbar">
    <button class="btn btn--gray btn--sm" data-act="export">Exportar</button>
    <button class="btn btn--gray btn--sm" data-act="import">Importar</button>
    <button class="btn btn--gray btn--sm" data-act="reset">Restaurar</button>
  </div>`;
  tripDays().forEach(day => {
    const a = analysis[day];
    const sev = a.worst;
    const nIss = a.issues.length;
    html += `<details class="day" data-day="${day}" ${openDays.has(day) ? 'open' : ''}>
      <summary>
        <div class="spacer"><div class="day-name">${fmtDayLong(day)}${day === today ? ' · hoy' : ''}</div><div class="day-route">${esc(dayRoute(day))}</div></div>
        ${nIss ? `<span class="chip sev-${sev}"><span class="dot"></span>${nIss}</span>` : `<span class="dot sev-ok"></span>`}
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </summary>
      <div class="day-inner">
        ${issuesHTML(a.issues)}
        ${marginsHTML(day)}
        <div style="margin-top:8px">${timelineHTML(day, day === today)}</div>
        <button class="btn btn--gray btn--block" data-add="${day}" style="margin-top:8px">+ Añadir evento</button>
      </div>
    </details>`;
  });
  html += `<p class="note">Los cambios se guardan en este móvil. Exporta el JSON de vez en cuando como copia de seguridad.</p>`;
  return html;
}

/* ---------- Pantalla: Ciudad ---------- */
let currentCity = null;
function renderCiudad() {
  if (!currentCity) currentCity = cityOfDay(isoDay(now()) < TRIP.start ? TRIP.start : isoDay(now()));
  const c = CITIES[currentCity];
  const stayIds = [].concat(c.stay || []);
  const chips = Object.entries(CITIES).map(([k, v]) =>
    `<button data-city="${k}" aria-pressed="${k === currentCity}">${esc(v.name.split('-')[0].replace('València', 'Valencia'))}</button>`).join('');
  const linkList = (items, city) => `<ul class="plain-list link-list">${items.map(it =>
    `<li>${pin}<a href="${mapsUrl(it.replace(/\(.*?\)/g, '') + ', ' + city)}" target="_blank" rel="noopener">${esc(it)}</a></li>`).join('')}</ul>`;
  return `<div class="chips">${chips}</div>
    <div class="city-name">${esc(c.name)}</div>
    <div class="muted small">${esc(c.days)}</div>
    ${stayIds.length ? `<h2>${stayIds.length > 1 ? 'Alojamientos' : 'Alojamiento'}</h2>` : ''}
    ${stayIds.map(id => STAYS[id]).filter(Boolean).map(st => `
    <div class="card">
      <div style="font-weight:600">${esc(stayName(st))}</div>
      ${st.address ? `<div class="muted small">${esc(st.address)}</div>` : ''}
      <dl class="kv">
        <dt>Check-in</dt><dd>${fmtDay(st.checkinDay)}, ${windowText(st)}</dd>
        <dt>Check-out</dt><dd>${fmtDay(st.checkoutDay)}, hasta ${st.checkoutBy}</dd>
        ${st.phone ? `<dt>Teléfono</dt><dd><a href="tel:${st.phone.replace(/\s/g, '')}">${esc(st.phone)}</a></dd>` : ''}
        ${st.price ? `<dt>Precio</dt><dd>${esc(st.price)}</dd>` : ''}
      </dl>
      ${st.notes ? `<p class="small muted" style="margin:0 0 12px">${esc(st.notes)}</p>` : ''}
      ${st.address ? `<div class="btn-row">
        <a class="btn" href="${mapsUrl(st.name + ', ' + st.address, st.lat, st.lng)}" target="_blank" rel="noopener">Abrir en Maps</a>
        ${pdfLink(st.pdf, 'Reserva PDF', 'btn btn--gray', stayName(st))}
      </div>` : `<p class="small muted" style="margin:0">Importa tus datos privados para ver la dirección, el teléfono y la reserva.</p>`}
    </div>`).join('')}
    <h2>Qué ver <span class="tag-ori">orientativo</span></h2>
    <div class="card">${linkList(c.see, c.name)}</div>
    <h2>Comer barato <span class="tag-ori">orientativo</span></h2>
    <div class="card">${linkList(c.eat, c.name)}</div>
    <h2>Historia</h2>
    <div class="card"><ul class="plain-list prose">${c.history.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>
    <h2>Curiosidades</h2>
    <div class="card"><ul class="plain-list prose">${c.facts.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>
    <p class="note">Horarios de apertura y precios sin comprobar: míralos antes de ir.</p>`;
}

/* ---------- Pantalla: Trayectos ---------- */
function renderTrayectos() {
  const n = now();
  const legs = sorted(state.events.filter(isTransport));
  if (!legs.length) return '<p class="empty">No hay trayectos.</p>';
  return legs.map(e => {
    const t = tripOf(e);
    const dur = endMin(e) - toMin(e.start);
    const dep = evDate(e);
    const hls = (t.highlights || []).filter(h => h.at <= dur).map(h => {
      const when = new Date(dep.getTime() + h.at * 60000);
      return `<li class="${when < n ? 'passed' : ''}"><time>${fromMin(toMin(e.start) + h.at)}</time><span>${esc(h.text)}</span></li>`;
    }).join('');
    return `<div class="card k-${e.type}" id="leg-${e.id}">
      <div class="row"><span class="ev-type">${TYPES[e.type]} · ${fmtDay(e.day)}</span><span class="spacer"></span>${e.done ? '<span class="chip sev-ok">hecho</span>' : ''}</div>
      <div class="leg-head" style="margin-top:6px"><span class="leg-times">${esc(e.start)} – ${esc(e.end)}</span><span class="leg-dur">${fmtDur(dur)}</span></div>
      <div class="leg-route">${esc(t.from)} → ${esc(t.to)}</div>
      <div class="muted small">${esc(t.service || '')}${t.depPlace ? ` · Sale de ${esc(t.depPlace)}` : ''}${t.arrPlace ? ` · Llega a ${esc(t.arrPlace)}` : ''}</div>
      ${t.route ? `<p class="small" style="margin:10px 0 0">${esc(t.route)}</p>` : ''}
      ${hls ? `<ul class="hl">${hls}</ul>` : ''}
    </div>`;
  }).join('') + `<p class="note">Las horas de los paisajes son aproximadas y se calculan a partir de la hora de salida. En noviembre anochece hacia las 17:45.</p>`;
}

/* ---------- Tarjeta de billete (tipo Wallet) ---------- */
const LOGOS = {
  monbus: '<img class="tk-logo" src="logos/monbus.svg" alt="Monbus">',
  alsa: '<img class="tk-logo" src="logos/alsa.svg" alt="ALSA">',
  renfe: '<span class="tk-brand"><img class="tk-logo tk-logo--mark" src="logos/renfe.svg" alt="">Renfe</span>',
  volotea: '<span class="tk-brand">Volotea</span>',
};
const ICON = {
  ticket: '<svg viewBox="0 0 24 24"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/></svg>',
  ref: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="12" rx="2.5"/><rect x="8.5" y="9" width="7" height="6" rx="1.2"/><path d="M10.5 15v1.5M13.5 15v1.5"/></svg>',
  seat: '<svg viewBox="0 0 24 24"><path d="M7 3.5c1.5 0 2 1 2.3 2.5l1.2 6.5h6a2 2 0 0 1 0 4H9.8a2 2 0 0 1-2-1.7L6.2 6.5"/><path d="M9 20.5h8"/></svg>',
  coach: '<svg viewBox="0 0 24 24"><path d="M3.5 16.5V9.5a2 2 0 0 1 2-2h8.5a6.5 6.5 0 0 1 6.5 6.5v2.5z"/><path d="M14 7.5l3.5 5h3"/></svg>',
  flight: '<svg viewBox="0 0 24 24"><path d="M10.5 13.5 4 12l-1 1.5 6 2.5 2.5 5h1.5l-.5-5.5 5.5-4.5c1.5-1.2 2-3 1-4s-2.8-.5-4 1L10.5 13.5"/></svg>',
};
const ARROW = '<svg class="tk-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17M14 5.5l6.5 6.5-6.5 6.5"/></svg>';
function tkEnd(side, stop, time) {
  return `<div class="tk-end tk-end--${side}">
      <div class="tk-place">${esc(stop.city)}<br>${esc(stop.station)}</div>
      <div class="tk-code">${esc(stop.code)}</div>
      <div class="tk-time">${esc(time)}</div>
    </div>`;
}
function tkStops(e) {
  const t = tripOf(e);
  return { t, dep: t.dep || { code: '', city: t.from, station: '' }, arr: t.arr || { code: '', city: t.to, station: '' } };
}
/* Lista de Billetes: tarjeta plegada con Tarjeta y Abrir PDF. */
function ticketCard(e) {
  const { t, dep, arr } = tkStops(e);
  const pdfBtn = PRIVATE && t.pdf ? pdfLink(t.pdf, 'Abrir PDF', 'btn tk-paper-btn', `${dep.city} → ${arr.city}`) : '';
  return `<article class="tk">
      <button class="tk-route" data-pass="${e.id}" aria-label="Ver tarjeta ${esc(dep.city)} → ${esc(arr.city)}">
        ${tkEnd('from', dep, e.start)}${ARROW}${tkEnd('to', arr, e.end)}
      </button>
      <div class="tk-actions">
        <button class="btn" data-pass="${e.id}">Tarjeta</button>
        ${pdfBtn || `<span class="tk-when">${fmtDay(e.day)}</span>`}
      </div>
    </article>`;
}
/* Tarjeta completa (tipo Wallet), en una hoja que se abre encima de la pantalla. */
function passCard(e) {
  const { t, dep, arr } = tkStops(e);
  const day = new Date(e.day + 'T12:00:00');
  const date = `${day.getDate()} ${day.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase()}`;
  const qr = PRIVATE && t.qr && FILE_URLS[t.qr];
  const third = t.mode === 'flight'
    ? { icon: ICON.flight, label: 'Vuelo', value: (t.service || '').replace(/^Volotea\s*/, '') }
    : { icon: ICON.coach, label: 'Coche', value: t.coach || '—' };
  const info = PRIVATE ? `<div class="tk-info">
      <button class="tk-cell" data-copy="${esc(t.ref || '')}" aria-label="Copiar localizador">${ICON.ref}<b>Localizador</b><span>${esc(t.ref || '—')}</span></button>
      <div class="tk-cell">${ICON.seat}<b>Asiento</b><span>${esc(t.seatNo || (t.mode === 'flight' ? 'Embarque' : '—'))}</span></div>
      <div class="tk-cell">${third.icon}<b>${third.label}</b><span>${esc(third.value)}</span></div>
    </div>` : '';
  return `<article class="tk tk--pass">
      <div class="tk-head">${LOGOS[t.operator] || `<span class="tk-brand">${esc(t.service || '')}</span>`}<span class="tk-date">${date}</span></div>
      <div class="tk-route tk-route--static">${tkEnd('from', dep, e.start)}${ARROW}${tkEnd('to', arr, e.end)}</div>
      ${qr ? `<div class="tk-qr"><img src="${qr}" alt="Código del billete"></div>` : PRIVATE ? `<p class="tk-noqr">${t.mode === 'flight' ? 'La tarjeta de embarque llega con el check-in online.' : 'Sin código: usa el PDF.'}</p>` : ''}
      ${info}
      ${PRIVATE ? '' : `<p class="tk-noqr">Importa tus datos privados para ver el código, el localizador y el asiento.</p>`}
      ${PRIVATE && t.pending ? `<p class="tk-cond sev-warn">Datos del billete pendientes: falta el PDF.</p>` : ''}
      <p class="tk-cond">${esc(t.service || '')}${t.ticket ? ` · Billete ${esc(t.ticket)}` : ''}. ${esc(t.cancel || '')}</p>
    </article>`;
}
function openPass(id) {
  const e = state.events.find(x => x.id === id);
  if (!e) return;
  const { dep, arr } = tkStops(e);
  const p = $('#pass');
  p.innerHTML = `<div class="pass-sheet" role="document">
      <header class="pass-bar">
        <span class="pass-title">${esc(dep.city)} → ${esc(arr.city)}</span>
        <button class="pass-close" data-pass-close aria-label="Cerrar"><span><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></span></button>
      </header>
      ${passCard(e)}
    </div>`;
  p.hidden = false; document.body.classList.add('no-scroll');
  p.querySelector('.pass-close').focus({ preventScroll: true });
}
function closePass() {
  const p = $('#pass'); p.hidden = true; p.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

/* ---------- Pantalla: Billetes y reservas ---------- */
function renderBilletes() {
  const legs = sorted(state.events.filter(isTransport));
  let html = privateCTA();
  if (PRIVATE) html += `<div class="card"><div class="muted small">Abono Único Renfe · ${esc(PRIVATE.viajero || '')}</div>
    <div class="row"><span class="ref">${esc(PRIVATE.abono || '')}</span><span class="spacer"></span><button class="btn btn--gray btn--sm" data-copy="${esc(PRIVATE.abono || '')}">Copiar</button></div></div>`;
  html += '<h2>Billetes</h2>';
  html += legs.map(ticketCard).join('');
  html += `<p class="note">Billetes cancelados, ya no valen: Vila-seca–Zaragoza (20/11), Zaragoza–Vitoria (21/11), Vitoria–Donostia (21/11), A Coruña–Santiago (26/11) y Santiago–Ponferrada (27/11).</p>`;
  if (!PRIVATE) return html;
  html += '<h2>Alojamientos</h2>';
  html += Object.values(STAYS).map(s => `<div class="card k-checkin">
      <div class="ev-type">${fmtDay(s.checkinDay)} → ${fmtDay(s.checkoutDay)}</div>
      <div style="font-weight:600;margin-top:2px">${esc(stayName(s))}</div>
      ${s.conf ? `<div class="row" style="margin-top:8px"><span class="ref" style="font-size:17px">${esc(s.conf.split(' ')[0])}</span><span class="spacer"></span><button class="btn btn--gray btn--sm" data-copy="${esc(s.conf.split(' ')[0])}">Copiar</button></div>` : ''}
      <div class="ticket-grid">
        <span>Check-in</span><span>${windowText(s)}</span>
        <span>Check-out</span><span>hasta ${s.checkoutBy}</span>
        ${s.price ? `<span>Precio</span><span>${esc(s.price)}</span>` : ''}
        <span>Cancelar</span><span>${s.nonRefundable ? 'Sin reembolso' : s.cancelUntil ? 'Gratis hasta ' + fmtDate(new Date(s.cancelUntil)) + ' 23:59' : 'Pendiente'}</span>
      </div>
      <div class="btn-row">
        ${pdfLink(s.pdf, 'PDF', 'btn btn--gray', stayName(s))}
        ${s.phone ? `<a class="btn btn--gray" href="tel:${s.phone.replace(/\s/g, '')}">Llamar</a>` : ''}
        ${s.address ? `<a class="btn btn--gray" href="${mapsUrl(s.name + ', ' + s.address, s.lat, s.lng)}" target="_blank" rel="noopener">Maps</a>` : ''}
      </div>
    </div>`).join('');
  html += `<button class="btn btn--gray btn--danger btn--block" data-act="forget" style="margin-top:14px">Borrar datos privados de este dispositivo</button>`;
  return html;
}

/* ---------- Pantalla: Avisos ---------- */
function renderAvisos() {
  const n = now();
  const dl = deadlineAlerts(STAYS, state.tasks, n);
  const tasks = dl.filter(a => a.kind === 'task');
  const cancels = dl.filter(a => a.kind === 'cancel');
  const whenTxt = a => a.when ? `${fmtDate(a.when)} ${String(a.when.getHours()).padStart(2, '0')}:${String(a.when.getMinutes()).padStart(2, '0')} · ${relText(a.when - n)}` : '';

  let html = privateCTA();
  if (tasks.length) html += `<h2>Pendientes y pagos</h2><div class="card">${tasks.map(a => `
    <div class="alert ${a.done ? 'done' : ''} sev-${a.sev}">
      <span class="dot"></span>
      <div><p>${esc(a.text)}</p><div class="when">${whenTxt(a)}</div></div>
      <button class="check" data-task="${a.id}" aria-pressed="${a.done}" aria-label="Hecho"><span></span></button>
    </div>`).join('')}</div>`;
  if (cancels.length) html += `<h2>Plazos de cancelación</h2><div class="card">${cancels.map(a => `
    <div class="alert sev-${a.sev}"><span class="dot"></span><div><p>${esc(a.text)}</p><div class="when">${a.when ? (a.when < n ? 'Plazo vencido' : relText(a.when - n)) : ''}</div></div><span></span></div>`).join('')}</div>`;
  html += `<h2>Reglas del abono y los buses</h2><div class="card"><ul class="plain-list small">
    <li>Billete sin usar: anúlalo al menos 2 h antes de la salida. Con 3 fallos se anula el abono y pierdes la fianza de 20 €.</li>
    <li>Bus Donostia–Bilbao: cambios y anulaciones hasta 2 h antes.</li>
    <li>Bus Oviedo–A Coruña: cambios y anulaciones hasta 24 h antes.</li>
    <li>Buses ALSA: 20 kg de equipaje, máximo 2 bultos.</li>
    <li>Volotea: solo bolso de 40x30x20 cm.</li>
    <li>En regionales y buses no hay wifi fiable: lleva datos y trabaja en local.</li>
  </ul></div>`;
  return html;
}

/* ---------- Hoja de edición ---------- */
let editing = null;
function openSheet(ev, isNew) {
  editing = { ...ev, _new: !!isNew };
  const opts = Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === ev.type ? 'selected' : ''}>${v}</option>`).join('');
  const dayOpts = tripDays().map(d => `<option value="${d}" ${d === ev.day ? 'selected' : ''}>${fmtDayLong(d)}</option>`).join('');
  const linked = ev.trip ? `<p class="small muted" style="margin:-4px 0 12px">${esc(tripOf(ev).from)} → ${esc(tripOf(ev).to)} · ${esc(tripOf(ev).ref)}</p>` : '';
  $('#sheet').innerHTML = `    <h3>${isNew ? 'Nuevo evento' : 'Editar evento'}</h3>
    ${linked}
    <label class="field"><span>Título</span><input id="f-title" value="${esc(ev.title)}" autocomplete="off"></label>
    <div class="field-row">
      <label class="field"><span>Inicio</span><input id="f-start" type="time" value="${esc(ev.start)}"></label>
      <label class="field"><span>Fin</span><input id="f-end" type="time" value="${esc(ev.end || '')}"></label>
    </div>
    <div class="nudge">
      <button class="btn btn--gray btn--sm" data-nudge="-15">−15</button><button class="btn btn--gray btn--sm" data-nudge="-5">−5</button>
      <button class="btn btn--gray btn--sm" data-nudge="5">+5</button><button class="btn btn--gray btn--sm" data-nudge="15">+15</button>
    </div>
    <div class="field-row">
      <label class="field"><span>Tipo</span><select id="f-type" ${ev.trip || ev.stay ? 'disabled' : ''}>${opts}</select></label>
      <label class="field"><span>Día</span><select id="f-day">${dayOpts}</select></label>
    </div>
    <label class="field"><span>Nota</span><textarea id="f-note" placeholder="Opcional">${esc(ev.note || '')}</textarea></label>
    <div id="sheet-preview" class="sheet-preview"></div>
    <div class="btn-row" style="margin-bottom:8px">
      ${isNew ? '' : `<button class="btn btn--gray btn--danger" data-act="delete">Borrar</button>
      <button class="btn btn--gray" data-act="toggle-done">${ev.done ? 'Desmarcar' : 'Hecho'}</button>`}
    </div>
    <div class="btn-row sheet-actions">
      <button class="btn btn--gray" data-act="close">Cancelar</button>
      <button class="btn" data-act="save">Guardar</button>
    </div>`;
  $('#sheet').hidden = false; $('#backdrop').hidden = false;
  ['f-start', 'f-end', 'f-day'].forEach(id => $('#' + id).addEventListener('input', onStartChange));
  previewEdit();
}
let lastStart = null;
function onStartChange(ev) {
  // Al mover el inicio, el fin se desplaza igual para mantener la duración.
  if (ev && ev.target.id === 'f-start' && lastStart && $('#f-end').value) {
    const delta = toMin($('#f-start').value) - toMin(lastStart);
    if (!isNaN(delta)) $('#f-end').value = fromMin(toMin($('#f-end').value) + delta);
  }
  lastStart = $('#f-start').value;
  previewEdit();
}
function readForm() {
  return {
    ...editing,
    title: $('#f-title').value.trim() || 'Sin título',
    start: $('#f-start').value || '12:00',
    end: $('#f-end').value || '',
    type: $('#f-type').value,
    day: $('#f-day').value,
    note: $('#f-note').value.trim(),
  };
}
/* Vista previa en vivo: recalcula el día con el cambio antes de guardar. */
function previewEdit() {
  if (!editing) return;
  lastStart = $('#f-start').value;
  const draft = readForm();
  const others = state.events.filter(e => e.id !== draft.id);
  const res = analyzeDay(draft.day, [...others, draft], STAYS);
  const mine = res.issues.filter(i => i.ids.includes(draft.id));
  const rel = res.margins.filter(m => m.sev !== 'ok' || isTransport(draft)).slice(0, 4);
  $('#sheet-preview').innerHTML =
    (mine.length ? issuesHTML(mine) : `<div class="issue sev-ok"><span class="dot"></span><p>Sin conflictos con este horario.</p></div>`) +
    (rel.length ? `<div class="margins">${rel.map(m => `<div class="margin sev-${m.sev}"><b>${esc(m.label)}</b><span class="val">${marginVal(m.value)}</span><span class="det">${esc(m.detail)}</span></div>`).join('')}</div>` : '');
}
function closeSheet() { $('#sheet').hidden = true; $('#backdrop').hidden = true; editing = null; lastStart = null; }
function saveSheet() {
  const draft = readForm();
  delete draft._new;
  if (draft.end && toMin(draft.end) < toMin(draft.start) && !isTransport(draft)) {
    toast('La hora de fin es anterior a la de inicio.'); return;
  }
  const before = (analysis[draft.day]?.issues || []).length;
  const i = state.events.findIndex(e => e.id === draft.id);
  if (i >= 0) state.events[i] = draft; else state.events.push(draft);
  save(); reanalyze(); closeSheet(); render();
  const after = analysis[draft.day].issues;
  const bad = after.filter(x => x.sev === 'bad').length;
  toast(after.length > before ? `Atención: ${after.length} aviso(s) en el ${fmtDay(draft.day)}${bad ? `, ${bad} conflicto(s)` : ''}.` :
    after.length ? `Guardado. Siguen ${after.length} aviso(s) en el ${fmtDay(draft.day)}.` : 'Guardado. Día sin conflictos.');
}

/* ---------- Exportar / importar ---------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ruta-norte-${isoDay(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (s.tipo === 'ruta-norte-privado') {
        importPrivate(s).catch(() => toast('No se han podido guardar los datos en este dispositivo.'));
        return;
      }
      if (!Array.isArray(s.events) || !s.events.every(e => e.id && e.day && e.start && e.type)) throw new Error('formato');
      if (!Array.isArray(s.tasks)) s.tasks = seedState().tasks;
      if (!confirm(`¿Sustituir el itinerario actual por el importado (${s.events.length} eventos)?`)) return;
      state = s; save(); reanalyze(); render(); toast('Itinerario importado.');
    } catch (e) { toast('El archivo no es un itinerario válido.'); }
  };
  r.readAsText(file);
}

/* ---------- Navegación y eventos ---------- */
const SCREENS = { hoy: renderHoy, plan: renderPlan, ciudad: renderCiudad, trayectos: renderTrayectos, billetes: renderBilletes, avisos: renderAvisos };
const TITLES = { hoy: 'Hoy', plan: 'Itinerario', ciudad: 'Ciudad', trayectos: 'Trayectos', billetes: 'Billetes y reservas', avisos: 'Avisos' };
let tab = (() => { try { return localStorage.getItem(TAB_KEY) || 'hoy'; } catch (e) { return 'hoy'; } })();
if (!SCREENS[tab]) tab = 'hoy';

function render() {
  // Recordar qué días del plan están abiertos
  if (openDays) document.querySelectorAll('details.day').forEach(d => d.open ? openDays.add(d.dataset.day) : openDays.delete(d.dataset.day));
  $('#view').innerHTML = SCREENS[tab]();
  $('#topTitle').textContent = TITLES[tab];
  const n = now();
  $('#topSub').textContent = `${fmtDate(n)} · ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}${clockOffset ? ' (simulado)' : ''}`;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
}
function go(t, opts = {}) {
  tab = t;
  try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* nada */ }
  if (opts.day) { openDays = openDays || new Set(); openDays.add(opts.day); }
  render();
  window.scrollTo(0, 0);
  if (opts.day) {
    const el = document.querySelector(`details[data-day="${opts.day}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
  }
}

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (b) go(b.dataset.tab);
});
$('#view').addEventListener('click', e => {
  const t = e.target;
  const done = t.closest('[data-done]');
  if (done) {
    const ev = state.events.find(x => x.id === done.dataset.done);
    ev.done = !ev.done; save(); reanalyze(); render(); return;
  }
  const task = t.closest('[data-task]');
  if (task) {
    const tk = state.tasks.find(x => x.id === task.dataset.task);
    tk.done = !tk.done; save(); reanalyze(); render(); return;
  }
  const pdf = t.closest('[data-pdf]');
  if (pdf) { openPdf(pdf.dataset.pdf, pdf.dataset.title); return; }
  const pass = t.closest('[data-pass]');
  if (pass) { openPass(pass.dataset.pass); return; }
  const copy = t.closest('[data-copy]');
  if (copy) {
    const v = copy.dataset.copy;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast(`Copiado: ${v}`), () => toast(v));
    return;
  }
  const city = t.closest('[data-city]');
  if (city) { currentCity = city.dataset.city; render(); return; }
  const add = t.closest('[data-add]');
  if (add) {
    openSheet({ id: 'u' + Date.now().toString(36), day: add.dataset.add, start: '12:00', end: '13:00', type: 'visit', title: '' }, true);
    return;
  }
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'export') exportJSON();
    if (a === 'import') $('#importFile').click();
    if (a === 'forget' && confirm('¿Borrar los localizadores, los PDF y los datos de alojamiento de este dispositivo?')) forgetPrivate();
    if (a === 'reset' && confirm('¿Volver al itinerario original de VIAJE.md? Se perderán tus cambios (exporta antes si quieres guardarlos).')) {
      state = seedState(); save(); reanalyze(); render(); toast('Itinerario restaurado.');
    }
    return;
  }
  const goday = t.closest('[data-goday]');
  if (goday) { go('plan', { day: goday.dataset.goday }); return; }
  const gotab = t.closest('[data-go]');
  if (gotab) { go(gotab.dataset.go); return; }
  const evEl = t.closest('[data-ev]');
  if (evEl) {
    const ev = state.events.find(x => x.id === evEl.dataset.ev);
    if (ev) openSheet(ev, false);
  }
});
$('#sheet').addEventListener('click', e => {
  const n = e.target.closest('[data-nudge]');
  if (n) {
    const d = Number(n.dataset.nudge);
    $('#f-start').value = fromMin(toMin($('#f-start').value || '12:00') + d);
    if ($('#f-end').value) $('#f-end').value = fromMin(toMin($('#f-end').value) + d);
    previewEdit(); return;
  }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'close') closeSheet();
  if (a.dataset.act === 'save') saveSheet();
  if (a.dataset.act === 'toggle-done') {
    const ev = state.events.find(x => x.id === editing.id);
    ev.done = !ev.done; save(); reanalyze(); closeSheet(); render();
  }
  if (a.dataset.act === 'delete') {
    if (!confirm(`¿Borrar «${editing.title}»?`)) return;
    const ev = state.events.find(x => x.id === editing.id);
    if (ev && isTransport(ev)) toast('Recuerda anular el billete al menos 2 h antes si no lo vas a usar.');
    state.events = state.events.filter(x => x.id !== editing.id);
    save(); reanalyze(); closeSheet(); render();
  }
});
$('#sheet').addEventListener('input', e => { if (['f-title', 'f-type', 'f-note'].includes(e.target.id)) previewEdit(); });
$('#backdrop').addEventListener('click', closeSheet);
$('#pass').addEventListener('click', e => {
  if (e.target.closest('[data-pass-close]') || e.target === $('#pass')) { closePass(); return; }
  const c = e.target.closest('[data-copy]');
  if (c && c.dataset.copy) { const v = c.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast(`Copiado: ${v}`), () => toast(v)); }
});
$('#viewer').addEventListener('click', e => {
  const a = e.target.closest('[data-viewer]');
  if (a && a.dataset.viewer === 'close') closePdf();
  if (a && a.dataset.viewer === 'share') sharePdf();
});
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('#viewer').hidden) closePdf(); else if (!$('#pass').hidden) closePass(); else if (editing) closeSheet(); });
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });

/* Cuentas atrás: cada segundo; repinta la pantalla entera cada minuto. */
let lastMinute = -1;
setInterval(() => {
  const n = now();
  document.querySelectorAll('[data-cd]').forEach(el => { el.innerHTML = countdownHTML(Number(el.dataset.cd) - n); });
  if (n.getMinutes() !== lastMinute) {
    if (lastMinute !== -1 && !editing && (tab === 'hoy' || tab === 'avisos')) { reanalyze(); render(); }
    lastMinute = n.getMinutes();
  }
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !editing) { reanalyze(); render(); } });

reanalyze();
render();
loadPrivate().then(ok => {
  if (!ok) return;
  if (!state.privMerged) { mergePrivateIntoState(state, PRIVATE); save(); }
  reanalyze(); render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
