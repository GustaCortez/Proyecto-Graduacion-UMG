const pool = require('../config/db');
const ExcelJS = require('exceljs');
const {
  asegurarRegistroAnual, registroAnual, diasPorAntiguedad, fechaDerecho, explicacion,
  ARTICULO, COLUMNAS_VACACIONES,
} = require('../utils/vacaciones');
const { siguienteDiaHabil, esFechaISO } = require('../utils/dias');
const auditoria = require('../services/auditoria');

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

async function puedeVer(req, idEmpleado) {
  if (esRRHH(req)) return true;
  const { rows } = await pool.query(
    'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
  const propio = rows[0] ? rows[0].id_empleado : null;
  return propio !== null && String(propio) === String(idEmpleado);
}

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

/** Historial de periodos gozados: sale de las solicitudes aprobadas. */
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

const getMiSaldo = async (req, res) => {
  try {
    const u = await pool.query(
      'SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
    const idEmpleado = u.rows[0] ? u.rows[0].id_empleado : null;
    if (!idEmpleado) {
      return res.status(400).json({ error: 'Su usuario no está ligado a un expediente de empleado.' });
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

const actualizarSaldo = async (req, res) => {
  const { id } = req.params;
  const { dias_disponibles, dias_usados } = req.body;

  if (dias_disponibles === undefined && dias_usados === undefined) {
    return res.status(400).json({ error: 'Proporcione los días disponibles o los días usados.' });
  }
  for (const [campo, valor] of [['dias_disponibles', dias_disponibles], ['dias_usados', dias_usados]]) {
    if (valor !== undefined && (isNaN(Number(valor)) || Number(valor) < 0)) {
      return res.status(400).json({ error: `El campo ${campo} debe ser un número mayor o igual a 0.` });
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
        error: `Los días usados (${nuevosTomados}) no pueden superar los asignados (${nuevosAsignados}).`,
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
 * Genera los registros del anio (art. 44 b) para los empleados activos. Es el
 * UNICO punto del sistema que recalcula dias_asignados:
 *   - sin registro: se crea con los dias que marca la ley;
 *   - con registro ajustado a mano por RRHH (consta en auditoria como
 *     AJUSTE_VACACIONES): se conserva tal cual;
 *   - con registro sin ajuste manual: se recalculan dias_asignados y
 *     derecho_desde, nunca por debajo de los dias ya gozados (chk_dias).
 * dias_tomados no se modifica en ningun caso. Idempotente.
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
      const existente = await registroAnual(cli, e.id, anio);
      let vac;
      let resultado;

      if (!existente) {
        vac = await asegurarRegistroAnual(cli, e.id, anio);
        resultado = 'creado';
      } else {
        const ajuste = await cli.query(
          `SELECT 1 FROM auditoria
            WHERE tabla = 'vacaciones' AND accion = $1 AND registro_id = $2 LIMIT 1`,
          [auditoria.ACCIONES.AJUSTE_VACACIONES, existente.id]);
        if (ajuste.rows.length > 0) {
          vac = existente;
          resultado = 'ajustado manualmente por RRHH; se conserva';
        } else {
          const dias = diasPorAntiguedad(e.fecha_ingreso, anio);
          const { rows } = await cli.query(
            `UPDATE vacaciones
                SET dias_asignados = GREATEST($1::int, dias_tomados), derecho_desde = $2
              WHERE id = $3
              RETURNING ${COLUMNAS_VACACIONES}`,
            [dias, dias > 0 ? fechaDerecho(e.fecha_ingreso, anio) : null, existente.id]);
          vac = rows[0];
          resultado = vac.dias_asignados === existente.dias_asignados ? 'sin cambios' : 'recalculado';
        }
      }

      generados.push({
        id_empleado: e.id, empleado: e.empleado,
        dias_asignados: vac.dias_asignados,
        dias_tomados: vac.dias_tomados,
        nuevo: resultado === 'creado',
        resultado,
        detalle: explicacion(e.fecha_ingreso, anio),
      });
    }

    const contar = (r) => generados.filter((g) => g.resultado === r).length;
    const resumen = {
      anio, empleados: generados.length,
      nuevos: contar('creado'), recalculados: contar('recalculado'),
      conservados: generados.length - contar('creado') - contar('recalculado'),
    };

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'vacaciones',
      detalle: resumen,
    }, cli);

    await cli.query('COMMIT');
    res.json({
      mensaje: `Registros de vacaciones ${anio} generados.`,
      anio,
      nuevos: resumen.nuevos,
      recalculados: resumen.recalculados,
      conservados: resumen.conservados,
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

const simular = async (req, res) => {
  const { fecha_ingreso, anio } = req.query;
  if (!esFechaISO(fecha_ingreso)) {
    return res.status(400).json({ error: 'Indique una fecha de ingreso válida (YYYY-MM-DD).' });
  }
  const a = Number(anio) || new Date().getFullYear();
  res.json({
    fecha_ingreso, anio: a,
    dias_asignados: diasPorAntiguedad(fecha_ingreso, a),
    explicacion: explicacion(fecha_ingreso, a),
    base_legal: ARTICULO,
  });
};

/** 2026-03-09 -> 09/03/2026 (formato que usa RRHH en su control). */
const ddmmaaaa = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/**
 * Control anual de vacaciones en Excel, con las mismas columnas del libro que
 * RRHH llevaba a mano: No., nombre, ingreso, periodo, cargo, libro, folio,
 * acuerdo, fecha de salida y fecha de entrada (primer dia habil de regreso).
 * Una fila por vacacion APROBADA que inicia en el anio pedido.
 */
const controlAnual = async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  try {
    const { rows } = await pool.query(
      `SELECT e.nombres, e.apellidos,
              TO_CHAR(e.fecha_ingreso, 'YYYY-MM-DD') AS ingreso,
              COALESCE(v.anio, EXTRACT(YEAR FROM s.fecha_inicio)::int) AS periodo,
              p.nombre AS cargo, s.libro, s.folio, s.numero_acuerdo,
              TO_CHAR(s.fecha_inicio, 'YYYY-MM-DD') AS salida,
              TO_CHAR(COALESCE(s.fecha_fin, s.fecha_inicio), 'YYYY-MM-DD') AS ultimo_dia
         FROM solicitudes s
         JOIN tipos_solicitud t ON t.id = s.id_tipo AND t.nombre ILIKE 'vacaciones'
         JOIN empleados e ON e.id = s.id_empleado
         JOIN puestos p ON p.id = e.id_puesto
         LEFT JOIN vacaciones v ON v.id = s.id_vacaciones
        WHERE s.estado = 'Aprobada'
          AND EXTRACT(YEAR FROM s.fecha_inicio) = $1
        ORDER BY s.fecha_inicio, e.apellidos, e.nombres`, [anio]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema de RRHH';
    const ws = wb.addWorksheet(`VACACIONES ${anio}`, { views: [{ state: 'frozen', ySplit: 2 }] });

    const COLS = [
      { header: 'No.',                   key: 'no',      width: 6,  color: 'C0392B' },
      { header: 'NOMBRE Y APELLIDO',     key: 'nombre',  width: 38, color: 'C0392B' },
      { header: 'INGRESO',               key: 'ingreso', width: 12, color: '27AE60' },
      { header: 'PERIODO DE VACACIONES', key: 'periodo', width: 12, color: '27AE60' },
      { header: 'CARGO',                 key: 'cargo',   width: 36, color: '1F4E79' },
      { header: 'LIBRO',                 key: 'libro',   width: 8,  color: '7D3C98' },
      { header: 'FOLIO',                 key: 'folio',   width: 8,  color: '7D3C98' },
      { header: 'ACUERDO',               key: 'acuerdo', width: 11, color: '2E86C1' },
      { header: 'F/ SALIDA',             key: 'salida',  width: 13, color: '48C9B0' },
      { header: 'ENTRADA',               key: 'entrada', width: 13, color: '48C9B0' },
    ];
    ws.columns = COLS.map(({ key, width }) => ({ key, width }));

    ws.mergeCells(1, 1, 1, COLS.length);
    const titulo = ws.getCell(1, 1);
    titulo.value = `VACACIONES ${anio}`;
    titulo.font = { bold: true, size: 14 };
    titulo.alignment = { horizontal: 'center' };
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    ws.getRow(1).height = 24;

    const encabezado = ws.getRow(2);
    COLS.forEach((c, i) => {
      const celda = encabezado.getCell(i + 1);
      celda.value = c.header;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.color } };
      celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    encabezado.height = 30;

    const borde = { style: 'thin', color: { argb: 'FF999999' } };
    let n = 0;
    for (const r of rows) {
      n++;
      const fila = ws.addRow({
        no: n,
        nombre: `${r.nombres} ${r.apellidos}`.toUpperCase(),
        ingreso: ddmmaaaa(r.ingreso),
        periodo: r.periodo,
        cargo: (r.cargo || '').toUpperCase(),
        libro: r.libro || '',
        folio: r.folio || '',
        acuerdo: r.numero_acuerdo || '',
        salida: ddmmaaaa(r.salida),
        entrada: ddmmaaaa(await siguienteDiaHabil(r.ultimo_dia)),
      });
      fila.font = { size: 9 };
      fila.eachCell({ includeEmpty: true }, (celda, col) => {
        celda.border = { top: borde, left: borde, bottom: borde, right: borde };
        celda.alignment = { horizontal: col === 2 || col === 5 ? 'left' : 'center', vertical: 'middle' };
      });
      // Igual que en el libro de RRHH: en amarillo los que gozan un periodo anterior.
      if (r.periodo < anio) {
        fila.getCell('periodo').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        fila.getCell('periodo').font = { size: 9, bold: true };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VACACIONES ${anio}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al generar el control anual.' });
  }
};

module.exports = {
  getVacaciones, getVacacionesPorEmpleado, getHistorial, getMiSaldo,
  actualizarSaldo, generarAnio, simular, controlAnual,
};
