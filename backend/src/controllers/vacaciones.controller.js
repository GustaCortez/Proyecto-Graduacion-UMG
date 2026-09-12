const pool = require('../config/db');
const { asegurarRegistroAnual, diasPorAntiguedad, explicacion, ARTICULO } = require('../utils/vacaciones');
const auditoria = require('../services/auditoria');

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

/** Verifica que un empleado solo consulte su propio expediente. */
async function puedeVer(req, idEmpleado) {
  if (esRRHH(req)) return true;
  const { rows } = await pool.query(
    'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
  const propio = rows[0] ? rows[0].id_empleado : null;
  return propio !== null && String(propio) === String(idEmpleado);
}

/** Saldo de todos los empleados activos para el ano en curso (vista de RRHH). */
const getVacaciones = async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  try {
    const result = await pool.query(
      `SELECT v.id, v.anio,
              v.dias_asignados  AS dias_disponibles,
              v.dias_tomados    AS dias_usados,
              (v.dias_asignados - v.dias_tomados) AS saldo,
              TO_CHAR(v.derecho_desde, 'YYYY-MM-DD') AS derecho_desde,
              e.id AS id_empleado, e.nombres, e.apellidos,
              e.codigo_empleado,
              TO_CHAR(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso,
              d.nombre AS departamento,
              (v.derecho_desde IS NOT NULL AND v.derecho_desde <= CURRENT_DATE) AS derecho_vigente
         FROM vacaciones v
         JOIN empleados e ON v.id_empleado = e.id
         LEFT JOIN departamentos d ON e.id_departamento = d.id
        WHERE e.estado = 'Activo' AND v.anio = $1
        ORDER BY e.apellidos, e.nombres`, [anio]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener vacaciones.' });
  }
};

/** Todos los anos registrados de un empleado. */
const getVacacionesPorEmpleado = async (req, res) => {
  const { id_empleado } = req.params;
  try {
    if (!(await puedeVer(req, id_empleado))) {
      return res.status(403).json({ error: 'Solo puede consultar sus propias vacaciones.' });
    }

    const result = await pool.query(
      `SELECT v.id, v.anio,
              v.dias_asignados  AS dias_disponibles,
              v.dias_tomados    AS dias_usados,
              (v.dias_asignados - v.dias_tomados) AS saldo,
              TO_CHAR(v.derecho_desde, 'YYYY-MM-DD') AS derecho_desde,
              (v.derecho_desde IS NOT NULL AND v.derecho_desde <= CURRENT_DATE) AS derecho_vigente,
              e.nombres, e.apellidos, e.codigo_empleado,
              TO_CHAR(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso
         FROM vacaciones v
         JOIN empleados e ON v.id_empleado = e.id
        WHERE v.id_empleado = $1
        ORDER BY v.anio DESC`, [id_empleado]);

    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener vacaciones del empleado.' });
  }
};

/**
 * Historial de vacaciones efectivamente gozadas, con fechas de inicio y fin.
 * Sale de las solicitudes de vacaciones aprobadas, que son las que descuentan saldo.
 */
const getHistorial = async (req, res) => {
  const { id_empleado } = req.params;
  try {
    if (!(await puedeVer(req, id_empleado))) {
      return res.status(403).json({ error: 'Solo puede consultar su propio historial.' });
    }

    const result = await pool.query(
      `SELECT s.id AS id_solicitud,
              EXTRACT(YEAR FROM s.fecha_inicio)::int AS anio,
              TO_CHAR(s.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
              TO_CHAR(COALESCE(s.fecha_fin, s.fecha_inicio), 'YYYY-MM-DD') AS fecha_fin,
              s.dias_habiles, s.dias_descontados, s.estado, s.motivo,
              s.comentario_rrhh,
              TO_CHAR(s.fecha_revision, 'YYYY-MM-DD HH24:MI') AS fecha_revision,
              COALESCE(er.nombres || ' ' || er.apellidos, ur.username) AS revisado_por
         FROM solicitudes s
         JOIN tipos_solicitud t ON t.id = s.id_tipo
         LEFT JOIN usuarios  ur ON ur.id = s.id_revisado_por
         LEFT JOIN empleados er ON er.id = ur.id_empleado
        WHERE s.id_empleado = $1
          AND t.nombre ILIKE 'vacaciones'
        ORDER BY s.fecha_inicio DESC`, [id_empleado]);

    const emp = await pool.query(
      `SELECT nombres || ' ' || apellidos AS empleado, codigo_empleado,
              TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso
         FROM empleados WHERE id = $1`, [id_empleado]);

    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const gozadas = result.rows.filter((r) => r.estado === 'Aprobada');
    res.json({
      empleado: emp.rows[0],
      total_periodos: gozadas.length,
      total_dias_gozados: gozadas.reduce((n, r) => n + (r.dias_descontados || 0), 0),
      base_legal: ARTICULO,
      historial: result.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener el historial de vacaciones.' });
  }
};

/** Saldo del empleado autenticado, sin que tenga que conocer su id. */
const getMiSaldo = async (req, res) => {
  try {
    const u = await pool.query(
      'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
    const idEmpleado = u.rows[0] ? u.rows[0].id_empleado : null;
    if (!idEmpleado) {
      return res.status(400).json({ error: 'Su usuario no esta ligado a un expediente de empleado.' });
    }

    const anio = new Date().getFullYear();
    const cli = await pool.connect();
    let vac;
    try {
      vac = await asegurarRegistroAnual(cli, idEmpleado, anio);
    } finally {
      cli.release();
    }

    const emp = await pool.query(
      `SELECT TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso FROM empleados WHERE id = $1`,
      [idEmpleado]);
    const ingreso = emp.rows[0].fecha_ingreso;

    res.json({
      id_empleado: idEmpleado,
      anio,
      dias_asignados: vac.dias_asignados,
      dias_tomados: vac.dias_tomados,
      saldo: vac.dias_asignados - vac.dias_tomados,
      derecho_desde: vac.derecho_desde,
      derecho_vigente: !!vac.derecho_desde && new Date(vac.derecho_desde) <= new Date(),
      explicacion: explicacion(ingreso, anio),
      base_legal: ARTICULO,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener su saldo de vacaciones.' });
  }
};

/** Ajuste manual del saldo por parte de RRHH. Queda auditado. */
const actualizarSaldo = async (req, res) => {
  const { id } = req.params;
  const { dias_disponibles, dias_usados } = req.body;

  if (dias_disponibles === undefined && dias_usados === undefined) {
    return res.status(400).json({ error: 'Proporcione dias_disponibles o dias_usados.' });
  }
  for (const [campo, valor] of [['dias_disponibles', dias_disponibles], ['dias_usados', dias_usados]]) {
    if (valor !== undefined && (isNaN(Number(valor)) || Number(valor) < 0)) {
      return res.status(400).json({ error: `El campo ${campo} debe ser un numero mayor o igual a 0.` });
    }
  }

  try {
    const previo = await pool.query(
      'SELECT id, id_empleado, anio, dias_asignados, dias_tomados FROM vacaciones WHERE id = $1', [id]);
    if (previo.rows.length === 0) {
      return res.status(404).json({ error: 'Registro de vacaciones no encontrado.' });
    }
    const antes = previo.rows[0];

    const nuevosAsignados = dias_disponibles !== undefined ? Number(dias_disponibles) : antes.dias_asignados;
    const nuevosTomados = dias_usados !== undefined ? Number(dias_usados) : antes.dias_tomados;
    if (nuevosTomados > nuevosAsignados) {
      return res.status(400).json({
        error: `Los dias usados (${nuevosTomados}) no pueden superar los asignados (${nuevosAsignados}).`,
      });
    }

    const result = await pool.query(
      `UPDATE vacaciones SET dias_asignados = $1, dias_tomados = $2
        WHERE id = $3
       RETURNING id, anio,
                 dias_asignados AS dias_disponibles,
                 dias_tomados   AS dias_usados,
                 (dias_asignados - dias_tomados) AS saldo`,
      [nuevosAsignados, nuevosTomados, id]);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.AJUSTE_VACACIONES,
      tabla: 'vacaciones',
      registro_id: Number(id),
      detalle: {
        id_empleado: antes.id_empleado, anio: antes.anio,
        antes: { dias_asignados: antes.dias_asignados, dias_tomados: antes.dias_tomados },
        despues: { dias_asignados: nuevosAsignados, dias_tomados: nuevosTomados },
      },
    });

    res.json({ mensaje: 'Saldo de vacaciones actualizado.', vacaciones: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar vacaciones.' });
  }
};

/**
 * Regenera los registros del ano segun el art. 44 b) para todos los empleados
 * activos. Util al inicio de cada ano; es idempotente y no toca dias_tomados.
 */
const generarAnio = async (req, res) => {
  const anio = Number(req.body.anio) || new Date().getFullYear();
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const empleados = await cli.query(
      `SELECT id, nombres || ' ' || apellidos AS empleado,
              TO_CHAR(fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso
         FROM empleados WHERE estado = 'Activo' ORDER BY id`);

    const generados = [];
    for (const e of empleados.rows) {
      const existia = await cli.query(
        'SELECT 1 FROM vacaciones WHERE id_empleado = $1 AND anio = $2', [e.id, anio]);
      const vac = await asegurarRegistroAnual(cli, e.id, anio);
      generados.push({
        id_empleado: e.id, empleado: e.empleado,
        dias_asignados: vac.dias_asignados,
        nuevo: existia.rowCount === 0,
        detalle: explicacion(e.fecha_ingreso, anio),
      });
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'vacaciones',
      detalle: { anio, empleados: generados.length, nuevos: generados.filter((g) => g.nuevo).length },
    }, cli);

    await cli.query('COMMIT');
    res.json({
      mensaje: `Registros de vacaciones ${anio} generados.`,
      anio,
      nuevos: generados.filter((g) => g.nuevo).length,
      total: generados.length,
      base_legal: ARTICULO,
      detalle: generados,
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    res.status(500).json({ error: 'Error al generar los registros de vacaciones.' });
  } finally {
    cli.release();
  }
};

/** Cuantos dias le tocarian a una fecha de ingreso dada. Sirve para previsualizar en el alta. */
const simular = async (req, res) => {
  const { fecha_ingreso, anio } = req.query;
  if (!fecha_ingreso || isNaN(Date.parse(fecha_ingreso))) {
    return res.status(400).json({ error: 'Indique una fecha_ingreso valida (YYYY-MM-DD).' });
  }
  const a = Number(anio) || new Date().getFullYear();
  res.json({
    fecha_ingreso, anio: a,
    dias_asignados: diasPorAntiguedad(fecha_ingreso, a),
    explicacion: explicacion(fecha_ingreso, a),
    base_legal: ARTICULO,
  });
};

module.exports = {
  getVacaciones, getVacacionesPorEmpleado, getHistorial, getMiSaldo,
  actualizarSaldo, generarAnio, simular,
};
