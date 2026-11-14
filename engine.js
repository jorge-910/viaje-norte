/* Motor de márgenes y conflictos. Funciones puras: reciben eventos y devuelven avisos. */
'use strict';

const TRANSPORT = ['train', 'bus', 'flight'];
/* Minutos que hay que estar antes en la estación o el aeropuerto. */
const BOARD_BUFFER = { train: 10, bus: 15, flight: 120 };
const POINT_LEN = 15;
const LATE_ARRIVAL = 22 * 60; // a partir de esta hora, confirmar la entrada con el alojamiento // duración por defecto de un evento sin hora de fin

function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function fromMin(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function fmtDur(min) {
  const neg = min < 0; min = Math.abs(Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  const s = h ? (m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`) : `${m} min`;
  return neg ? '−' + s : s;
}
function endMin(e) {
  const s = toMin(e.start), en = toMin(e.end);
  if (en == null) return s + POINT_LEN;
  return en < s ? en + 1440 : en;
}
function isTransport(e) { return TRANSPORT.includes(e.type); }
function stayName(st) { return st.name || `Alojamiento en ${CITIES[st.city] ? CITIES[st.city].name : st.city}`; }
function tripOf(e) { return (e && e.trip && TRIPS[e.trip]) || {}; }
function weekday(day) { return new Date(day + 'T12:00:00').getDay(); }

/* Analiza un día. Devuelve márgenes (lo que tienes de holgura) e issues (problemas). */
function analyzeDay(day, allEvents, stays) {
  const ev = allEvents.filter(e => e.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const transports = ev.filter(isTransport);
  const margins = [];
  const issues = [];
  const add = (sev, text, ids, kind) => issues.push({ sev, text, ids: ids || [], day, kind: kind || 'conflict' });

  // 1. Check-out → salida hacia el siguiente transporte
  ev.filter(e => e.type === 'checkout' && e.stay && stays[e.stay]).forEach(co => {
    const st = stays[co.stay];
    const deadline = toMin(st.checkoutBy);
    const coT = toMin(co.start);
    if (coT > deadline) {
      add('bad', `Check-out de ${stayName(st)} a las ${co.start}, pero el límite es ${st.checkoutBy}.`, [co.id]);
    }
    const next = transports.find(t => toMin(t.start) >= coT);
    if (next) {
      const leave = toMin(next.start) - BOARD_BUFFER[next.type] - st.access;
      const label = `Check-out → ${next.type === 'flight' ? 'aeropuerto' : 'estación'}`;
      if (coT > leave) {
        margins.push({ label, value: leave - coT, sev: 'bad', detail: `Para el ${next.start} hay que salir del alojamiento a las ${fromMin(leave)}.` });
        add('bad', `Haces el check-out de ${stayName(st)} a las ${co.start}, pero para «${next.title}» de las ${next.start} tendrías que salir a las ${fromMin(leave)}.`, [co.id, next.id]);
      } else {
        const gap = leave - coT;
        margins.push({
          label, value: leave - coT, sev: leave - coT < 15 ? 'warn' : 'ok',
          detail: `Sal hacia ${tripOf(next).from || 'la estación'} a las ${fromMin(leave)} (${st.access} min de trayecto + ${BOARD_BUFFER[next.type]} de margen).` +
            (gap > 90 ? ` Hay ${fmtDur(gap)} con la mochila entre el check-out límite y la salida: pide consigna.` : ''),
        });
      }
    }
  });

  // 2. Transbordos entre transportes del mismo día
  for (let i = 1; i < transports.length; i++) {
    const a = transports[i - 1], b = transports[i];
    const gap = toMin(b.start) - endMin(a);
    const need = BOARD_BUFFER[b.type];
    const sev = gap < 0 ? 'bad' : gap < need ? 'bad' : gap < need + 20 ? 'warn' : 'ok';
    margins.push({ label: `Transbordo en ${tripOf(a).to || 'estación'}`, value: gap, sev, detail: `Llegas a las ${a.end}, sale a las ${b.start}.` });
    if (sev !== 'ok') add(sev, `Transbordo de ${fmtDur(gap)} entre «${a.title}» (llega ${a.end}) y «${b.title}» (sale ${b.start}).`, [a.id, b.id]);
  }

  // 3. Llegada → check-in
  ev.filter(e => e.type === 'checkin' && e.stay && stays[e.stay]).forEach(ci => {
    const st = stays[ci.stay];
    const ciT = toMin(ci.start);
    const from = toMin(st.checkinFrom), to = toMin(st.checkinTo);
    const arr = [...transports].reverse().find(t => toMin(t.start) <= ciT);
    if (from == null || to == null) {
      // Horario de entrada sin confirmar: solo la hora estimada de llegada.
      if (arr) {
        const eta = endMin(arr) + st.access;
        margins.push({ label: `Llegada a ${stayName(st)}`, value: null, sev: 'warn', detail: `Llegas sobre las ${fromMin(eta)}. Horario de entrada pendiente de confirmar.` });
        add('warn', `${stayName(st)}: llegas sobre las ${fromMin(eta)} (el bus llega a las ${arr.end}). Confirma con el anfitrión el check-in tardío.`, [ci.id, arr.id], 'checkin');
        if (ciT < eta) add('bad', `El check-in de ${stayName(st)} está a las ${ci.start}, pero no llegas hasta las ${fromMin(eta)}.`, [ci.id, arr.id]);
      } else {
        add('warn', `${stayName(st)}: horario de entrada pendiente de confirmar.`, [ci.id], 'checkin');
      }
      return;
    }
    if (arr) {
      const eta = endMin(arr) + st.access;
      const late = eta - to;
      if (late > 0) {
        margins.push({ label: `Llegada a ${stayName(st)}`, value: to - eta, sev: 'bad', detail: `Llegas sobre las ${fromMin(eta)}; el check-in cierra a las ${st.checkinTo}.` });
        add('bad', `${stayName(st)}: llegas sobre las ${fromMin(eta)} y el check-in cierra a las ${st.checkinTo}. Avisa al alojamiento.`, [ci.id, arr.id], 'checkin');
      } else if (eta < from) {
        margins.push({ label: `Espera hasta el check-in de ${stayName(st)}`, value: from - eta, sev: from - eta > 90 ? 'warn' : 'ok', detail: `Llegas sobre las ${fromMin(eta)} y el check-in abre a las ${st.checkinFrom}: deja la mochila o espera.` });
      } else {
        margins.push({ label: `Llegada a ${stayName(st)}`, value: to - eta, sev: to - eta < 30 || eta >= LATE_ARRIVAL ? 'warn' : 'ok', detail: `Llegas sobre las ${fromMin(eta)}; check-in ${st.checkinTo === '23:59' ? 'desde las ' + st.checkinFrom : 'de ' + st.checkinFrom + ' a ' + st.checkinTo}.` });
        if (eta >= LATE_ARRIVAL) add('warn', `${stayName(st)}: llegas sobre las ${fromMin(eta)} (llegada a las ${arr.end}). Confirma con el alojamiento la entrada tardía.`, [ci.id, arr.id], 'checkin');
      }
      if (ciT < eta) add('bad', `El check-in de ${stayName(st)} está a las ${ci.start}, pero no llegas hasta las ${fromMin(eta)}.`, [ci.id, arr.id]);
    }
    const lateArrival = issues.some(i => i.kind === 'checkin' && i.ids.includes(ci.id));
    if (ciT > to && !lateArrival) add('bad', `El check-in de ${stayName(st)} a las ${ci.start} está fuera de horario (cierra a las ${st.checkinTo}).`, [ci.id], 'checkin');
    else if (ciT < from) add('warn', `El check-in de ${stayName(st)} a las ${ci.start} es antes de que abra (${st.checkinFrom}).`, [ci.id], 'checkin');
  });

  // 3b. Cambio de alojamiento el mismo día sin transporte: hueco con la mochila
  ev.filter(e => e.type === 'checkout' && e.stay && stays[e.stay]).forEach(co => {
    const ci = ev.find(e => e.type === 'checkin' && e.stay && e.stay !== co.stay && toMin(e.start) >= toMin(co.start));
    if (!ci || transports.some(t => toMin(t.start) >= toMin(co.start) && toMin(t.start) <= toMin(ci.start))) return;
    const gap = toMin(ci.start) - toMin(co.start);
    margins.push({ label: 'Mochila entre alojamientos', value: gap, sev: gap > 60 ? 'warn' : 'ok',
      detail: `Check-out a las ${co.start} y check-in a las ${ci.start}: pregunta en alguno de los dos si te guardan la mochila.` });
  });

  // 4. Daily frente a transportes
  if (TRIP.daily.weekdays.includes(weekday(day))) {
    ev.filter(e => e.type === 'daily').forEach(d => {
      const ds = toMin(d.start), de = endMin(d);
      transports.forEach(t => {
        const ts = toMin(t.start);
        const boardStart = t.type === 'flight' ? ts - 40 : ts - BOARD_BUFFER[t.type];
        const boardEnd = t.type === 'flight' ? ts : ts + 5;
        if (boardStart < de && boardEnd > ds) {
          add('bad', `El daily de las ${d.start} coincide con ${t.type === 'flight' ? 'el embarque de' : 'la salida de'} «${t.title}» (${t.start}).`, [d.id, t.id], 'daily');
        } else if (ts - BOARD_BUFFER[t.type] < de + 10 && ts > ds) {
          add('warn', `El daily termina muy cerca de la salida de «${t.title}» (${t.start}).`, [d.id, t.id], 'daily');
        }
      });
    });
  }

  // 5. Solapes entre visitas, comidas, check-ins y transportes (trabajo, daily y notas pueden solaparse)
  const hard = ev.filter(e => ['visit', 'meal', 'checkin', 'checkout', ...TRANSPORT].includes(e.type));
  for (let i = 0; i < hard.length; i++) {
    for (let j = i + 1; j < hard.length; j++) {
      const a = hard[i], b = hard[j];
      if (isTransport(a) && isTransport(b)) continue; // ya cubierto en transbordos
      const aS = toMin(a.start) - (isTransport(a) ? BOARD_BUFFER[a.type] : 0);
      const bS = toMin(b.start) - (isTransport(b) ? BOARD_BUFFER[b.type] : 0);
      const aE = endMin(a), bE = endMin(b);
      if (aS < bE && bS < aE) {
        if (['checkin', 'checkout'].includes(a.type) && !isTransport(b) && b.type !== 'visit') continue;
        const sev = (isTransport(a) || isTransport(b)) ? 'bad' : 'warn';
        add(sev, `Se solapan «${a.title}» (${a.start}${a.end ? '–' + a.end : ''}) y «${b.title}» (${b.start}${b.end ? '–' + b.end : ''}).`, [a.id, b.id]);
      }
    }
  }

  const worst = issues.some(i => i.sev === 'bad') ? 'bad' : issues.some(i => i.sev === 'warn') ? 'warn' : 'ok';
  return { day, margins, issues, worst };
}

function tripDays() {
  const out = [];
  const d = new Date(TRIP.start + 'T12:00:00');
  const end = new Date(TRIP.end + 'T12:00:00');
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}

function analyzeAll(events, stays) {
  const res = {};
  tripDays().forEach(day => { res[day] = analyzeDay(day, events, stays); });
  return res;
}

/* Avisos de plazos: cancelaciones y tareas, ordenados por fecha. */
function deadlineAlerts(stays, tasks, now) {
  const out = [];
  Object.entries(stays).forEach(([id, st]) => {
    if (st.nonRefundable) {
      out.push({ id: 'nr-' + id, kind: 'cancel', when: null, sev: 'info', text: `${stayName(st)}: reserva sin reembolso.` });
    } else if (st.cancelUntil) {
      const when = new Date(st.cancelUntil);
      const left = when - now;
      const sev = left < 0 ? 'past' : left < 48 * 3600e3 ? 'bad' : left < 7 * 86400e3 ? 'warn' : 'ok';
      out.push({ id: 'cx-' + id, kind: 'cancel', when, sev, text: `${stayName(st)}: cancelación gratuita hasta el ${fmtDate(when)} a las ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}.` });
    }
  });
  tasks.forEach(t => {
    const when = t.due ? new Date(t.due) : null;
    const left = when ? when - now : Infinity;
    const sev = t.done ? 'done' : left < 0 ? 'bad' : left < 48 * 3600e3 ? 'bad' : left < 7 * 86400e3 ? 'warn' : 'ok';
    out.push({ id: t.id, kind: 'task', when, sev, text: t.text, done: !!t.done });
  });
  return out.sort((a, b) => (a.when ? a.when.getTime() : 0) - (b.when ? b.when.getTime() : 0));
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtDate(d) { return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }
function fmtDay(day) { return fmtDate(new Date(day + 'T12:00:00')); }
function fmtDayLong(day) { const d = new Date(day + 'T12:00:00'); return `${DOW_LONG[d.getDay()]} ${d.getDate()} de noviembre`; }
