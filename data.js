/* Información general del viaje: horarios, qué ver, dónde comer y paisajes.
   Los datos personales (localizadores, PDF, nombre, alojamientos, trabajo) NO están aquí:
   se importan en el móvil desde un JSON privado y se guardan solo en el dispositivo.
   Visitas, comida, historia y paisajes son orientativos. */
'use strict';

const SEED_VERSION = 3;

const TRIP = {
  title: 'Ruta Norte',
  start: '2026-11-20',
  end: '2026-11-28',
  daily: { start: '10:15', end: '10:30', weekdays: [1, 2, 3, 4, 5] },
};

/* Alojamientos: solo ciudad y horarios. Nombre, dirección, teléfono, precio y plazos
   llegan con el JSON privado. access = minutos aprox. entre estación/aeropuerto y alojamiento.
   checkinFrom/checkinTo = null: horario de entrada pendiente de confirmar. */
const STAYS = {
  donostia1: { city: 'donostia',  checkinDay: '2026-11-20', checkinFrom: '15:00', checkinTo: '23:59', checkoutDay: '2026-11-21', checkoutBy: '11:00', access: 15 },
  donostia2: { city: 'donostia',  checkinDay: '2026-11-21', checkinFrom: '14:00', checkinTo: '18:00', checkoutDay: '2026-11-22', checkoutBy: '11:00', access: 12 },
  bilbao:    { city: 'bilbao',    checkinDay: '2026-11-22', checkinFrom: '16:00', checkinTo: '22:00', checkoutDay: '2026-11-23', checkoutBy: '11:00', access: 20 },
  santander: { city: 'santander', checkinDay: '2026-11-23', checkinFrom: '14:00', checkinTo: '23:30', checkoutDay: '2026-11-24', checkoutBy: '12:00', access: 25 },
  oviedo:    { city: 'oviedo',    checkinDay: '2026-11-24', checkinFrom: '13:00', checkinTo: '23:30', checkoutDay: '2026-11-25', checkoutBy: '11:00', access: 10 },
  coruna:    { city: 'coruna',    checkinDay: '2026-11-25', checkinFrom: '15:00', checkinTo: '23:59', checkoutDay: '2026-11-27', checkoutBy: '11:00', access: 20 },
  valencia:  { city: 'valencia',  checkinDay: '2026-11-27', checkinFrom: '16:00', checkinTo: '23:30', checkoutDay: '2026-11-28', checkoutBy: '11:00', access: 35 },
};

/* Datos fijos de cada trayecto: servicio, paradas y paisajes (sin localizadores).
   highlights.at = minutos desde la salida (se recalcula si cambias la hora). */
