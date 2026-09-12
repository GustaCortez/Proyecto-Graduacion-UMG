const pool   = require('../config/db');
const bcrypt = require('bcrypt');

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
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
};

const crearUsuario = async (req, res) => {
  const { username, password, rol, id_empleado } = req.body;

  if (!username || !password || !rol) {
    return res.status(400).json({ error: 'username, password y rol son requeridos.' });
  }
  if (!['admin', 'rrhh', 'empleado'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido. Use: admin, rrhh o empleado.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
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
    res.status(201).json({ mensaje: 'Usuario creado.', usuario: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
};

const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { rol, id_empleado } = req.body;

  if (rol && !['admin', 'rrhh', 'empleado'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE usuarios SET
         rol = COALESCE($1, rol),
         id_empleado = COALESCE($2, id_empleado)
       WHERE id = $3 RETURNING id, username, rol, activo`,
      [rol || null, id_empleado || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ mensaje: 'Usuario actualizado.', usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
};

const toggleEstado = async (req, res) => {
  const { id } = req.params;
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
    res.json({ mensaje: `Usuario ${u.activo ? 'activado' : 'desactivado'}.`, usuario: u });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar estado.' });
  }
};

const resetPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
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
    res.json({ mensaje: 'Contraseña actualizada.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar contraseña.' });
  }
};

module.exports = { getUsuarios, crearUsuario, actualizarUsuario, toggleEstado, resetPassword };
