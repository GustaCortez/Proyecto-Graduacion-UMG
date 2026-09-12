const crypto = require('crypto');
const pool   = require('../config/db');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const auditoria = require('../services/auditoria');
require('dotenv').config();

/**
 * Autenticación con token de acceso corto + refresh token rotativo.
 *
 * Antes el JWT duraba 8 horas: si se filtraba, servía 8 horas. Ahora el token
 * de acceso vive pocos minutos y se renueva solo, con un refresh token que:
 *   - se guarda en base de datos como SHA-256 (el valor en claro nunca se almacena),
 *   - rota en cada uso: el anterior queda revocado y enlazado al nuevo,
 *   - si alguien reutiliza uno ya revocado se asume robo y se cierran todas
 *     las sesiones de ese usuario.
 */

const ACCESO_EXPIRA = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_DIAS  = Number(process.env.REFRESH_TOKEN_DAYS) || 7;

const hash = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

const datosToken = (usuario) => ({
  id:        usuario.id,
  username:  usuario.username,
  rol:       usuario.rol,
  nombres:   usuario.nombres || 'Administrador',
  apellidos: usuario.apellidos || '',
});

const firmarAcceso = (usuario) =>
  jwt.sign(datosToken(usuario), process.env.JWT_SECRET, { expiresIn: ACCESO_EXPIRA });