const TRIPS = {
  m1: {
    operator: 'monbus', dep: { code: 'SAL', city: 'Salou', station: 'Estación de autobús' }, arr: { code: 'EAS', city: 'Donostia', station: 'Estación de bus' },
    mode: 'bus', from: 'Salou', to: 'Donostia', service: 'Monbus, con Abono Único',
    cancel: 'El billete no indica plazo de cambio: compruébalo en monbus.es. Si no lo usas, anúlalo con margen como el resto del abono.',
    route: 'El billete no detalla el recorrido. Anochece hacia las 17:45, así que casi todo el viaje es de noche: lleva cena.',
    highlights: [
      { at: 20, text: 'Camp de Tarragona y subida hacia el interior' },
      { at: 90, text: 'Últimas luces del día sobre la llanura (anochece hacia las 17:45)' },
    ],
  },
  b1: {
    operator: 'alsa', dep: { code: 'EAS', city: 'Donostia', station: 'Estación de bus' }, arr: { code: 'BIO', city: 'Bilbao', station: 'Intermodal' },
    mode: 'bus', from: 'Donostia (estación de autobuses)', to: 'Bilbao Intermodal', service: 'ALSA, línea Irun-Llanes',
    cancel: 'Cambios y anulaciones hasta 2 h antes. Equipaje 20 kg, máximo 2 bultos.',
    depPlace: 'Paseo Federico García Lorca 1', arrPlace: 'Calle Gurtubay 1, San Mamés',
    route: 'Por la AP-8, entre montes verdes y con algún vistazo a la costa.',
    highlights: [
      { at: 15, text: 'Valle del Oria y montes de Gipuzkoa' },
      { at: 25, text: 'Zona de Zarautz: puede verse el mar a la derecha' },
      { at: 40, text: 'Valle del Deba' },
      { at: 60, text: 'Durangaldea, con las peñas del Duranguesado al sur' },
      { at: 75, text: 'Entrada en Bilbao por el valle del Nervión' },
    ],
  },
  t4: {
    operator: 'renfe', dep: { code: 'BIO', city: 'Bilbao', station: 'Concordia' }, arr: { code: 'SDR', city: 'Santander', station: 'Estación de tren' },
    mode: 'train', from: 'Bilbao Concordia', to: 'Santander', service: 'Regional 71872 (ancho métrico)',
    cancel: 'Abono: anular al menos 2 h antes si no lo usas.',
    route: 'Antigua línea de vía estrecha por las Encartaciones y el oriente de Cantabria.',
    highlights: [
      { at: 20, text: 'Valle del Cadagua, entre Sodupe y Güeñes' },
      { at: 60, text: 'Valle de Karrantza: prados y caseríos' },
      { at: 100, text: 'Río Asón entre Gibaja y Marrón' },
      { at: 125, text: 'Marismas de Santoña desde Treto' },
      { at: 175, text: 'Bahía de Santander a la llegada' },
    ],
  },
  t5: {
    operator: 'renfe', dep: { code: 'SDR', city: 'Santander', station: 'Estación de tren' }, arr: { code: 'OVD', city: 'Oviedo', station: 'Estación de tren' },
    mode: 'train', from: 'Santander', to: 'Oviedo', service: 'Regional 71852 (ancho métrico)',
    cancel: 'Abono: anular al menos 2 h antes si no lo usas.',
    route: 'La línea de la costa cantábrica. Hay luz hasta cerca de Llanes; después se hace de noche.',
    highlights: [
      { at: 30, text: 'Torrelavega' },
      { at: 70, text: 'Cabezón de la Sal y valle del Saja' },
      { at: 100, text: 'Ría de San Vicente de la Barquera; Picos de Europa al sur' },
      { at: 120, text: 'Unquera y desembocadura del Deva: entras en Asturias' },
      { at: 145, text: 'Costa de Llanes: acantilados y prados junto al mar (atardecer)' },
      { at: 185, text: 'Ribadesella y la ría del Sella (ya de noche)' },
      { at: 260, text: 'Infiesto y Pola de Siero' },
    ],
  },
  b2: {
    operator: 'alsa', dep: { code: 'OVD', city: 'Oviedo', station: 'Estación de autobuses' }, arr: { code: 'LCG', city: 'A Coruña', station: 'Intermodal' },
    mode: 'bus', from: 'Oviedo (estación de autobuses)', to: 'A Coruña Intermodal', service: 'ALSA, línea Irun-Santiago (8 paradas)',
    cancel: 'Cambios y anulaciones hasta 24 h antes. Equipaje 20 kg, máximo 2 bultos.',
    depPlace: 'Avenida Pepe Cosmen s/n', arrPlace: 'Avenida da Sardiñeira s/n (a las afueras)',
    route: 'Por la autovía del Cantábrico (A-8) y después por el interior de Lugo.',
    highlights: [
      { at: 45, text: 'Occidente asturiano: viaductos sobre valles y rías' },
      { at: 75, text: 'Costa de Cadavedo y Luarca, acantilados a la derecha' },
      { at: 120, text: 'Puente de la ría del Eo en Ribadeo, ya en Galicia (atardecer)' },
      { at: 180, text: 'Terra Chá y Vilalba (de noche)' },
    ],
  },
  f1: {
    operator: 'volotea', dep: { code: 'LCG', city: 'A Coruña', station: 'Aeropuerto' }, arr: { code: 'VLC', city: 'Valencia', station: 'Aeropuerto' },
    mode: 'flight', from: 'A Coruña (LCG)', to: 'Valencia (VLC)', service: 'Volotea V7 3816',
    cancel: 'Solo bolso de 40x30x20 cm, sin equipaje de pago. Estar en el aeropuerto 2 h antes.',
    route: 'Cruza la península en diagonal de noroeste a sureste.',
    highlights: [
      { at: 5, text: 'Despegue: ría de A Coruña y la Torre de Hércules' },
      { at: 30, text: 'Montañas de León y meseta castellana' },
      { at: 60, text: 'Sistema Ibérico' },
      { at: 80, text: 'Aproximación sobre la huerta y la Albufera' },
    ],
  },
  t6: {
    operator: 'renfe', dep: { code: 'VLC', city: 'Valencia', station: 'València Nord' }, arr: { code: 'VSC', city: 'Vila-seca', station: 'Estación' },
    mode: 'train', from: 'Valencia Nord', to: 'Vila-seca', service: 'Regional Exprés 18096',
    cancel: 'Abono: anular al menos 2 h antes si no lo usas.',
    route: 'El corredor mediterráneo. De noche casi todo el camino.',
    highlights: [
      { at: 25, text: 'Silueta del castillo de Sagunt' },
      { at: 75, text: 'Castelló de la Plana' },
      { at: 160, text: 'Vinaròs y entrada en Catalunya' },
      { at: 185, text: 'Delta del Ebro: arrozales a la derecha (de noche)' },
      { at: 215, text: 'Costa de L\'Ametlla y Cambrils' },
    ],
  },
};

