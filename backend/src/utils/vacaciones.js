const { aISO } = require('./dias');

/**
 * Ley de Servicio Municipal (Decreto 1-87), art. 44 inciso b):
 *   - menos de 1 ano de servicio continuo -> 0 dias (no hay derecho aun)
 *   - de 1 a 4 anos  -> 20 dias habiles
 *   - de 5 anos en adelante -> 25 dias habiles
 *   - el saldo NO se acumula de ano en ano
 */
const DIAS_PRIMER_QUINQUENIO = 20;
const DIAS_DESPUES_DE_5_ANIOS = 25;
const ARTICULO = 'Ley de Servicio Municipal (Decreto 1-87), art. 44 inciso b)';

/** Anos cumplidos al llegar el aniversario que cae dentro de `anio`. */
function aniosDeServicio(fechaIngreso, anio) {
  const [aIngreso] = aISO(fechaIngreso).split('-').map(Number);
  return anio - aIngreso;
}

function fechaDerecho(fechaIngreso, anio) {
  const [, mes, dia] = aISO(fechaIngreso).split('-');
  return `${anio}-${mes}-${dia}`;
}

function diasPorAntiguedad(fechaIngreso, anio) {
  const anios = aniosDeServicio(fechaIngreso, anio);
  if (anios < 1) return 0;
  return anios >= 5 ? DIAS_DESPUES_DE_5_ANIOS : DIAS_PRIMER_QUINQUENIO;
}

function explicacion(fechaIngreso, anio) {
  const anios = aniosDeServicio(fechaIngreso, anio);
  const dias = diasPorAntiguedad(fechaIngreso, anio);
  if (anios < 1) {
    return `Aún no cumple un año de servicio continuo (ingreso ${aISO(fechaIngreso)}), por lo que todavía no adquiere el derecho. ${ARTICULO}`;
  }
  return `${anios} año(s) de servicio continuo al ${fechaDerecho(fechaIngreso, anio)}: ${dias} días hábiles. ${ARTICULO}`;
}

const COLUMNAS_VACACIONES =
  `id, id_empleado, anio, dias_asignados, dias_tomados,
   TO_CHAR(derecho_desde, 'YYYY-MM-DD') AS derecho_desde`;

/** Fila de vacaciones de un empleado en un anio, o undefined si no existe. */
async function registroAnual(cliente, idEmpleado, anio) {
  const { rows } = await cliente.query(
    `SELECT ${COLUMNAS_VACACIONES} FROM vacaciones WHERE id_empleado = $1 AND anio = $2`,
    [idEmpleado, anio]);
  return rows[0];
}

/**
 * Devuelve el registro de vacaciones del anio, creandolo con los dias que
 * marca la ley si aun no existe. Si ya existe se devuelve TAL CUAL: consultar
 * un saldo nunca debe pisar un ajuste manual de RRHH (PATCH /vacaciones/:id/saldo)
 * ni dejar dias_asignados por debajo de dias_tomados (chk_dias). El recalculo
 * de dias_asignados solo lo hace generarAnio, de forma explicita.
 * Idempotente: se apoya en UNIQUE (id_empleado, anio).
 */
async function asegurarRegistroAnual(cliente, idEmpleado, anio = new Date().getFullYear()) {
  const emp = await cliente.query(
    `SELECT id, TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso FROM empleados WHERE id = $1`,
    [idEmpleado]
  );
  if (emp.rows.length === 0) return null;

  const ingreso = emp.rows[0].fecha_ingreso;
  const dias = diasPorAntiguedad(ingreso, anio);

  await cliente.query(
    `INSERT INTO vacaciones (id_empleado, anio, dias_asignados, dias_tomados, derecho_desde)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (id_empleado, anio) DO NOTHING`,
    [idEmpleado, anio, dias, dias > 0 ? fechaDerecho(ingreso, anio) : null]
  );
  return registroAnual(cliente, idEmpleado, anio);
}

module.exports = {
  DIAS_PRIMER_QUINQUENIO, DIAS_DESPUES_DE_5_ANIOS, ARTICULO, COLUMNAS_VACACIONES,
  aniosDeServicio, fechaDerecho, diasPorAntiguedad, explicacion, asegurarRegistroAnual, registroAnual,
};
