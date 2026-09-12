const pool = require('../config/db');

const getMisNotasPago = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT np.id, np.periodo, np.fecha_pago,
              np.salario_base, np.bonificacion, np.horas_extra,
              np.igss, np.otros_descuentos, np.total_neto,
              np.observaciones, np.creado_en
       FROM notas_pago np
       WHERE np.id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $1)
       ORDER BY np.fecha_pago DESC`,
      [req.usuario.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener notas de pago.' });
  }
};

const getNotasPago = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT np.*, e.nombres || ' ' || e.apellidos AS empleado
       FROM notas_pago np
       JOIN empleados e ON np.id_empleado = e.id
       ORDER BY np.fecha_pago DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener notas de pago.' });
  }
};

const crearNotaPago = async (req, res) => {
  const {
    id_empleado, periodo, fecha_pago,
    salario_base, bonificacion, horas_extra,
    igss, otros_descuentos, total_neto, observaciones,
  } = req.body;

  if (!id_empleado || !periodo || !fecha_pago || salario_base == null || total_neto == null) {
    return res.status(400).json({ error: 'Faltan campos requeridos: id_empleado, periodo, fecha_pago, salario_base, total_neto.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO notas_pago
         (id_empleado, periodo, fecha_pago, salario_base, bonificacion,
          horas_extra, igss, otros_descuentos, total_neto, observaciones, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        id_empleado, periodo, fecha_pago,
        salario_base, bonificacion || 0, horas_extra || 0,
        igss || 0, otros_descuentos || 0, total_neto,
        observaciones || null, req.usuario.id,
      ]
    );
    res.status(201).json({ mensaje: 'Nota de pago registrada.', nota: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear nota de pago.' });
  }
};

module.exports = { getMisNotasPago, getNotasPago, crearNotaPago };