/* Itinerario editable. tipos: train, bus, flight, checkin, checkout, visit, meal, work, daily, note */
const SEED_EVENTS = [
  // Vie 20 (el trabajo y el daily llegan con el JSON privado)
  { id: 'e101', day: '2026-11-20', start: '15:40', end: '22:50', type: 'bus', title: 'Bus a Donostia (llevar cena)', trip: 'm1' },
  { id: 'e102', day: '2026-11-20', start: '23:10', end: '', type: 'checkin', title: 'Check-in en Donostia (1.ª noche)', stay: 'donostia1' },
  // Sáb 21: día completo en Donostia
  { id: 'e110', day: '2026-11-21', start: '11:00', end: '', type: 'checkout', title: 'Check-out (1.ª noche)', stay: 'donostia1' },
  { id: 'e111', day: '2026-11-21', start: '11:00', end: '', type: 'note', title: 'Guardar la mochila hasta las 14:00' },
  { id: 'e112', day: '2026-11-21', start: '11:15', end: '13:45', type: 'visit', title: 'Parte Vieja, La Bretxa, puerto y Monte Urgull', city: 'donostia' },
  { id: 'e113', day: '2026-11-21', start: '14:00', end: '', type: 'checkin', title: 'Check-in en Donostia (2.ª noche)', stay: 'donostia2' },
  { id: 'e114', day: '2026-11-21', start: '14:15', end: '15:30', type: 'meal', title: 'Pintxos en la calle 31 de Agosto', city: 'donostia' },
  { id: 'e115', day: '2026-11-21', start: '15:45', end: '18:30', type: 'visit', title: 'La Concha, Miramar, Ondarreta y Peine del Viento al atardecer', city: 'donostia' },
  { id: 'e116', day: '2026-11-21', start: '20:30', end: '22:00', type: 'meal', title: 'Cena: Bergara Bar o La Cuchara de San Telmo', city: 'donostia' },
  // Dom 22
  { id: 'e20', day: '2026-11-22', start: '10:45', end: '', type: 'checkout', title: 'Check-out en Donostia', stay: 'donostia2' },
  { id: 'e21', day: '2026-11-22', start: '11:00', end: '14:00', type: 'visit', title: 'Monte Igueldo, Gros y playa de Zurriola', city: 'donostia' },
  { id: 'e22', day: '2026-11-22', start: '14:00', end: '15:15', type: 'meal', title: 'Pintxos en Gros', city: 'donostia' },
  { id: 'e23', day: '2026-11-22', start: '16:00', end: '17:20', type: 'bus', title: 'Bus a Bilbao', trip: 'b1' },
  { id: 'e24', day: '2026-11-22', start: '17:45', end: '', type: 'checkin', title: 'Check-in en Bilbao', stay: 'bilbao' },
  { id: 'e25', day: '2026-11-22', start: '20:30', end: '22:00', type: 'meal', title: 'Plaza Nueva y paseo por el Casco Viejo', city: 'bilbao' },
  // Lun 23
  { id: 'e32', day: '2026-11-23', start: '11:00', end: '', type: 'checkout', title: 'Check-out en Bilbao', stay: 'bilbao' },
  { id: 'e33', day: '2026-11-23', start: '11:15', end: '12:50', type: 'visit', title: 'Mercado de la Ribera y Siete Calles', city: 'bilbao' },
  { id: 'e34', day: '2026-11-23', start: '13:32', end: '16:41', type: 'train', title: 'Tren a Santander', trip: 't4' },
  { id: 'e36', day: '2026-11-23', start: '17:10', end: '', type: 'checkin', title: 'Check-in en Santander', stay: 'santander' },
  { id: 'e38', day: '2026-11-23', start: '18:15', end: '19:30', type: 'visit', title: 'Paseo por El Sardinero', city: 'santander' },
  { id: 'e39', day: '2026-11-23', start: '20:30', end: '22:00', type: 'meal', title: 'Rabas: Bodega Cigaleña o Cañadío', city: 'santander' },
  // Mar 24
  { id: 'e42', day: '2026-11-24', start: '12:00', end: '', type: 'checkout', title: 'Check-out en Santander', stay: 'santander' },
  { id: 'e43', day: '2026-11-24', start: '12:30', end: '14:45', type: 'visit', title: 'Paseo de Pereda, Centro Botín, Catedral, Mercado de la Esperanza', city: 'santander' },
  { id: 'e44', day: '2026-11-24', start: '15:28', end: '21:01', type: 'train', title: 'Tren a Oviedo (llevar comida)', trip: 't5' },
  { id: 'e46', day: '2026-11-24', start: '21:15', end: '', type: 'checkin', title: 'Check-in en Oviedo', stay: 'oviedo' },
  { id: 'e47', day: '2026-11-24', start: '21:30', end: '23:00', type: 'meal', title: 'Sidrería en la Gascona', city: 'oviedo' },
  // Mié 25
  { id: 'e52', day: '2026-11-25', start: '11:00', end: '', type: 'checkout', title: 'Check-out en Oviedo', stay: 'oviedo' },
  { id: 'e53', day: '2026-11-25', start: '11:15', end: '13:30', type: 'visit', title: 'Catedral, Fontán y Trascorrales', city: 'oviedo' },
  { id: 'e54', day: '2026-11-25', start: '13:30', end: '14:45', type: 'meal', title: 'Menú del día en la Gascona', city: 'oviedo' },
  { id: 'e55', day: '2026-11-25', start: '15:30', end: '20:15', type: 'bus', title: 'Bus a A Coruña', trip: 'b2' },
  { id: 'e57', day: '2026-11-25', start: '20:40', end: '', type: 'checkin', title: 'Check-in en A Coruña', stay: 'coruna' },
  { id: 'e58', day: '2026-11-25', start: '21:15', end: '22:30', type: 'meal', title: 'Tapas en Franja y Barrera', city: 'coruna' },
  // Jue 26
  { id: 'e62', day: '2026-11-26', start: '14:00', end: '15:00', type: 'meal', title: 'Mercado de San Agustín', city: 'coruna' },
  { id: 'e63', day: '2026-11-26', start: '15:00', end: '18:00', type: 'visit', title: 'Torre de Hércules, paseo marítimo y María Pita', city: 'coruna' },
  { id: 'e65', day: '2026-11-26', start: '21:00', end: '22:30', type: 'meal', title: 'Cena en Franja y Barrera', city: 'coruna' },
  // Vie 27
  { id: 'e71', day: '2026-11-27', start: '08:00', end: '', type: 'checkout', title: 'Check-out y taxi al aeropuerto', stay: 'coruna' },
  { id: 'e74', day: '2026-11-27', start: '10:45', end: '12:15', type: 'flight', title: 'Vuelo a Valencia', trip: 'f1' },
  { id: 'e75', day: '2026-11-27', start: '13:00', end: '', type: 'note', title: 'Dejar la mochila en el alojamiento' },
  { id: 'e77', day: '2026-11-27', start: '16:00', end: '', type: 'checkin', title: 'Check-in en Valencia', stay: 'valencia' },
  { id: 'e78', day: '2026-11-27', start: '16:15', end: '19:30', type: 'visit', title: 'Lonja, plaza de la Virgen, Catedral, Torres de Serranos', city: 'valencia' },
  { id: 'e79', day: '2026-11-27', start: '20:30', end: '22:00', type: 'meal', title: 'Bar Pilar o La Pilareta', city: 'valencia' },
  // Sáb 28
  { id: 'e80', day: '2026-11-28', start: '10:45', end: '', type: 'checkout', title: 'Check-out (dejar la mochila)', stay: 'valencia' },
  { id: 'e81', day: '2026-11-28', start: '11:00', end: '14:00', type: 'visit', title: 'Mercado Central, Jardín del Turia, Ciudad de las Artes', city: 'valencia' },
  { id: 'e82', day: '2026-11-28', start: '14:00', end: '15:30', type: 'meal', title: 'Menú del día en Russafa', city: 'valencia' },
  { id: 'e83', day: '2026-11-28', start: '16:45', end: '', type: 'note', title: 'Recoger la mochila y comprar cena para el tren' },
  { id: 'e84', day: '2026-11-28', start: '17:45', end: '22:15', type: 'train', title: 'Tren a Vila-seca', trip: 't6' },
];

