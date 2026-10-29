/**
 * Ejecuta la migracion 001, carga los asuetos nacionales y crea los registros
 * de vacaciones del anio que FALTEN, con los dias que marca la Ley de Servicio
 * Municipal (Decreto 1-87), art. 44 inciso b).
 *
 * Puede volverse a correr: nunca sobrescribe una fila existente de
 * `vacaciones` (ni dias_asignados ni dias_tomados), asi que respeta los
 * ajustes manuales de RRHH y los descuentos ya hechos por el sistema. Los
 * dias tomados solo se reconstruyen para los registros creados en esta misma
 * corrida, a partir de las solicitudes aprobadas que aun no estan ligadas a
 * ningun registro (id_vacaciones nulo).
 *
 * Uso:  node scripts/migrar.js         (aplica)
 *       node scripts/migrar.js --seco  (simula, no escribe nada)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { asuetosNacionales, contarDiasHabiles } = require('../src/utils/dias');
const { diasPorAntiguedad, fechaDerecho, ARTICULO } = require('../src/utils/vacaciones');

/** Id del tipo "Vacaciones" resuelto por nombre: el 1 fijo no esta garantizado en todas las bases. */
async function idTipoVacaciones(cli) {
  const { rows } = await cli.query(
    `SELECT id FROM tipos_solicitud WHERE nombre ILIKE 'vacaciones' ORDER BY id LIMIT 1`);
  return rows[0] ? rows[0].id : null;
}

const SECO = process.argv.includes('--seco');
const ANIO_DESDE = 2024;
const ANIO_HASTA = 2030;

const log = (...a) => console.log(...a);
const titulo = (t) => log(`\n${'-'.repeat(72)}\n${t}\n${'-'.repeat(72)}`);

