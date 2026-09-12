const pool = require('../config/db');

/** Convierte un DATE de PostgreSQL o un string a 'YYYY-MM-DD' sin corrimiento de zona horaria. */
const aISO = (v) => {
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Construye una fecha en UTC a partir de 'YYYY-MM-DD' para operar sin zona horaria. */
const aUTC = (iso) => {
  const [a, m, d] = aISO(iso).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const sumarDias = (fecha, n) => {
  const x = new Date(fecha);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

const isoDeUTC = (d) => d.toISOString().slice(0, 10);

/**
 * Domingo de Pascua (algoritmo de Meeus/Jones/Butcher para el calendario gregoriano).
 * Sirve para derivar Jueves Santo, Viernes Santo y Sabado de Gloria, que son moviles.
 */
function domingoPascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Asuetos de fecha fija en Guatemala (Codigo de Trabajo art. 127 y Ley de Servicio Civil). */
const ASUETOS_FIJOS = [
  ['01-01', 'Año Nuevo'],
  ['05-01', 'Día del Trabajo'],
  ['06-30', 'Día del Ejército'],
  ['09-15', 'Día de la Independencia'],
  ['10-20', 'Día de la Revolución de 1944'],
  ['11-01', 'Día de Todos los Santos'],
  ['12-25', 'Navidad'],
];

/** Devuelve los asuetos nacionales de un ano: los fijos mas los moviles de Semana Santa. */
function asuetosNacionales(anio) {
  const pascua = domingoPascua(anio);
  return [
    ...ASUETOS_FIJOS.map(([md, nombre]) => ({ fecha: `${anio}-${md}`, nombre })),
    { fecha: isoDeUTC(sumarDias(pascua, -3)), nombre: 'Jueves Santo' },
    { fecha: isoDeUTC(sumarDias(pascua, -2)), nombre: 'Viernes Santo' },
    { fecha: isoDeUTC(sumarDias(pascua, -1)), nombre: 'Sábado de Gloria' },
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/**
 * Cuenta los dias HABILES entre dos fechas, ambas inclusive.
 * Excluye sabados, domingos y los asuetos activos registrados en dias_feriados.
 * La Ley de Servicio Municipal (art. 44 b) mide las vacaciones en dias habiles.
 */
async function contarDiasHabiles(inicio, fin, cliente = pool) {
  const desde = aISO(inicio);
  const hasta = aISO(fin || inicio);
  if (hasta < desde) return 0;

  const { rows } = await cliente.query(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha
       FROM dias_feriados
      WHERE activo = TRUE AND fecha BETWEEN $1 AND $2`,
    [desde, hasta]
  );
  const asuetos = new Set(rows.map((r) => r.fecha));

  let habiles = 0;
  const limite = aUTC(hasta);
  for (let d = aUTC(desde); d <= limite; d = sumarDias(d, 1)) {
    const diaSemana = d.getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    if (asuetos.has(isoDeUTC(d))) continue;
    habiles++;
  }
  return habiles;
}

/** Detalle dia por dia del rango. Se usa para explicar al empleado por que se descontaron N dias. */
async function detalleDiasHabiles(inicio, fin, cliente = pool) {
  const desde = aISO(inicio);
  const hasta = aISO(fin || inicio);
  const { rows } = await cliente.query(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, nombre
       FROM dias_feriados
      WHERE activo = TRUE AND fecha BETWEEN $1 AND $2`,
    [desde, hasta]
  );
  const asuetos = new Map(rows.map((r) => [r.fecha, r.nombre]));
  const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const detalle = [];
  const limite = aUTC(hasta);
  for (let d = aUTC(desde); d <= limite; d = sumarDias(d, 1)) {
    const iso = isoDeUTC(d);
    const dow = d.getUTCDay();
    const asueto = asuetos.get(iso);
    detalle.push({
      fecha: iso,
      dia_semana: NOMBRES[dow],
      habil: dow !== 0 && dow !== 6 && !asueto,
      motivo: asueto ? asueto : dow === 0 || dow === 6 ? 'Fin de semana' : null,
    });
  }
  return detalle;
}

module.exports = {
  aISO, aUTC, isoDeUTC, sumarDias,
  domingoPascua, asuetosNacionales,
  contarDiasHabiles, detalleDiasHabiles,
};
