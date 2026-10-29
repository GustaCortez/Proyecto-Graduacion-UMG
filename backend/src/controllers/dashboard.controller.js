const pool = require('../config/db');
const { resumenInstitucional } = require('./expediente.controller');

const getDashboard = async (req, res) => {
  try {
    const esEmpleado = req.usuario.rol === 'empleado';

    if (esEmpleado) {
      const [misResumen, misRecientes] = await Promise.all([
        pool.query(
          `SELECT estado, COUNT(*) AS total
           FROM solicitudes
           WHERE id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $1)
           GROUP BY estado`,
          [req.usuario.id]
        ),
        pool.query(
          `SELECT v.* FROM v_solicitudes v
           JOIN solicitudes s ON s.id = v.id
           WHERE s.id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $1)
           ORDER BY v.creado_en DESC LIMIT 5`,
          [req.usuario.id]
        ),
      ]);
      return res.json({
        resumen_solicitudes:   misResumen.rows,
        solicitudes_recientes: misRecientes.rows,
      });
    }

    const [solicitudes, empleados, recientes, expediente] = await Promise.all([
      pool.query('SELECT * FROM v_dashboard_solicitudes'),
      pool.query(`SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE estado='Activo') AS activos
                  FROM empleados`),
      pool.query(`SELECT * FROM v_solicitudes ORDER BY creado_en DESC LIMIT 5`),
      // Avisos IGSS pendientes, evaluaciones faltantes, etc. (migracion 007).
      resumenInstitucional(),
    ]);
    res.json({
      resumen_solicitudes:   solicitudes.rows,
      total_empleados:       empleados.rows[0],
      solicitudes_recientes: recientes.rows,
      expediente,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener dashboard.' });
  }
};

module.exports = { getDashboard };