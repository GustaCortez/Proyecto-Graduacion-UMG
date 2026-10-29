/**
 * Crea (o restablece) la cuenta de administrador inicial.
 *
 * Existe para que el repositorio NO contenga ninguna contrasena ni su hash: el
 * seed.sql trae solo catalogos, y la primera credencial la define quien instala
 * el sistema. La contrasena se pide por variable de entorno y nunca se imprime.
 *
 * Uso:
 *   ADMIN_PASSWORD="MiClaveSegura2026" node scripts/crear-admin.js
 *   ADMIN_PASSWORD="..." ADMIN_USER=rrhh ADMIN_ROL=rrhh node scripts/crear-admin.js
 *
 * En PowerShell:
 *   $env:ADMIN_PASSWORD="MiClaveSegura2026"; node scripts/crear-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');

const USUARIO = process.env.ADMIN_USER || 'admin';
const ROL     = process.env.ADMIN_ROL  || 'admin';
const CLAVE   = process.env.ADMIN_PASSWORD;

const ROLES = ['admin', 'rrhh', 'empleado'];
const LONGITUD_MINIMA = 8;

function validar() {
  if (!CLAVE) {
    return 'Falta ADMIN_PASSWORD.\n'
         + '  bash:       ADMIN_PASSWORD="MiClaveSegura2026" node scripts/crear-admin.js\n'
         + '  PowerShell: $env:ADMIN_PASSWORD="MiClaveSegura2026"; node scripts/crear-admin.js';
  }
  if (CLAVE.length < LONGITUD_MINIMA) {
    return `La contrasena debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (!/[A-Za-z]/.test(CLAVE) || !/[0-9]/.test(CLAVE)) {
    return 'La contrasena debe combinar letras y numeros.';
  }
  if (!ROLES.includes(ROL)) {
    return `ADMIN_ROL invalido (${ROL}). Use: ${ROLES.join(', ')}.`;
  }
  return null;
}

(async () => {
  const error = validar();
  if (error) {
    console.error(`\n[cancelado] ${error}\n`);
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(CLAVE, 10);

    // Si la cuenta ya existe se le restablece la contrasena y se reactiva:
    // sirve tanto para instalar como para recuperar el acceso perdido.
    const { rows } = await pool.query(
      `INSERT INTO usuarios (username, password_hash, rol, activo)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             rol           = EXCLUDED.rol,
             activo        = TRUE
       RETURNING id, username, rol, (xmax = 0) AS creado`,
      [USUARIO, hash, ROL]);

    const u = rows[0];

    // Una contrasena nueva debe invalidar las sesiones abiertas con la anterior.
    const { rowCount: sesiones } = await pool.query(
      `UPDATE refresh_tokens SET revocado_en = NOW()
        WHERE id_usuario = $1 AND revocado_en IS NULL`, [u.id]);

    console.log(`\nUsuario "${u.username}" (rol ${u.rol}) ${u.creado ? 'creado' : 'actualizado'}.`);
    if (sesiones > 0) console.log(`Se cerraron ${sesiones} sesion(es) abiertas.`);
    console.log('La contrasena no se muestra ni queda registrada. Guardela en un lugar seguro.\n');
  } catch (err) {
    console.error('\nError al crear el usuario:', err.message, '\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
