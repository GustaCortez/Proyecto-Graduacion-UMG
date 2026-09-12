const { aISO } = require('./dias');

/**
 * Regla de vacaciones de la Municipalidad.
 *
 * Ley de Servicio Municipal (Decreto 1-87), articulo 44 inciso b):
 *   "A gozar de un periodo de vacaciones remuneradas por cada ano de servicios
 *    continuos en la forma siguiente: a 20 dias habiles, despues de un ano de
 *    servicios continuos; a 25 dias habiles, despues de 5 anos de servicio
 *    continuos. [...] Las vacaciones no son acumulables de ano en ano [...]"
 *
 * De ahi salen las tres reglas que aplica el sistema:
 *   1. Antes del primer aniversario no se ha adquirido el derecho -> 0 dias.
 *   2. De 1 a 4 anos de servicio -> 20 dias habiles.
 *   3. De 5 anos en adelante     -> 25 dias habiles.
 *   4. El saldo NO se arrastra al ano siguiente.
 */
const DIAS_PRIMER_QUINQUENIO = 20;
const DIAS_DESPUES_DE_5_ANIOS = 25;
const ARTICULO = 'Ley de Servicio Municipal (Decreto 1-87), art. 44 inciso b)';

/** Anos de servicio continuo cumplidos al llegar el aniversario que cae dentro de `anio`. */
function aniosDeServicio(fechaIngreso, anio) {
  const [aIngreso] = aISO(fechaIngreso).split('-').map(Number);
  return anio - aIngreso;
}

/** Fecha en la que el empleado adquiere el derecho a las vacaciones de ese ano (su aniversario). */
function fechaDerecho(fechaIngreso, anio) {
  const [, mes, dia] = aISO(fechaIngreso).split('-');
  return `${anio}-${mes}-${dia}`;
}

/** Dias habiles que le corresponden a un empleado para un ano calendario dado. */
function diasPorAntiguedad(fechaIngreso, anio) {
  const anios = aniosDeServicio(fechaIngreso, anio);
  if (anios < 1) return 0;
  return anios >= 5 ? DIAS_DESPUES_DE_5_ANIOS : DIAS_PRIMER_QUINQUENIO;
}

/** Explicacion legible para mostrar en pantalla y justificar el calculo. */
function explicacion(fechaIngreso, anio) {
  const anios = aniosDeServicio(fechaIngreso, anio);
  const dias = diasPorAntiguedad(fechaIngreso, anio);
  if (anios < 1) {
    return `Aún no cumple un año de servicio continuo (ingreso ${aISO(fechaIngreso)}), por lo que todavía no adquiere el derecho. ${ARTICULO}`;
  }
  return `${anios} año(s) de servicio continuo al ${fechaDerecho(fechaIngreso, anio)}: ${dias} días hábiles. ${ARTICULO}`;
}

/**
 * Crea el registro de vacaciones del ano si no existe y devuelve la fila.
 * Es idempotente: se apoya en UNIQUE (id_empleado, anio).
 */
async function asegurarRegistroAnual(cliente, idEmpleado, anio = new Date().getFullYear()) {
  const emp = await cliente.query(
    `SELECT id, TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso FROM empleados WHERE id = $1`,
    [idEmpleado]
  );
  if (emp.rows.length === 0) return null;

  const ingreso = emp.rows[0].fecha_ingreso;
  const dias = diasPorAntiguedad(ingreso, anio);

  const { rows } = await cliente.query(
    `INSERT INTO vacaciones (id_empleado, anio, dias_asignados, dias_tomados, derecho_desde)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (id_empleado, anio) DO UPDATE
       SET dias_asignados = EXCLUDED.dias_asignados,
           derecho_desde  = EXCLUDED.derecho_desde
     RETURNING *`,
    [idEmpleado, anio, dias, dias > 0 ? fechaDerecho(ingreso, anio) : null]
  );
  return rows[0];
}

module.exports = {
  DIAS_PRIMER_QUINQUENIO, DIAS_DESPUES_DE_5_ANIOS, ARTICULO,
  aniosDeServicio, fechaDerecho, diasPorAntiguedad, explicacion, asegurarRegistroAnual,
};
