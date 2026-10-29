const pool = require('../config/db');

/**
 * Registro de auditoria. Acepta un cliente de transaccion para que el rastro
 * se confirme o se revierta junto con la operacion que lo origino.
 */

const ACCIONES = {
  LOGIN:             'LOGIN',
  LOGIN_FALLIDO:     'LOGIN_FALLIDO',
  LOGOUT:            'LOGOUT',
  TOKEN_RENOVADO:    'TOKEN_RENOVADO',
  TOKEN_REUSADO:     'TOKEN_REUSADO',
  CREAR:             'CREAR',
  ACTUALIZAR:        'ACTUALIZAR',
  ELIMINAR:          'ELIMINAR',
  APROBAR:           'APROBAR',
  RECHAZAR:          'RECHAZAR',
  CANCELAR:          'CANCELAR',
  BAJA_EMPLEADO:     'BAJA_EMPLEADO',
  RESET_PASSWORD:    'RESET_PASSWORD',
  CAMBIO_ESTADO:     'CAMBIO_ESTADO',
  AJUSTE_VACACIONES: 'AJUSTE_VACACIONES',
  SUBIR_DOCUMENTO:   'SUBIR_DOCUMENTO',
};

const ipDe = (req) => {
  const cruda = req?.ip || req?.socket?.remoteAddress || null;
  return cruda ? String(cruda).replace(/^::ffff:/, '').slice(0, 45) : null;
};

/** Nunca lanza: un fallo al auditar no debe tumbar la operacion del usuario. */
async function registrar(req, { accion, tabla = null, registro_id = null, detalle = null, id_usuario }, cliente = pool) {
  try {
    const usuario = id_usuario !== undefined ? id_usuario : req?.usuario?.id ?? null;
    await cliente.query(
      `INSERT INTO auditoria (id_usuario, accion, tabla, registro_id, detalle, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuario, accion, tabla, registro_id, detalle ? JSON.stringify(detalle) : null, ipDe(req)]
    );
  } catch (err) {
    console.error('[auditoria] no se pudo registrar:', err.message);
  }
}

async function consultar({ limite = 50, desplazamiento = 0, accion, tabla, id_usuario, desde, hasta } = {}) {
  const cond = [];
  const par = [];
  const add = (sql, valor) => { par.push(valor); cond.push(sql.replace('?', `$${par.length}`)); };

  if (accion)     add('a.accion = ?', accion);
  if (tabla)      add('a.tabla = ?', tabla);
  if (id_usuario) add('a.id_usuario = ?', id_usuario);
  if (desde)      add('a.creado_en >= ?', desde);
  if (hasta)      add('a.creado_en < (?::date + 1)', hasta);

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  par.push(Math.min(Number(limite) || 50, 200), Number(desplazamiento) || 0);

  // El CASE evita que el cast falle si el detalle guarda algo no numerico.
  const { rows } = await pool.query(
    `SELECT a.id, a.accion, a.tabla, a.registro_id, a.detalle, a.ip, a.creado_en,
            u.username, u.rol,
            COALESCE(e.nombres || ' ' || e.apellidos, u.username) AS responsable,
            afec.nombres || ' ' || afec.apellidos AS empleado_afectado
       FROM auditoria a
       LEFT JOIN usuarios  u ON u.id = a.id_usuario
       LEFT JOIN empleados e ON e.id = u.id_empleado
       LEFT JOIN empleados afec ON afec.id = CASE
              WHEN a.detalle->>'id_empleado' ~ '^[0-9]+$'
              THEN (a.detalle->>'id_empleado')::int END
       ${where}
       ORDER BY a.creado_en DESC, a.id DESC
       LIMIT $${par.length - 1} OFFSET $${par.length}`,
    par
  );

  const total = await pool.query(
    `SELECT COUNT(*)::int AS n FROM auditoria a ${where}`, par.slice(0, par.length - 2));

  return { total: total.rows[0].n, registros: rows };
}

module.exports = { ACCIONES, registrar, consultar, ipDe };