/** Crea un refresh token, guarda solo su hash y devuelve el valor en claro. */
async function emitirRefresh(idUsuario, req, cliente = pool, reemplazaA = null) {
  const enClaro = crypto.randomBytes(48).toString('hex');
  const expira  = new Date(Date.now() + REFRESH_DIAS * 24 * 60 * 60 * 1000);

  const { rows } = await cliente.query(
    `INSERT INTO refresh_tokens (id_usuario, token_hash, expira_en, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [idUsuario, hash(enClaro), expira,
     (req.headers['user-agent'] || '').slice(0, 300), auditoria.ipDe(req)]);

  if (reemplazaA) {
    await cliente.query(
      'UPDATE refresh_tokens SET reemplazado_por = $1 WHERE id = $2', [rows[0].id, reemplazaA]);
  }
  return { token: enClaro, expira, id: rows[0].id };
}

/** Revoca todas las sesiones vivas de un usuario. */
async function revocarTodos(idUsuario, cliente = pool) {
  const { rowCount } = await cliente.query(
    `UPDATE refresh_tokens SET revocado_en = NOW()
      WHERE id_usuario = $1 AND revocado_en IS NULL`, [idUsuario]);
  return rowCount;
}

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
      [username]);

    if (result.rows.length === 0) {
      await auditoria.registrar(req, {
        accion: auditoria.ACCIONES.LOGIN_FALLIDO, tabla: 'usuarios',
        detalle: { username, motivo: 'usuario inexistente o inactivo' }, id_usuario: null });
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const usuario = result.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      await auditoria.registrar(req, {
        accion: auditoria.ACCIONES.LOGIN_FALLIDO, tabla: 'usuarios', registro_id: usuario.id,
        detalle: { username, motivo: 'contraseña incorrecta' }, id_usuario: usuario.id });
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [usuario.id]);

    const refresh = await emitirRefresh(usuario.id, req);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.LOGIN, tabla: 'usuarios', registro_id: usuario.id,
      detalle: { username: usuario.username, rol: usuario.rol }, id_usuario: usuario.id });

    res.json({
      token:        firmarAcceso(usuario),
      refreshToken: refresh.token,
      expira_en:    ACCESO_EXPIRA,
      usuario: {
        id:          usuario.id,
        username:    usuario.username,
        rol:         usuario.rol,
        id_empleado: usuario.id_empleado,
        nombre:      usuario.nombres ? `${usuario.nombres} ${usuario.apellidos}` : 'Administrador',
      },
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/** Canjea un refresh token por uno nuevo más un token de acceso fresco. */
const refrescar = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Falta el refreshToken.' });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    const { rows } = await cli.query(
      `SELECT rt.id, rt.id_usuario, rt.expira_en, rt.revocado_en,
              u.username, u.rol, u.activo, u.id_empleado,
              e.nombres, e.apellidos
         FROM refresh_tokens rt
         JOIN usuarios u ON u.id = rt.id_usuario
         LEFT JOIN empleados e ON e.id = u.id_empleado
        WHERE rt.token_hash = $1
          FOR UPDATE OF rt`,
      [hash(refreshToken)]);

    const fila = rows[0];

    if (!fila) {
      await cli.query('ROLLBACK');
      return res.status(401).json({ error: 'Sesión inválida. Vuelva a iniciar sesión.' });
    }

    // Reúso de un token ya revocado: señal de robo. Se cierran todas las sesiones.
    if (fila.revocado_en) {
      const cerradas = await revocarTodos(fila.id_usuario, cli);
      await auditoria.registrar(req, {
        accion: auditoria.ACCIONES.TOKEN_REUSADO, tabla: 'refresh_tokens', registro_id: fila.id,
        detalle: { motivo: 'refresh token revocado reutilizado', sesiones_cerradas: cerradas },
        id_usuario: fila.id_usuario }, cli);
      await cli.query('COMMIT');
      return res.status(401).json({
        error: 'Se detectó un uso indebido de la sesión. Por seguridad se cerraron todas las sesiones.' });
    }

    if (new Date(fila.expira_en) <= new Date()) {
      await cli.query('ROLLBACK');
      return res.status(401).json({ error: 'La sesión expiró. Vuelva a iniciar sesión.' });
    }

    if (!fila.activo) {
      await revocarTodos(fila.id_usuario, cli);
      await cli.query('COMMIT');
      return res.status(403).json({ error: 'El usuario fue desactivado.' });
    }

    // Rotación: se revoca el actual y se emite uno nuevo enlazado a él.
    await cli.query('UPDATE refresh_tokens SET revocado_en = NOW() WHERE id = $1', [fila.id]);
    const nuevo = await emitirRefresh(fila.id_usuario, req, cli, fila.id);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.TOKEN_RENOVADO, tabla: 'refresh_tokens', registro_id: nuevo.id,
      detalle: { anterior: fila.id }, id_usuario: fila.id_usuario }, cli);

    await cli.query('COMMIT');

    const usuario = {
      id: fila.id_usuario, username: fila.username, rol: fila.rol,
      nombres: fila.nombres, apellidos: fila.apellidos,
    };

    res.json({
      token:        firmarAcceso(usuario),
      refreshToken: nuevo.token,
      expira_en:    ACCESO_EXPIRA,
      usuario: {
        id:          fila.id_usuario,
        username:    fila.username,
        rol:         fila.rol,
        id_empleado: fila.id_empleado,
        nombre:      fila.nombres ? `${fila.nombres} ${fila.apellidos}` : 'Administrador',
      },
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error('Error al refrescar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    cli.release();
  }
};

/** Cierra la sesión actual, o todas si se pide. */
const logout = async (req, res) => {
  const { refreshToken, todas } = req.body || {};
  try {
    if (todas && req.usuario) {
      const n = await revocarTodos(req.usuario.id);
      await auditoria.registrar(req, {
        accion: auditoria.ACCIONES.LOGOUT, tabla: 'refresh_tokens',
        detalle: { alcance: 'todas las sesiones', cerradas: n } });
      return res.json({ mensaje: `Se cerraron ${n} sesión(es).` });
    }

    if (refreshToken) {
      await pool.query(
        `UPDATE refresh_tokens SET revocado_en = NOW()
          WHERE token_hash = $1 AND revocado_en IS NULL`, [hash(refreshToken)]);
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.LOGOUT, tabla: 'refresh_tokens',
      detalle: { alcance: 'sesión actual' } });

    res.json({ mensaje: 'Sesión cerrada.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al cerrar sesión.' });
  }
};

const perfil = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.rol, u.ultimo_acceso, u.id_empleado,
              e.nombres, e.apellidos, e.correo, e.telefono, e.direccion,
              e.codigo_empleado, e.foto_url,
              TO_CHAR(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso,
              e.tipo_contrato,
              d.nombre AS departamento, p.nombre AS puesto
         FROM usuarios u
         LEFT JOIN empleados e ON u.id_empleado = e.id
         LEFT JOIN departamentos d ON e.id_departamento = d.id
         LEFT JOIN puestos       p ON e.id_puesto       = p.id
        WHERE u.id = $1`,
      [req.usuario.id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/** Sesiones activas del usuario, para que pueda revisarlas y cerrarlas. */
const sesiones = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_agent, ip, creado_en, expira_en
         FROM refresh_tokens
        WHERE id_usuario = $1 AND revocado_en IS NULL AND expira_en > NOW()
        ORDER BY creado_en DESC`, [req.usuario.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las sesiones.' });
  }
};

module.exports = { login, refrescar, logout, perfil, sesiones };
