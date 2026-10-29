const { Pool, types } = require('pg');
require('dotenv').config();

/**
 * Conexion a PostgreSQL. Admite las dos formas:
 *
 *   DATABASE_URL=postgres://usuario:clave@host/base?sslmode=require
 *     Es lo que entregan los servicios en la nube (Neon, Render, Railway).
 *
 *   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
 *     Variables sueltas, comodo para desarrollo local.
 *
 * Si hay DATABASE_URL tiene prioridad, para que al desplegar no haya que
 * desarmar la cadena en cinco variables.
 */

const usaUrl = !!process.env.DATABASE_URL;

/**
 * Las columnas DATE llegan como texto 'YYYY-MM-DD' en vez de un Date a la
 * medianoche del servidor. Con el servidor en UTC (Render) ese Date, al
 * serializarse a JSON, caia en el dia anterior para Guatemala (UTC-6) y el
 * frontend mostraba las fechas corridas un dia. Un DATE no tiene hora ni zona,
 * asi que el texto es la representacion fiel. TIMESTAMPTZ no se toca.
 */
types.setTypeParser(types.builtins.DATE, (v) => v);

/**
 * TLS. Con DATABASE_URL (servidor gestionado) se exige y se verifica el
 * certificado: Neon y Render presentan certificados de autoridades que Node ya
 * trae, asi que la verificacion funciona sin configurar nada. Solo si un
 * proveedor usara un certificado propio se puede relajar con DB_SSL_INSECURE=1,
 * a sabiendas de que eso permite un intermediario en la conexion.
 *
 * En local no se usa TLS salvo que se pida con DB_SSL=true; DB_SSL=false lo
 * apaga incluso con DATABASE_URL (por ejemplo un tunel ya cifrado).
 */
const conTls = process.env.DB_SSL === 'false'
  ? false
  : (usaUrl || process.env.DB_SSL === 'true');

const ssl = conTls
  ? { rejectUnauthorized: process.env.DB_SSL_INSECURE !== '1' }
  : false;

/**
 * Limites del pool: 10 conexiones bastan para esta carga y caben en el plan
 * gratuito de Neon; el tiempo de espera evita que una base dormida o una red
 * caida dejen la peticion colgada indefinidamente.
 */
const limites = { max: 10, connectionTimeoutMillis: 10000 };

const pool = new Pool(usaUrl
  ? { connectionString: process.env.DATABASE_URL, ssl, ...limites }
  : {
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
      ...limites,
    });

// El pool abre y cierra conexiones todo el tiempo; el aviso interesa una sola vez.
let avisado = false;
pool.on('connect', () => {
  if (avisado) return;
  avisado = true;
  console.log('Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Error en la base de datos:', err.message);
});

module.exports = pool;
