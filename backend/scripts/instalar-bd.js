/**
 * Instala la base de datos completa en UNA sola corrida. Pensado para una base
 * nueva en la nube (Neon, Render, Railway) donde no hay psql a mano, pero sirve
 * igual en local.
 *
 * Orden que aplica (el mismo que documenta el README, sin pasos manuales):
 *   1. database/schema.sql      solo si la base esta vacia (no existe `usuarios`)
 *   2. database/seed.sql        solo en ese mismo caso (catalogos)
 *   3. migraciones idempotentes  002, 007 y 008 (las demas ya vienen en schema.sql)
 *   4. scripts/migrar.js         migracion 001 + asuetos + saldos de vacaciones,
 *                                solo si la base estaba vacia o aun no tiene
 *                                registros de vacaciones
 *   5. scripts/crear-admin.js    si se definio ADMIN_PASSWORD
 *
 * Uso:
 *   DATABASE_URL="postgres://..." ADMIN_PASSWORD="ClaveSegura2026" node scripts/instalar-bd.js
 *   (o con las variables DB_* del .env en local)
 *
 * Puede volverse a correr sobre una base ya instalada: no duplica ni borra
 * nada. Los saldos de vacaciones existentes no se tocan (si hace falta
 * recalcularlos, usar "Generar año" desde RRHH, que respeta los ajustes
 * manuales), y los asuetos se completan con `node scripts/migrar.js`.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const pool = require('../src/config/db');

const RAIZ_SQL = path.join(__dirname, '..', '..', 'database');
const MIGRACIONES_SUELTAS = [
  '002_departamentos_jalapa.sql',
  '007_expediente_empleado.sql',
  '008_acuerdo_vacaciones.sql',
];

const leer = (...p) => fs.readFileSync(path.join(RAIZ_SQL, ...p), 'utf8');
// Los archivos traen su propio BEGIN/COMMIT; se ejecutan dentro de una sola transaccion.
const sinTransaccion = (sql) => sql.replace(/^\s*BEGIN;\s*$/gm, '').replace(/^\s*COMMIT;\s*$/gm, '');
const titulo = (t) => console.log(`\n${'-'.repeat(72)}\n${t}\n${'-'.repeat(72)}`);

/** Corre un script hijo con el mismo node; si falla, explica que paso y aborta. */
function correrScript(archivo, descripcion) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, archivo)], { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n[instalacion incompleta] Fallo ${archivo} (${descripcion}).`);
    console.error(`   Codigo de salida: ${err.status === undefined ? err.message : err.status}.`);
    console.error('   Los pasos anteriores ya quedaron aplicados; corrija la causa (revise el');
    console.error(`   mensaje de arriba) y vuelva a ejecutar: node scripts/${archivo}\n`);
    process.exit(1);
  }
}

(async () => {
  const cli = await pool.connect();
  let baseVacia;
  let hayVacaciones = false;
  try {
    const { rows } = await cli.query(
      `SELECT to_regclass('public.usuarios') IS NOT NULL AS existe`);
    baseVacia = !rows[0].existe;

    await cli.query('BEGIN');

    titulo('1. Estructura base (schema.sql)');
    if (baseVacia) {
      await cli.query(leer('schema.sql'));
      // schema.sql (pg_dump) deja search_path vacio; los demas archivos usan nombres sin esquema.
      await cli.query('SET search_path TO public');
      console.log('   Tablas, vistas e indices creados.');
      titulo('2. Catalogos (seed.sql)');
      // seed.sql trae su propio BEGIN/COMMIT; sin quitarlos, su COMMIT cerraria la
      // transaccion externa y un ROLLBACK posterior ya no revertiria nada.
      await cli.query(sinTransaccion(leer('seed.sql')));
      console.log('   Departamentos, puestos y tipos de solicitud cargados.');
    } else {
      console.log('   La base ya tiene estructura; se omiten schema.sql y seed.sql.');
    }

    titulo('3. Migraciones');
    for (const archivo of MIGRACIONES_SUELTAS) {
      await cli.query(sinTransaccion(leer('migrations', archivo)));
      console.log(`   ${archivo} aplicada.`);
    }

    if (!baseVacia) {
      // En dos consultas: si la tabla no existiera, un SELECT directo abortaria la transaccion.
      const tabla = await cli.query(`SELECT to_regclass('public.vacaciones') IS NOT NULL AS existe`);
      if (tabla.rows[0].existe) {
        const vac = await cli.query('SELECT EXISTS (SELECT 1 FROM vacaciones) AS hay');
        hayVacaciones = vac.rows[0].hay === true;
      }
    }

    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error('\n[instalacion cancelada]', err.message, '\n');
    process.exit(1);
  } finally {
    cli.release();
    await pool.end();
  }

  // Los dos scripts restantes abren su propia conexion; se corren como procesos.
  titulo('4. Asuetos y saldos de vacaciones (migrar.js)');
  if (baseVacia || !hayVacaciones) {
    correrScript('migrar.js', 'asuetos y saldos iniciales de vacaciones');
  } else {
    console.log('   La base ya tiene registros de vacaciones; se omite para no tocar los saldos.');
    console.log('   Si necesita completar los asuetos nacionales: node scripts/migrar.js');
  }

  if (process.env.ADMIN_PASSWORD) {
    titulo('5. Cuenta de administrador (crear-admin.js)');
    correrScript('crear-admin.js', 'cuenta de administrador');
  } else {
    titulo('5. Cuenta de administrador');
    console.log('   ADMIN_PASSWORD no definido; cree la cuenta despues con:');
    console.log('   ADMIN_PASSWORD="ClaveSegura2026" node scripts/crear-admin.js');
  }

  console.log('\nBase de datos lista.\n');
})();