/* Las tareas (pagos, avisos a alojamientos y al equipo) llegan con el JSON privado. */
const SEED_TASKS = [];

/* Fichas de ciudad. Visitas, comida, historia y curiosidades son orientativas. */
const CITIES = {
  donostia: {
    name: 'Donostia-San Sebastián', days: 'Vie 20 a dom 22 (dos noches)', stay: ['donostia1', 'donostia2'],
    see: ['Playa de la Concha y paseo', 'Peine del Viento de Chillida', 'Parte Vieja y Mercado de La Bretxa', 'Monte Urgull y el puerto', 'Palacio de Miramar y sus jardines', 'Museo San Telmo (comprobar horario)', 'Funicular de Monte Igueldo (comprobar horario de invierno)', 'Barrio de Gros y playa de Zurriola'],
    eat: ['Bergara Bar (Gros)', 'La Cuchara de San Telmo (Parte Vieja)', 'Pintxos en la calle 31 de Agosto'],
    history: [
      'Las tropas angloportuguesas la incendiaron en 1813 durante la guerra contra Napoleón. La calle 31 de Agosto fue de las pocas que se salvaron, y de ahí viene su nombre.',
      'En el siglo XIX, la estancia de la reina María Cristina la convirtió en destino de veraneo de la corte.',
      'El Palacio de Miramar y el de Ayete son de esa época dorada.',
    ],
    facts: [
      'El funicular de Igueldo funciona desde 1912.',
      'Tiene una de las mayores concentraciones de estrellas Michelin por habitante del mundo.',
      'El Peine del Viento, de Eduardo Chillida, se instaló en 1977.',
    ],
  },
  bilbao: {
    name: 'Bilbao', days: 'Dom 22 y lun 23', stay: 'bilbao',
    see: ['Casco Viejo y las Siete Calles', 'Mercado de la Ribera', 'Catedral de Santiago', 'Zubizuri y la ría', 'Guggenheim por fuera (suele cerrar los lunes en temporada baja: comprobar)'],
    eat: ['Plaza Nueva: Café Bar Bilbao, Gure Toki', 'Pintxos en la Ribera o la calle Somera'],
    history: [
      'Don Diego López de Haro la fundó en 1300 junto a la ría del Nervión.',
      'El hierro de Vizcaya y los astilleros la convirtieron en un gran centro industrial en el siglo XIX.',
      'El Guggenheim, abierto en 1997, dio nombre al «efecto Guggenheim» de regeneración urbana.',
    ],
    facts: [
      'El Mercado de la Ribera es uno de los mercados cubiertos más grandes de Europa.',
      'El metro, diseñado por Norman Foster, tiene unas entradas de cristal que se llaman «fosteritos».',
      'Las Siete Calles son el núcleo original de la villa.',
    ],
  },
  santander: {
    name: 'Santander', days: 'Lun 23 y mar 24', stay: 'santander',
    see: ['El Sardinero', 'Península de la Magdalena y su palacio', 'Paseo de Pereda', 'Centro Botín (exterior y miradores)', 'Catedral', 'Mercado de la Esperanza'],
    eat: ['Rabas en Bodega Cigaleña', 'Bares de la plaza Cañadío'],
    history: [
      'En 1941 un gran incendio destruyó buena parte del centro histórico, y la ciudad se reconstruyó con un trazado nuevo.',
      'El Palacio de la Magdalena se construyó para Alfonso XIII entre 1909 y 1912 y hoy alberga cursos de verano de la UIMP.',
      'En 1893 explotó el vapor Cabo Machichaco en el puerto. Murieron cientos de personas.',
    ],
    facts: [
      'El Centro Botín es obra de Renzo Piano y está suspendido sobre el agua.',
      'Las rabas son calamar o pota rebozados. Es la tapa local por excelencia.',
      'Desde la Magdalena a veces se ven focas y pingüinos en el pequeño zoo marino.',
    ],
  },
  oviedo: {
    name: 'Oviedo', days: 'Mar 24 y mié 25', stay: 'oviedo',
    see: ['Catedral de San Salvador y la Cámara Santa', 'Casco antiguo y plaza del Fontán', 'Plaza de Trascorrales', 'Santa María del Naranco, a 3 km (comprobar horario y reserva)', 'Estatua de Woody Allen'],
    eat: ['Sidrería en la calle Gascona: cachopo y sidra', 'El Raitán en Trascorrales', 'Raciones en el Fontán'],
    history: [
      'Fue la capital del reino de Asturias en el siglo IX, con Alfonso II el Casto.',
      'El prerrománico asturiano, con Santa María del Naranco y San Miguel de Lillo, es Patrimonio de la Humanidad.',
      'En 1934 la revolución de Asturias dañó la Cámara Santa y la universidad.',
    ],
    facts: [
      'La sidra se escancia desde arriba para que se oxigene, y se bebe un culín de una vez.',
      'Desde Oviedo empezó el Camino Primitivo a Santiago.',
      'La calle Gascona se llama el «Bulevar de la Sidra».',
    ],
  },
  coruna: {
    name: 'A Coruña', days: 'Mié 25 a vie 27', stay: 'coruna',
    see: ['Torre de Hércules (comprobar horario)', 'Paseo marítimo', 'Ciudad Vieja', 'Plaza de María Pita', 'Galerías de la avenida de la Marina', 'Jardines de Méndez Núñez'],
    eat: ['Calles Franja y Barrera', 'Mercado de San Agustín'],
    history: [
      'La Torre de Hércules es un faro romano del siglo I-II y el único de esa época que sigue en funcionamiento. Es Patrimonio de la Humanidad.',
      'En 1589 María Pita encabezó la defensa de la ciudad contra la armada inglesa de Drake.',
      'Fue uno de los puertos de salida de la emigración gallega a América.',
    ],
    facts: [
      'Las galerías acristaladas de la Marina le valieron el nombre de «ciudad de cristal».',
      'El paseo marítimo pasa de 13 km y es de los más largos de Europa.',
      'Las farolas del paseo están hechas con material de los antiguos tranvías.',
    ],
  },
  valencia: {
    name: 'València', days: 'Vie 27 y sáb 28', stay: 'valencia',
    see: ['Mercado Central (cierra hacia las 15:00)', 'Lonja de la Seda', 'Plaza de la Virgen', 'Catedral y Miguelete', 'Torres de Serranos', 'Jardín del Turia', 'Ciudad de las Artes y las Ciencias por fuera', 'Playa de la Malvarrosa'],
    eat: ['Bar Pilar (mejillones)', 'La Pilareta (almejas y bocadillos)', 'Horchata y fartons: Horchatería Daniel o Santa Catalina', 'Menú del día en Russafa'],
    history: [
      'Los romanos la fundaron como Valentia en el 138 a. C.',
      'Jaime I la conquistó en 1238 y fue la capital del Reino de Valencia.',
      'Tras la riada de 1957 se desvió el Turia. El antiguo cauce es hoy un jardín de 9 km.',
    ],
    facts: [
      'La Lonja de la Seda, del siglo XV, es Patrimonio de la Humanidad.',
      'Desde hace más de mil años, el Tribunal de las Aguas se reúne los jueves a mediodía en la puerta de los Apóstoles de la Catedral.',
      'La Catedral guarda un cáliz que la tradición identifica con el Santo Grial.',
    ],
  },
};
