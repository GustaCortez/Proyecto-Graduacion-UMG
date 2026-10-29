const pool = require('../config/db');
const sse = require('./sse');

/**
 * Guarda la notificacion en base de datos (para que no se pierda si el usuario
 * no estaba conectado) y la empuja por SSE a las pestanas conectadas.
 */

async function usuarioDeEmpleado(idEmpleado, cliente = pool) {
  const { rows } = await cliente.query(
    'SELECT id FROM usuarios WHERE id_empleado = $1 AND activo = TRUE', [idEmpleado]);
  return rows[0]?.id ?? null;
}

async function usuariosRRHH(cliente = pool) {
  const { rows } = await cliente.query(
    `SELECT id FROM usuarios WHERE activo = TRUE AND rol IN ('admin','rrhh')`);
  return rows.map((r) => r.id);
}

/** `cliente` permite incluirla en la transaccion que la origina. */
async function notificar({ id_usuario, titulo, mensaje, id_solicitud = null }, cliente = pool) {
  if (!id_usuario) return null;

  const { rows } = await cliente.query(
    `INSERT INTO notificaciones (id_usuario, titulo, mensaje, id_solicitud)
     VALUES ($1, $2, $3, $4)
     RETURNING id, titulo, mensaje, leida, id_solicitud, creado_en`,
    [id_usuario, titulo, mensaje, id_solicitud]
  );
  const noti = rows[0];

  // El push se emite en el commit: si la transaccion se revierte, no debe avisar.
  return { ...noti, _destino: id_usuario };
}

function emitirPendientes(notificaciones = []) {
  for (const n of notificaciones.filter(Boolean)) {
    const { _destino, ...datos } = n;
    sse.emitir(_destino, 'notificacion', datos);
  }
}

async function listar(idUsuario, { soloNoLeidas = false, limite = 30 } = {}) {
  const { rows } = await pool.query(
    `SELECT n.id, n.titulo, n.mensaje, n.leida, n.id_solicitud, n.creado_en,
            t.nombre AS tipo_solicitud, s.estado AS estado_solicitud
       FROM notificaciones n
       LEFT JOIN solicitudes     s ON s.id = n.id_solicitud
       LEFT JOIN tipos_solicitud t ON t.id = s.id_tipo
      WHERE n.id_usuario = $1 ${soloNoLeidas ? 'AND n.leida = FALSE' : ''}
      ORDER BY n.creado_en DESC
      LIMIT $2`,
    [idUsuario, Math.min(Number(limite) || 30, 100)]
  );
  return rows;
}

async function contarNoLeidas(idUsuario) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM notificaciones WHERE id_usuario = $1 AND leida = FALSE',
    [idUsuario]);
  return rows[0].n;
}

async function marcarLeida(idUsuario, idNotificacion) {
  const { rowCount } = await pool.query(
    'UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND id_usuario = $2',
    [idNotificacion, idUsuario]);
  return rowCount > 0;
}

async function marcarTodasLeidas(idUsuario) {
  const { rowCount } = await pool.query(
    'UPDATE notificaciones SET leida = TRUE WHERE id_usuario = $1 AND leida = FALSE',
    [idUsuario]);
  return rowCount;
}

module.exports = {
  usuarioDeEmpleado, usuariosRRHH, notificar, emitirPendientes,
  listar, contarNoLeidas, marcarLeida, marcarTodasLeidas,
};
