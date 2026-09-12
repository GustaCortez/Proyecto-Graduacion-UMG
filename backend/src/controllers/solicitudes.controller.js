const pool = require('../config/db');

const getSolicitudes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM v_solicitudes ORDER BY creado_en DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener solicitudes.' });
  }
};

const getSolicitudById = async (req, res) => {
  const { id } = req.params;
  try {
    // Un empleado solo puede consultar sus propias solicitudes
    if (req.usuario.rol === 'empleado') {
      const propia = await pool.query(
        `SELECT 1 FROM solicitudes
         WHERE id = $1
           AND id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $2)`,
        [id, req.usuario.id]
      );
      if (propia.rows.length === 0) {
        return res.status(404).json({ error: 'Solicitud no encontrada.' });
      }
    }

    const result = await pool.query(
      'SELECT * FROM v_solicitudes WHERE id = $1', [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener solicitud.' });
  }
};

const crearSolicitud = async (req, res) => {
  let { id_empleado, id_tipo, fecha_inicio, fecha_fin, dias_solicitados, motivo } = req.body;

  // Empleados usan su propio id_empleado derivado del token
  if (req.usuario.rol === 'empleado') {
    const emp = await pool.query(
      'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]
    );
    if (!emp.rows[0]?.id_empleado) {
      return res.status(400).json({ error: 'No se encontró el empleado asociado a este usuario.' });
    }
    id_empleado = emp.rows[0].id_empleado;
  }

  if (!id_empleado || !id_tipo || !fecha_inicio || !motivo) {
    return res.status(400).json({ error: 'Los campos id_tipo, fecha_inicio y motivo son requeridos.' });
  }
  if (isNaN(Date.parse(fecha_inicio))) {
    return res.status(400).json({ error: 'El formato de fecha_inicio no es válido (YYYY-MM-DD).' });
  }
  if (fecha_fin && isNaN(Date.parse(fecha_fin))) {
    return res.status(400).json({ error: 'El formato de fecha_fin no es válido (YYYY-MM-DD).' });
  }
  if (fecha_fin && new Date(fecha_fin) < new Date(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha_fin no puede ser anterior a fecha_inicio.' });
  }
  if (dias_solicitados !== undefined && (isNaN(dias_solicitados) || Number(dias_solicitados) < 1)) {
    return res.status(400).json({ error: 'Los dias_solicitados deben ser un número mayor a 0.' });
  }
  if (motivo.trim().length < 10) {
    return res.status(400).json({ error: 'El motivo debe tener al menos 10 caracteres.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO solicitudes
        (id_empleado, id_tipo, fecha_inicio, fecha_fin, dias_solicitados, motivo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id_empleado, id_tipo, fecha_inicio, fecha_fin, dias_solicitados, motivo]
    );
    res.status(201).json({
      mensaje: 'Solicitud creada exitosamente.',
      solicitud: result.rows[0]
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear solicitud.' });
  }
};

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, comentario_rrhh } = req.body;
  const estadosValidos = ['En revision', 'Aprobada', 'Rechazada', 'Cancelada'];

  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE solicitudes SET
        estado=$1, comentario_rrhh=$2,
        id_revisado_por=$3, fecha_revision=NOW()
       WHERE id=$4 RETURNING *`,
      [estado, comentario_rrhh, req.usuario.id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    res.json({ mensaje: `Solicitud ${estado.toLowerCase()}.`, solicitud: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar solicitud.' });
  }
};

const getTipos = async (req, res) => {
  try {
    const soloRRHH = [5, 7, 8]; // Suspension disciplinaria, Alta de empleado, Baja de empleado
    const query = req.usuario.rol === 'empleado'
      ? `SELECT id, nombre, requiere_doc FROM tipos_solicitud WHERE activo=TRUE AND id != ALL($1)`
      : `SELECT id, nombre, requiere_doc FROM tipos_solicitud WHERE activo=TRUE`;
    const params = req.usuario.rol === 'empleado' ? [soloRRHH] : [];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tipos.' });
  }
};

const getMisSolicitudes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.* FROM v_solicitudes v
       JOIN solicitudes s ON s.id = v.id
       WHERE s.id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $1)
       ORDER BY v.creado_en DESC`,
      [req.usuario.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener tus solicitudes.' });
  }
};

module.exports = { getSolicitudes, getSolicitudById, crearSolicitud, actualizarEstado, getTipos, getMisSolicitudes };