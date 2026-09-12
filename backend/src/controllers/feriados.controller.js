const pool = require('../config/db');
const { asuetosNacionales } = require('../utils/dias');
const auditoria = require('../services/auditoria');

/**
 * Administracion de asuetos.
 *
 * Hace falta porque la Ley de Servicio Municipal mide las vacaciones en DIAS
 * HABILES: sin saber que dias son asueto no se puede descontar bien el saldo.
 * La feria titular de cada municipio se agrega aqui como tipo "Municipal".
 */

const listar = async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  try {
    const { rows } = await pool.query(
      `SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, nombre, tipo, activo
         FROM dias_feriados
        WHERE EXTRACT(YEAR FROM fecha) = $1
        ORDER BY fecha`, [anio]);
    res.json({ anio, total: rows.length, feriados: rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener los asuetos.' });
  }
};

const crear = async (req, res) => {
  const { fecha, nombre, tipo } = req.body;

  if (!fecha || isNaN(Date.parse(fecha))) {
    return res.status(400).json({ error: 'Indique una fecha valida (YYYY-MM-DD).' });
  }
  if (!nombre || nombre.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres.' });
  }
  const tipoFinal = tipo || 'Municipal';
  if (!['Nacional', 'Municipal'].includes(tipoFinal)) {
    return res.status(400).json({ error: 'El tipo debe ser Nacional o Municipal.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO dias_feriados (fecha, nombre, tipo) VALUES ($1, $2, $3)
       ON CONFLICT (fecha) DO NOTHING
       RETURNING id, TO_CHAR(fecha,'YYYY-MM-DD') AS fecha, nombre, tipo, activo`,
      [fecha, nombre.trim(), tipoFinal]);

    if (rows.length === 0) {
      return res.status(409).json({ error: 'Ya existe un asueto registrado en esa fecha.' });
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'dias_feriados',
      registro_id: rows[0].id,
      detalle: rows[0],
    });

    res.status(201).json({ mensaje: 'Asueto registrado.', feriado: rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al registrar el asueto.' });
  }
};

const alternarEstado = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE dias_feriados SET activo = NOT activo WHERE id = $1
       RETURNING id, TO_CHAR(fecha,'YYYY-MM-DD') AS fecha, nombre, tipo, activo`,
      [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Asueto no encontrado.' });

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CAMBIO_ESTADO,
      tabla: 'dias_feriados',
      registro_id: Number(req.params.id),
      detalle: rows[0],
    });

    res.json({
      mensaje: `Asueto ${rows[0].activo ? 'activado' : 'desactivado'}.`,
      feriado: rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar el estado del asueto.' });
  }
};

const eliminar = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM dias_feriados WHERE id = $1
       RETURNING TO_CHAR(fecha,'YYYY-MM-DD') AS fecha, nombre`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Asueto no encontrado.' });

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ELIMINAR,
      tabla: 'dias_feriados',
      registro_id: Number(req.params.id),
      detalle: rows[0],
    });

    res.json({ mensaje: 'Asueto eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el asueto.' });
  }
};

/** Carga los asuetos nacionales de un ano (Semana Santa incluida, calculada). */
const generarNacionales = async (req, res) => {
  const anio = Number(req.body.anio) || new Date().getFullYear();
  try {
    let nuevos = 0;
    for (const f of asuetosNacionales(anio)) {
      const r = await pool.query(
        `INSERT INTO dias_feriados (fecha, nombre, tipo) VALUES ($1, $2, 'Nacional')
         ON CONFLICT (fecha) DO NOTHING RETURNING id`, [f.fecha, f.nombre]);
      if (r.rowCount) nuevos++;
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'dias_feriados',
      detalle: { anio, generados: nuevos },
    });

    res.json({ mensaje: `${nuevos} asueto(s) nacional(es) cargados para ${anio}.`, anio, nuevos });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al generar los asuetos.' });
  }
};

module.exports = { listar, crear, alternarEstado, eliminar, generarNacionales };
