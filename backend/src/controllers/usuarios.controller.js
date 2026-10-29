const pool   = require('../config/db');
const bcrypt = require('bcrypt');
const auditoria = require('../services/auditoria');

const ROLES = ['admin', 'rrhh', 'empleado'];
const LONGITUD_MINIMA = 8;

/**
 * Administracion de cuentas. Solo el rol admin llega aqui (ver soloAdmin).
 * Tres reglas transversales:
 *   1. Toda operacion queda auditada: son las acciones que permiten tomar el
 *      control del sistema, asi que sin bitacora no hay no repudio.
 *   2. Cambiar la contrasena o desactivar una cuenta revoca sus refresh tokens;
 *      de lo contrario una sesion robada seguiria viva hasta 7 dias despues.
 *   3. El admin no puede quitarse a si mismo el rol ni desactivarse: dejaria al
 *      sistema sin ningun administrador.
 */

/** Valida la contrasena. Devuelve un mensaje de error, o null si es aceptable. */
function validarPassword(password) {
  if (!password || password.length < LONGITUD_MINIMA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  return null;
}

/** Cierra todas las sesiones abiertas de un usuario. */
async function revocarSesiones(idUsuario) {
  const { rowCount } = await pool.query(
    `UPDATE refresh_tokens SET revocado_en = NOW()
      WHERE id_usuario = $1 AND revocado_en IS NULL`, [idUsuario]);
  return rowCount;
}

const getUsuarios = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.rol, u.activo, u.ultimo_acceso,
              e.nombres, e.apellidos, e.correo
       FROM usuarios u
       LEFT JOIN empleados e ON u.id_empleado = e.id
       ORDER BY u.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
};

const crearUsuario = async (req, res) => {
  const { username, password, rol, id_empleado } = req.body;

  if (!username || !password || !rol) {
    return res.status(400).json({ error: 'username, password y rol son requeridos.' });
  }
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido. Use: admin, rrhh o empleado.' });
  }
  const errorPassword = validarPassword(password);
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword });
  }

  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'El username ya está en uso.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (username, password_hash, rol, id_empleado)
       VALUES ($1, $2, $3, $4) RETURNING id, username, rol, activo`,
      [username, hash, rol, id_empleado || null]
    );

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'usuarios',
      registro_id: result.rows[0].id,
      detalle: { username, rol, id_empleado: id_empleado || null },
    });

    res.status(201).json({ mensaje: 'Usuario creado.', usuario: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
};

const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { rol, id_empleado } = req.body;

  if (rol && !ROLES.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  // Sin esto, el unico admin podria degradarse y dejar el sistema sin administrador.
  if (rol && rol !== 'admin' && Number(id) === req.usuario.id) {
    return res.status(400).json({ error: 'No puede quitarse a usted mismo el rol de administrador.' });
  }

  try {
    const previo = await pool.query('SELECT rol, id_empleado FROM usuarios WHERE id = $1', [id]);
    if (previo.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const result = await pool.query(
      `UPDATE usuarios SET
         rol = COALESCE($1, rol),
         id_empleado = COALESCE($2, id_empleado)
       WHERE id = $3 RETURNING id, username, rol, activo`,
      [rol || null, id_empleado || null, id]
    );
    const usuario = result.rows[0];

    // Cambiar de rol cambia los permisos del token: se fuerza a renovar sesion.
    let sesiones = 0;
    if (rol && rol !== previo.rows[0].rol) sesiones = await revocarSesiones(id);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ACTUALIZAR,
      tabla: 'usuarios',
      registro_id: Number(id),
      detalle: {
        username: usuario.username,
        antes:   { rol: previo.rows[0].rol, id_empleado: previo.rows[0].id_empleado },
        despues: { rol: usuario.rol, id_empleado: id_empleado || previo.rows[0].id_empleado },
        sesiones_cerradas: sesiones,
      },
    });

    res.json({ mensaje: 'Usuario actualizado.', usuario });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
};

const toggleEstado = async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.usuario.id) {
    return res.status(400).json({ error: 'No puede desactivar su propia cuenta.' });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios SET activo = NOT activo WHERE id = $1
       RETURNING id, username, rol, activo`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const u = result.rows[0];

    // Desactivar sin cerrar sesiones dejaria al usuario dentro hasta que venza su token.
    const sesiones = u.activo ? 0 : await revocarSesiones(id);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CAMBIO_ESTADO,
      tabla: 'usuarios',
      registro_id: Number(id),
      detalle: { username: u.username, activo: u.activo, sesiones_cerradas: sesiones },
    });

    res.json({ mensaje: `Usuario ${u.activo ? 'activado' : 'desactivado'}.`, usuario: u });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al cambiar estado.' });
  }
};

const resetPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const errorPassword = validarPassword(password);
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id, username',
      [hash, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // El motivo habitual de un reset es sospecha de robo: la sesion del intruso
    // debe morir con la contrasena vieja.
    const sesiones = await revocarSesiones(id);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.RESET_PASSWORD,
      tabla: 'usuarios',
      registro_id: Number(id),
      detalle: { username: result.rows[0].username, sesiones_cerradas: sesiones },
    });

    res.json({
      mensaje: sesiones > 0
        ? `Contraseña actualizada. Se cerraron ${sesiones} sesión(es) abiertas.`
        : 'Contraseña actualizada.',
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar contraseña.' });
  }
};

module.exports = { getUsuarios, crearUsuario, actualizarUsuario, toggleEstado, resetPassword };
