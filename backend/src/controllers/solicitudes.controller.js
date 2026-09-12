const pool = require('../config/db');
const { contarDiasHabiles, detalleDiasHabiles, aISO } = require('../utils/dias');
const { asegurarRegistroAnual, ARTICULO } = require('../utils/vacaciones');
const auditoria = require('../services/auditoria');
const notif = require('../services/notificaciones');

const ESTADOS_VALIDOS = ['En revision', 'Aprobada', 'Rechazada', 'Cancelada'];
const TIPOS_SOLO_RRHH = [5, 7, 8]; // Suspension disciplinaria, Alta de empleado, Baja de empleado

const VERBO_ESTADO = {
  'Aprobada': 'aprobada',
  'Rechazada': 'rechazada',
  'Cancelada': 'cancelada',
  'En revision': 'puesta en revisión',
};

/** id del tipo "Vacaciones". Se resuelve por nombre y se cachea. */
let _idTipoVacaciones = null;
async function idTipoVacaciones(cliente = pool) {
  if (_idTipoVacaciones !== null) return _idTipoVacaciones;
  const { rows } = await cliente.query(
    `SELECT id FROM tipos_solicitud WHERE nombre ILIKE 'vacaciones' LIMIT 1`);
  _idTipoVacaciones = rows[0] ? rows[0].id : 1;
  return _idTipoVacaciones;
}

/** empleados.id del usuario autenticado. */
async function empleadoDelUsuario(idUsuario, cliente = pool) {
  const { rows } = await cliente.query(
    'SELECT id_empleado FROM usuarios WHERE id = $1', [idUsuario]);
  return rows[0] ? rows[0].id_empleado : null;
}

// ---------------------------------------------------------------- consultas

const getSolicitudes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, s.dias_habiles, s.dias_descontados,
              (SELECT COUNT(*)::int FROM documentos_adjuntos d WHERE d.id_solicitud = v.id) AS adjuntos
         FROM v_solicitudes v
         JOIN solicitudes s ON s.id = v.id
        ORDER BY v.creado_en DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
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
        [id, req.usuario.id]);
      if (propia.rows.length === 0) {
        return res.status(404).json({ error: 'Solicitud no encontrada.' });
      }
    }

    const result = await pool.query(
      `SELECT v.*, s.dias_habiles, s.dias_descontados
         FROM v_solicitudes v JOIN solicitudes s ON s.id = v.id
        WHERE v.id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    const docs = await pool.query(
      `SELECT id, nombre_archivo, tipo_mime, tamano_bytes, subido_en
         FROM documentos_adjuntos WHERE id_solicitud = $1 ORDER BY subido_en`, [id]);

    res.json(Object.assign({}, result.rows[0], { documentos: docs.rows }));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener solicitud.' });
  }
};

const getMisSolicitudes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, s.dias_habiles, s.dias_descontados,
              (SELECT COUNT(*)::int FROM documentos_adjuntos d WHERE d.id_solicitud = v.id) AS adjuntos
         FROM v_solicitudes v
         JOIN solicitudes s ON s.id = v.id
        WHERE s.id_empleado = (SELECT id_empleado FROM usuarios WHERE id = $1)
        ORDER BY v.creado_en DESC`,
      [req.usuario.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener tus solicitudes.' });
  }
};

const getTipos = async (req, res) => {
  try {
    const query = req.usuario.rol === 'empleado'
      ? `SELECT id, nombre, requiere_doc FROM tipos_solicitud WHERE activo=TRUE AND id != ALL($1)`
      : `SELECT id, nombre, requiere_doc FROM tipos_solicitud WHERE activo=TRUE`;
    const params = req.usuario.rol === 'empleado' ? [TIPOS_SOLO_RRHH] : [];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tipos.' });
  }
};

/**
 * Previsualiza cuantos dias habiles consume un rango antes de enviar la solicitud,
 * para que el empleado vea el descuento exacto y de donde sale.
 */
