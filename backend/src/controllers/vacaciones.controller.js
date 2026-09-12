const pool = require('../config/db');

const getVacaciones = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.anio,
              v.dias_asignados  AS dias_disponibles,
              v.dias_tomados    AS dias_usados,
              (v.dias_asignados - v.dias_tomados) AS saldo,
              e.id AS id_empleado, e.nombres, e.apellidos,
              e.codigo_empleado, d.nombre AS departamento
       FROM vacaciones v
       JOIN empleados e ON v.id_empleado = e.id
       LEFT JOIN departamentos d ON e.id_departamento = d.id
       WHERE e.estado = 'Activo'
       ORDER BY e.apellidos, e.nombres, v.anio DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener vacaciones.' });
  }
};

const getVacacionesPorEmpleado = async (req, res) => {
  const { id_empleado } = req.params;
  try {
    // Un empleado solo puede consultar sus propias vacaciones
    if (req.usuario.rol === 'empleado') {
      const propio = await pool.query(
        'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]
      );
      if (String(propio.rows[0]?.id_empleado) !== String(id_empleado)) {
        return res.status(403).json({ error: 'Solo puede consultar sus propias vacaciones.' });
      }
    }

    const result = await pool.query(
      `SELECT v.id, v.anio,
              v.dias_asignados  AS dias_disponibles,
              v.dias_tomados    AS dias_usados,
              (v.dias_asignados - v.dias_tomados) AS saldo,
              e.nombres, e.apellidos, e.codigo_empleado
       FROM vacaciones v
       JOIN empleados e ON v.id_empleado = e.id
       WHERE v.id_empleado = $1
       ORDER BY v.anio DESC`,
      [id_empleado]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener vacaciones del empleado.' });
  }
};

const actualizarSaldo = async (req, res) => {
  const { id } = req.params;
  const { dias_disponibles, dias_usados } = req.body;

  if (dias_disponibles === undefined && dias_usados === undefined) {
    return res.status(400).json({ error: 'Proporcione dias_disponibles o dias_usados.' });
  }

  try {
    const result = await pool.query(
      `UPDATE vacaciones SET
         dias_asignados = COALESCE($1, dias_asignados),
         dias_tomados   = COALESCE($2, dias_tomados)
       WHERE id = $3
       RETURNING id, anio,
                 dias_asignados  AS dias_disponibles,
                 dias_tomados    AS dias_usados,
                 (dias_asignados - dias_tomados) AS saldo`,
      [
        dias_disponibles !== undefined ? Number(dias_disponibles) : null,
        dias_usados !== undefined ? Number(dias_usados) : null,
        id
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registro de vacaciones no encontrado.' });
    }
    res.json({ mensaje: 'Saldo de vacaciones actualizado.', vacaciones: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar vacaciones.' });
  }
};

module.exports = { getVacaciones, getVacacionesPorEmpleado, actualizarSaldo };