(async () => {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    titulo('1. Estructura (migracion 001)');
    const sql = fs.readFileSync(
      path.join(__dirname, '..', '..', 'database', 'migrations',
                '001_vacaciones_notificaciones_auditoria.sql'), 'utf8');
    // El archivo ya trae su BEGIN/COMMIT; aqui se ejecuta dentro de la transaccion externa.
    await cli.query(sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, ''));
    log('   Tablas y columnas aplicadas.');

    titulo(`2. Asuetos nacionales ${ANIO_DESDE}-${ANIO_HASTA}`);
    let nuevos = 0;
    for (let a = ANIO_DESDE; a <= ANIO_HASTA; a++) {
      for (const f of asuetosNacionales(a)) {
        const r = await cli.query(
          `INSERT INTO dias_feriados (fecha, nombre, tipo) VALUES ($1, $2, 'Nacional')
           ON CONFLICT (fecha) DO NOTHING RETURNING id`,
          [f.fecha, f.nombre]
        );
        if (r.rowCount) nuevos++;
      }
    }
    log(`   ${nuevos} asuetos insertados (Semana Santa calculada por algoritmo de Pascua).`);
    log('   NOTA: 24 y 31 de diciembre NO se incluyen: la ley los declara asueto');
    log('         "a partir de las 12 horas", o sea medio dia habil. Si la');
    log('         Municipalidad cierra completo, agregalos desde RRHH.');
    log('   NOTA: la feria titular de Jalapa debe agregarse como tipo Municipal.');

    const anioActual = new Date().getFullYear();
    titulo(`3. Vacaciones ${anioActual} segun art. 44 b)`);
    const empleados = await cli.query(
      `SELECT id, nombres || ' ' || apellidos AS emp,
              TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS ingreso, estado
         FROM empleados ORDER BY id`);

    // Solo se crean los registros que faltan. Una fila existente no se toca:
    // puede traer un ajuste manual de RRHH o descuentos ya hechos por el sistema.
    const creados = new Set(); // ids de vacaciones creados en ESTA corrida
    const cambios = [];
    for (const e of empleados.rows) {
      const dias = diasPorAntiguedad(e.ingreso, anioActual);
      const desde = dias > 0 ? fechaDerecho(e.ingreso, anioActual) : null;

      const r = await cli.query(
        `INSERT INTO vacaciones (id_empleado, anio, dias_asignados, dias_tomados, derecho_desde)
         VALUES ($1,$2,$3,0,$4)
         ON CONFLICT (id_empleado, anio) DO NOTHING
         RETURNING id`,
        [e.id, anioActual, dias, desde]);
      const nuevo = r.rows.length > 0;
      if (nuevo) creados.add(r.rows[0].id);

      cambios.push({
        empleado: e.emp.slice(0, 30), ingreso: e.ingreso, estado: e.estado,
        resultado: nuevo ? `creado con ${dias} dias` : 'ya existia (se conserva)',
        derecho_desde: nuevo ? (desde || '(aun no)') : '',
      });
    }
    console.table(cambios);
    log(`   ${creados.size} registro(s) creado(s); ${empleados.rows.length - creados.size} ya existian.`);

    titulo('4. Dias tomados de los registros nuevos, desde solicitudes aprobadas');
    const tipoVac = await idTipoVacaciones(cli);
    const detalle = [];
    const avisos = [];
    if (tipoVac === null) {
      log('   No existe el tipo de solicitud "Vacaciones"; no hay nada que reconstruir.');
    } else {
      // Solo las aprobadas que aun no estan ligadas a un registro de vacaciones:
      // las que ya tienen id_vacaciones ya fueron descontadas por el sistema.
      const aprobadas = await cli.query(
        `SELECT s.id, s.id_empleado, e.nombres || ' ' || e.apellidos AS emp,
                TO_CHAR(s.fecha_inicio,'YYYY-MM-DD') AS inicio,
                TO_CHAR(COALESCE(s.fecha_fin, s.fecha_inicio),'YYYY-MM-DD') AS fin,
                s.dias_solicitados
           FROM solicitudes s
           JOIN empleados e ON e.id = s.id_empleado
          WHERE s.id_tipo = $2 AND s.estado = 'Aprobada'
            AND s.id_vacaciones IS NULL
            AND EXTRACT(YEAR FROM s.fecha_inicio) = $1
          ORDER BY s.id`, [anioActual, tipoVac]);

      for (const s of aprobadas.rows) {
        const vac = await cli.query(
          'SELECT id, dias_asignados, dias_tomados FROM vacaciones WHERE id_empleado=$1 AND anio=$2',
          [s.id_empleado, anioActual]);
        const v = vac.rows[0];
        if (!v) {
          avisos.push(`Solicitud ${s.id} de ${s.emp}: el empleado no tiene registro de vacaciones ${anioActual}.`);
          continue;
        }
        if (!creados.has(v.id)) {
          avisos.push(`Solicitud ${s.id} de ${s.emp}: el registro de vacaciones ya existia y no se modifica. `
            + `Si corresponde descontarla, ajuste el saldo desde RRHH.`);
          continue;
        }

        let habiles;
        try {
          habiles = await contarDiasHabiles(s.inicio, s.fin, cli);
        } catch (e) {
          avisos.push(`Solicitud ${s.id} de ${s.emp}: ${e.message} No se descuenta.`);
          continue;
        }
        const disponible = v.dias_asignados - v.dias_tomados;
        const descontar = Math.min(habiles, disponible);

        if (descontar < habiles) {
          avisos.push(`Solicitud ${s.id} de ${s.emp}: se aprobaron ${habiles} dias habiles pero solo `
            + `le corresponden ${v.dias_asignados}. Se descuentan ${descontar}. `
            + `Fue aprobada sin derecho vigente; la validacion nueva ya no lo permite.`);
        }

        await cli.query(
          `UPDATE solicitudes SET dias_habiles=$1, dias_descontados=$2, id_vacaciones=$3 WHERE id=$4`,
          [habiles, descontar, v.id, s.id]);
        await cli.query(
          'UPDATE vacaciones SET dias_tomados = dias_tomados + $1 WHERE id = $2',
          [descontar, v.id]);

        detalle.push({ solicitud: s.id, empleado: s.emp.slice(0, 28), rango: `${s.inicio} a ${s.fin}`,
          decia: s.dias_solicitados, habiles_reales: habiles, descontados: descontar });
      }
    }
    detalle.length ? console.table(detalle) : log('   (ninguna solicitud aprobada pendiente de descontar)');
    avisos.forEach((a) => log(`   AVISO: ${a}`));

    titulo('5. Saldo final');
    const saldo = await cli.query(
      `SELECT e.nombres || ' ' || e.apellidos AS empleado,
              v.dias_asignados AS asignados, v.dias_tomados AS tomados,
              (v.dias_asignados - v.dias_tomados) AS saldo,
              TO_CHAR(v.derecho_desde,'YYYY-MM-DD') AS derecho_desde
         FROM vacaciones v JOIN empleados e ON e.id = v.id_empleado
        WHERE v.anio = $1 AND e.estado = 'Activo'
        ORDER BY v.dias_asignados DESC, e.apellidos`, [anioActual]);
    console.table(saldo.rows);
    log(`   Base legal: ${ARTICULO}`);

    if (SECO) {
      await cli.query('ROLLBACK');
      log('\n>>> MODO SECO: se revirtio todo, la base quedo igual que antes.');
    } else {
      await cli.query('COMMIT');
      log('\n>>> Migracion aplicada.');
    }
  } catch (err) {
    await cli.query('ROLLBACK');
    console.error('\nERROR, se revirtio todo:', err.message);
    process.exitCode = 1;
  } finally {
    cli.release();
    await pool.end();
  }
})();