const previsualizarDias = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  if (!fecha_inicio || isNaN(Date.parse(fecha_inicio))) {
    return res.status(400).json({ error: 'Indique una fecha de inicio válida (YYYY-MM-DD).' });
  }
  if (fecha_fin && isNaN(Date.parse(fecha_fin))) {
    return res.status(400).json({ error: 'El formato de la fecha de fin no es válido (YYYY-MM-DD).' });
  }
  const fin = fecha_fin || fecha_inicio;
  if (aISO(fin) < aISO(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
  }
  try {
    const habiles = await contarDiasHabiles(fecha_inicio, fin);
    const detalle = await detalleDiasHabiles(fecha_inicio, fin);
    res.json({
      fecha_inicio: aISO(fecha_inicio),
      fecha_fin: aISO(fin),
      dias_calendario: detalle.length,
      dias_habiles: habiles,
      detalle,
      base_legal: ARTICULO,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al calcular los días hábiles.' });
  }
};

// ------------------------------------------------------------------- crear

const crearSolicitud = async (req, res) => {
  let { id_empleado, id_tipo, fecha_inicio, fecha_fin, motivo } = req.body;
  const cli = await pool.connect();

  try {
    // Un empleado solo puede pedir para si mismo; el id sale del token, no del body.
    if (req.usuario.rol === 'empleado') {
      id_empleado = await empleadoDelUsuario(req.usuario.id, cli);
      if (!id_empleado) {
        return res.status(400).json({ error: 'No se encontró el empleado asociado a este usuario.' });
      }
    }

    if (!id_empleado || !id_tipo || !fecha_inicio || !motivo) {
      return res.status(400).json({ error: 'Los campos tipo, fecha de inicio y motivo son requeridos.' });
    }
    if (req.usuario.rol === 'empleado' && TIPOS_SOLO_RRHH.includes(Number(id_tipo))) {
      return res.status(403).json({ error: 'Ese tipo de solicitud solo lo registra el personal de RRHH.' });
    }
    if (isNaN(Date.parse(fecha_inicio))) {
      return res.status(400).json({ error: 'El formato de la fecha de inicio no es válido (YYYY-MM-DD).' });
    }
    if (fecha_fin && isNaN(Date.parse(fecha_fin))) {
      return res.status(400).json({ error: 'El formato de la fecha de fin no es válido (YYYY-MM-DD).' });
    }
    if (fecha_fin && aISO(fecha_fin) < aISO(fecha_inicio)) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio.' });
    }
    if (motivo.trim().length < 10) {
      return res.status(400).json({ error: 'El motivo debe tener al menos 10 caracteres.' });
    }

    await cli.query('BEGIN');

    const fin = fecha_fin || fecha_inicio;
    const habiles = await contarDiasHabiles(fecha_inicio, fin, cli);
    const tipoVac = await idTipoVacaciones(cli);
    const esVacaciones = Number(id_tipo) === tipoVac;

    // Para vacaciones se valida el derecho y el saldo ANTES de aceptar la solicitud.
    if (esVacaciones) {
      if (habiles === 0) {
        await cli.query('ROLLBACK');
        return res.status(400).json({
          error: 'El rango seleccionado no contiene ningún día hábil (solo fines de semana o asuetos).',
        });
      }

      const anio = Number(aISO(fecha_inicio).slice(0, 4));
      const vac = await asegurarRegistroAnual(cli, id_empleado, anio);
      const saldo = vac.dias_asignados - vac.dias_tomados;

      if (vac.dias_asignados === 0) {
        await cli.query('ROLLBACK');
        return res.status(400).json({
          error: 'Aún no ha cumplido un año de servicio continuo, por lo que todavía no tiene derecho '
               + 'a vacaciones. ' + ARTICULO,
          dias_asignados: 0, saldo: 0,
        });
      }
      if (vac.derecho_desde && aISO(fecha_inicio) < aISO(vac.derecho_desde)) {
        await cli.query('ROLLBACK');
        return res.status(400).json({
          error: `El derecho a las vacaciones de ${anio} se adquiere hasta el ${aISO(vac.derecho_desde)} `
               + '(aniversario de ingreso).',
          derecho_desde: aISO(vac.derecho_desde),
        });
      }
      if (habiles > saldo) {
        await cli.query('ROLLBACK');
        return res.status(400).json({
          error: `Solicita ${habiles} días hábiles pero su saldo disponible es de ${saldo}.`,
          dias_habiles: habiles, saldo,
          dias_asignados: vac.dias_asignados, dias_tomados: vac.dias_tomados,
        });
      }
    }

    const result = await cli.query(
      `INSERT INTO solicitudes
         (id_empleado, id_tipo, fecha_inicio, fecha_fin, dias_solicitados, dias_habiles, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id_empleado, id_tipo, fecha_inicio, fecha_fin || null, habiles, habiles, motivo]);
    const solicitud = result.rows[0];

    const tipoRow = await cli.query('SELECT nombre FROM tipos_solicitud WHERE id = $1', [id_tipo]);
    const tipoNombre = tipoRow.rows[0] ? tipoRow.rows[0].nombre : 'Solicitud';
    const empRow = await cli.query(
      `SELECT nombres || ' ' || apellidos AS nombre FROM empleados WHERE id = $1`, [id_empleado]);
    const empleado = empRow.rows[0] ? empRow.rows[0].nombre : 'Un empleado';

    // Aviso a RRHH de que hay algo pendiente de revisar.
    const destinos = await notif.usuariosRRHH(cli);
    const pendientes = [];
    for (const idU of destinos) {
      if (idU === req.usuario.id) continue; // no avisarse a si mismo
      pendientes.push(await notif.notificar({
        id_usuario: idU,
        titulo: `Nueva solicitud: ${tipoNombre}`,
        mensaje: `${empleado} solicitó ${tipoNombre.toLowerCase()} del ${aISO(fecha_inicio)} al `
               + `${aISO(fin)} (${habiles} días hábiles).`,
        id_solicitud: solicitud.id,
      }, cli));
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'solicitudes',
      registro_id: solicitud.id,
      detalle: {
        tipo: tipoNombre, id_empleado,
        fecha_inicio: aISO(fecha_inicio), fecha_fin: aISO(fin),
        dias_habiles: habiles,
      },
    }, cli);

    await cli.query('COMMIT');
    notif.emitirPendientes(pendientes);

    res.status(201).json({
      mensaje: 'Solicitud creada exitosamente.',
      solicitud: Object.assign({}, solicitud, { dias_habiles: habiles }),
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear solicitud.' });
  } finally {
    cli.release();
  }
};

// --------------------------------------------------------- cambiar estado

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, comentario_rrhh } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    // FOR UPDATE evita que dos aprobaciones simultaneas descuenten el saldo dos veces.
    const actual = await cli.query(
      `SELECT s.*, t.nombre AS tipo_nombre,
              TO_CHAR(s.fecha_inicio,'YYYY-MM-DD') AS inicio,
              TO_CHAR(COALESCE(s.fecha_fin, s.fecha_inicio),'YYYY-MM-DD') AS fin
         FROM solicitudes s
         JOIN tipos_solicitud t ON t.id = s.id_tipo
        WHERE s.id = $1
          FOR UPDATE OF s`, [id]);

    if (actual.rows.length === 0) {
      await cli.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const sol = actual.rows[0];

    if (sol.estado === estado) {
      await cli.query('ROLLBACK');
      return res.status(400).json({ error: `La solicitud ya esta en estado "${estado}".` });
    }

    const tipoVac = await idTipoVacaciones(cli);
    const esVacaciones = sol.id_tipo === tipoVac;
    let descontados = sol.dias_descontados;
    let idVacaciones = sol.id_vacaciones;
    let notaSaldo = null;

    if (esVacaciones) {
      const anio = Number(sol.inicio.slice(0, 4));

      // Aprobar: descontar del saldo, solo si no se habia descontado antes.
      if (estado === 'Aprobada' && sol.dias_descontados === 0) {
        const habiles = sol.dias_habiles !== null && sol.dias_habiles !== undefined
          ? sol.dias_habiles
          : await contarDiasHabiles(sol.inicio, sol.fin, cli);
        const vac = await asegurarRegistroAnual(cli, sol.id_empleado, anio);
        const saldo = vac.dias_asignados - vac.dias_tomados;

        if (habiles > saldo) {
          await cli.query('ROLLBACK');
          return res.status(400).json({
            error: `No se puede aprobar: requiere ${habiles} días hábiles y el empleado tiene `
                 + `${saldo} disponibles.`,
            dias_habiles: habiles, saldo,
          });
        }

        await cli.query(
          'UPDATE vacaciones SET dias_tomados = dias_tomados + $1 WHERE id = $2',
          [habiles, vac.id]);
        descontados = habiles;
        idVacaciones = vac.id;
        notaSaldo = `Se descontaron ${habiles} días hábiles. Saldo restante: ${saldo - habiles}.`;
      }

      // Revertir: si deja de estar aprobada, se devuelven los dias al saldo.
      if (sol.estado === 'Aprobada' && estado !== 'Aprobada' && sol.dias_descontados > 0) {
        await cli.query(
          'UPDATE vacaciones SET dias_tomados = GREATEST(dias_tomados - $1, 0) WHERE id = $2',
          [sol.dias_descontados, sol.id_vacaciones]);
        notaSaldo = `Se devolvieron ${sol.dias_descontados} días hábiles al saldo.`;
        descontados = 0;
      }
    }

    const result = await cli.query(
      `UPDATE solicitudes SET
         estado = $1, comentario_rrhh = $2, id_revisado_por = $3, fecha_revision = NOW(),
         dias_descontados = $4, id_vacaciones = $5
       WHERE id = $6 RETURNING *`,
      [estado, comentario_rrhh || null, req.usuario.id, descontados, idVacaciones, id]);

    // Aviso al empleado dueno de la solicitud.
    const idUsuarioEmpleado = await notif.usuarioDeEmpleado(sol.id_empleado, cli);
    const verbo = VERBO_ESTADO[estado];
    const partes = [
      `Su solicitud de ${sol.tipo_nombre.toLowerCase()} del ${sol.inicio} al ${sol.fin} fue ${verbo}.`,
    ];
    if (comentario_rrhh) partes.push(`Comentario: ${comentario_rrhh}`);
    if (notaSaldo) partes.push(notaSaldo);

    const pendientes = [await notif.notificar({
      id_usuario: idUsuarioEmpleado,
      titulo: `Solicitud ${verbo}`,
      mensaje: partes.join(' '),
      id_solicitud: Number(id),
    }, cli)];

    const ACC = auditoria.ACCIONES;
    const accion = estado === 'Aprobada' ? ACC.APROBAR
                 : estado === 'Rechazada' ? ACC.RECHAZAR
                 : estado === 'Cancelada' ? ACC.CANCELAR
                 : ACC.CAMBIO_ESTADO;

    await auditoria.registrar(req, {
      accion,
      tabla: 'solicitudes',
      registro_id: Number(id),
      detalle: {
        estado_anterior: sol.estado, estado_nuevo: estado,
        tipo: sol.tipo_nombre, id_empleado: sol.id_empleado,
        dias_descontados: descontados, comentario: comentario_rrhh || null,
      },
    }, cli);

    await cli.query('COMMIT');
    notif.emitirPendientes(pendientes);

    res.json({
      mensaje: `Solicitud ${estado.toLowerCase()}.`,
      solicitud: result.rows[0],
      saldo: notaSaldo,
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar solicitud.' });
  } finally {
    cli.release();
  }
};

module.exports = {
  getSolicitudes, getSolicitudById, crearSolicitud, actualizarEstado,
  getTipos, getMisSolicitudes, previsualizarDias,
};
