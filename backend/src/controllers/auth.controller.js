const pool   = require('../config/db');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
require('dotenv').config();

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, e.nombres, e.apellidos
       FROM usuarios u
       LEFT JOIN empleados e ON u.id_empleado = e.id
       WHERE u.username = $1 AND u.activo = TRUE`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const usuario = result.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    // Actualizar último acceso
    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1',
      [usuario.id]
    );

    const token = jwt.sign(
      {
        id:       usuario.id,
        username: usuario.username,
        rol:      usuario.rol,
        nombres:  usuario.nombres || 'Administrador',
        apellidos:usuario.apellidos || '',
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id:       usuario.id,
        username: usuario.username,
        rol:      usuario.rol,
        nombre:   usuario.nombres ? `${usuario.nombres} ${usuario.apellidos}` : 'Administrador',
      }
    });

  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const perfil = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.rol, u.ultimo_acceso, u.id_empleado,
              e.nombres, e.apellidos, e.correo, e.telefono
       FROM usuarios u
       LEFT JOIN empleados e ON u.id_empleado = e.id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { login, perfil };