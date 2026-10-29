const pool = require('../config/db');
const {
  contarDiasHabiles, detalleDiasHabiles, aISO, esFechaISO, diasCalendario, MAX_DIAS_RANGO,
} = require('../utils/dias');
const { asegurarRegistroAnual, ARTICULO } = require('../utils/vacaciones');
const auditoria = require('../services/auditoria');
const notif = require('../services/notificaciones');

const ESTADOS_VALIDOS = ['En revision', 'Aprobada', 'Rechazada', 'Cancelada'];
const TIPOS_SOLO_RRHH = [5, 7, 8]; // Suspension disciplinaria, Alta de empleado, Baja de empleado

/**
 * Correlativo del acuerdo municipal por anio: 01-2026, 02-2026, ...
 * El bloqueo consultivo evita que dos aprobaciones simultaneas tomen el
 * mismo numero (la unicidad la garantiza ademas el indice de la tabla).
 */
async function siguienteAcuerdo(cli, anio) {
  await cli.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`acuerdo-${anio}`]);
  const { rows } = await cli.query(
    `SELECT COALESCE(MAX(NULLIF(split_part(numero_acuerdo, '-', 1), '')::int), 0) + 1 AS n
       FROM solicitudes
      WHERE numero_acuerdo ~ ('^[0-9]+-' || $1 || '$')`, [String(anio)]);
  return `${String(rows[0].n).padStart(2, '0')}-${anio}`;
}

/** Texto corto opcional (libro, folio, acuerdo): recortado, null si vacio, undefined si excede. */
const textoCorto = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length > max ? undefined : t;
};

const VERBO_ESTADO = {
  'Aprobada': 'aprobada',
  'Rechazada': 'rechazada',
  'Cancelada': 'cancelada',
  'En revision': 'puesta en revisión',
};

let _idTipoVacaciones = null;
async function idTipoVacaciones(cliente = pool) {
  if (_idTipoVacaciones !== null) return _idTipoVacaciones;
  const { rows } = await cliente.query(
    `SELECT id FROM tipos_solicitud WHERE nombre ILIKE 'vacaciones' LIMIT 1`);
  _idTipoVacaciones = rows[0] ? rows[0].id : 1;
  return _idTipoVacaciones;
}

async function empleadoDelUsuario(idUsuario, cliente = pool) {
  const { rows } = await cliente.query(
    'SELECT id_empleado FROM usuarios WHERE id = $1', [idUsuario]);
  return rows[0] ? rows[0].id_empleado : null;
}

/**
 * Valida un rango de fechas tal como llega en la peticion. Devuelve el texto
 * del error o null si todo esta bien. Las fechas se exigen en 'YYYY-MM-DD'
 * estricto y reales (Date.parse aceptaria "March 5" o "2026-02-30"), y el
 * rango se acota ANTES de contar dias habiles: el conteo recorre el rango dia
 * por dia y un fin como 9999-12-31 dejaria el servidor bloqueado.
 */
function errorDeRango(fecha_inicio, fecha_fin, { inicioRequerido = true } = {}) {
  if (!fecha_inicio) {
    return inicioRequerido ? 'Indique una fecha de inicio válida (YYYY-MM-DD).' : null;
  }
  if (!esFechaISO(fecha_inicio)) return 'El formato de la fecha de inicio no es válido (YYYY-MM-DD).';
  if (!fecha_fin) return null;
  if (!esFechaISO(fecha_fin)) return 'El formato de la fecha de fin no es válido (YYYY-MM-DD).';
  if (fecha_fin < fecha_inicio) return 'La fecha de fin no puede ser anterior a la de inicio.';
  if (diasCalendario(fecha_inicio, fecha_fin) > MAX_DIAS_RANGO) {
    return `El rango no puede superar ${MAX_DIAS_RANGO} días.`;
  }
  return null;
}

/**
 * Primera solicitud de ausencia del empleado, en alguno de los estados dados,
 * cuyo rango de fechas se cruza con [inicio, fin]. Evita que dos solicitudes
 * identicas pasen y RRHH apruebe ambas descontando el saldo dos veces. Los
 * tramites de documento (sin es_ausencia) no cuentan: no son una ausencia.
 */
async function solicitudSolapada(cli, { idEmpleado, inicio, fin, estados, excluirId = null }) {
  const { rows } = await cli.query(
    `SELECT s.id, s.estado
       FROM solicitudes s
       JOIN tipos_solicitud t ON t.id = s.id_tipo AND t.es_ausencia = TRUE
      WHERE s.id_empleado = $1
        AND s.estado = ANY($2::text[])
        AND s.fecha_inicio <= $4
        AND COALESCE(s.fecha_fin, s.fecha_inicio) >= $3
        AND ($5::int IS NULL OR s.id <> $5::int)
      ORDER BY s.id
      LIMIT 1`,
    [idEmpleado, estados, inicio, fin, excluirId]);
  return rows[0] || null;
}
const ESTADOS_QUE_OCUPAN_FECHAS = ['Pendiente', 'En revision', 'Aprobada'];

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
    // Se exige propiedad a todo el que NO sea RRHH. Preguntar por el rol
    // 'empleado' daria acceso total a cualquier rol que se agregue despues.
    if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
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
    const esRRHH = ['admin', 'rrhh'].includes(req.usuario.rol);
    // es_ausencia le dice al formulario si debe pedir un rango de fechas y
    // contar dias habiles, o una sola fecha (tramites de documento).
    const query = !esRRHH
      ? `SELECT id, nombre, requiere_doc, es_ausencia FROM tipos_solicitud WHERE activo=TRUE AND id != ALL($1)`
      : `SELECT id, nombre, requiere_doc, es_ausencia FROM tipos_solicitud WHERE activo=TRUE`;
    const params = !esRRHH ? [TIPOS_SOLO_RRHH] : [];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tipos.' });
  }
};

const previsualizarDias = async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  const invalido = errorDeRango(fecha_inicio, fecha_fin);
  if (invalido) return res.status(400).json({ error: invalido });
  const fin = fecha_fin || fecha_inicio;
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

const crearSolicitud = async (req, res) => {
  let { id_empleado, id_tipo, fecha_inicio, fecha_fin, motivo } = req.body;
  const cli = await pool.connect();

  try {
    // El id del empleado sale del token, no del body.
    if (!['admin', 'rrhh'].includes(req.usuario.rol)) {
      id_empleado = await empleadoDelUsuario(req.usuario.id, cli);
      if (!id_empleado) {
        return res.status(400).json({ error: 'No se encontró el empleado asociado a este usuario.' });
      }
    }

    if (!id_empleado || !id_tipo || !fecha_inicio || !motivo) {
      return res.status(400).json({ error: 'Los campos tipo, fecha de inicio y motivo son requeridos.' });
    }
    if (!['admin', 'rrhh'].includes(req.usuario.rol) && TIPOS_SOLO_RRHH.includes(Number(id_tipo))) {
      return res.status(403).json({ error: 'Ese tipo de solicitud solo lo registra el personal de RRHH.' });
    }
    const invalido = errorDeRango(fecha_inicio, fecha_fin);
    if (invalido) return res.status(400).json({ error: invalido });
    if (typeof motivo !== 'string' || motivo.trim().length < 10) {
      return res.status(400).json({ error: 'El motivo debe tener al menos 10 caracteres.' });
    }

    // Sin esto se podria crear una solicitud de un tipo desactivado llamando a la API.
    const tipo = await cli.query(
      'SELECT id, nombre, activo, es_ausencia FROM tipos_solicitud WHERE id = $1', [id_tipo]);
    if (tipo.rows.length === 0) {
      return res.status(400).json({ error: 'El tipo de solicitud no existe.' });
    }
    if (!tipo.rows[0].activo) {
      return res.status(400).json({
        error: `El tipo de solicitud "${tipo.rows[0].nombre}" está desactivado y ya no puede solicitarse.`,
      });
    }
    const tipoNombre = tipo.rows[0].nombre;
    const esAusencia = tipo.rows[0].es_ausencia;

    await cli.query('BEGIN');

    /**
     * Un tramite de documento (constancia laboral, constancia de ingresos,
     * carnet) no es una ausencia: el trabajador sigue asistiendo. Solo lleva la
     * fecha en que se pidio, sin fecha fin y sin dias habiles. Se ignora
     * cualquier fecha_fin que llegue en la peticion, venga del formulario o de
     * una llamada directa a la API.
     */
    const fin = esAusencia ? (fecha_fin || fecha_inicio) : null;

    if (esAusencia) {
      const otra = await solicitudSolapada(cli, {
        idEmpleado: id_empleado, inicio: fecha_inicio, fin, estados: ESTADOS_QUE_OCUPAN_FECHAS,
      });
      if (otra) {
        await cli.query('ROLLBACK');
        return res.status(409).json({
          error: `Ya existe una solicitud (#${otra.id}, ${otra.estado}) que cubre esas fechas.`,
          id_solicitud: otra.id, estado: otra.estado,
        });
      }
    }

    const habiles = esAusencia ? await contarDiasHabiles(fecha_inicio, fin, cli) : 0;
    const tipoVac = await idTipoVacaciones(cli);
    const esVacaciones = esAusencia && Number(id_tipo) === tipoVac;

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
      [id_empleado, id_tipo, fecha_inicio, fin, habiles, habiles, motivo]);
    const solicitud = result.rows[0];

    const empRow = await cli.query(
      `SELECT nombres || ' ' || apellidos AS nombre FROM empleados WHERE id = $1`, [id_empleado]);
    const empleado = empRow.rows[0] ? empRow.rows[0].nombre : 'Un empleado';

    // El aviso a RRHH se redacta distinto: hablar de "días hábiles" en una
    // constancia confundiria a quien la va a extender.
    const resumen = esAusencia
      ? `del ${aISO(fecha_inicio)} al ${aISO(fin)} (${habiles} días hábiles)`
      : `con fecha ${aISO(fecha_inicio)}`;

    const destinos = await notif.usuariosRRHH(cli);
    const pendientes = [];
    for (const idU of destinos) {
      if (idU === req.usuario.id) continue; // no avisarse a si mismo
      pendientes.push(await notif.notificar({
        id_usuario: idU,
        titulo: `Nueva solicitud: ${tipoNombre}`,
        mensaje: `${empleado} solicitó ${tipoNombre.toLowerCase()} ${resumen}.`,
        id_solicitud: solicitud.id,
      }, cli));
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'solicitudes',
      registro_id: solicitud.id,
      detalle: {
        tipo: tipoNombre, id_empleado,
        fecha_inicio: aISO(fecha_inicio),
        fecha_fin: fin ? aISO(fin) : null,
        dias_habiles: habiles,
        es_ausencia: esAusencia,
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

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, comentario_rrhh } = req.body;

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  // Datos del acta municipal; solo tienen sentido al aprobar vacaciones.
  const libro   = textoCorto(req.body.libro, 10);
  const folio   = textoCorto(req.body.folio, 10);
  let   acuerdo = textoCorto(req.body.numero_acuerdo, 20);
  if ([libro, folio, acuerdo].includes(undefined)) {
    return res.status(400).json({ error: 'Libro y folio admiten hasta 10 caracteres; el acuerdo hasta 20.' });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    // FOR UPDATE evita que dos aprobaciones simultaneas descuenten el saldo dos veces.
    const actual = await cli.query(
      `SELECT s.*, t.nombre AS tipo_nombre, t.es_ausencia,
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

    // Dos solicitudes que se cruzan no pueden quedar ambas aprobadas: se
    // descontaria el saldo dos veces y el empleado estaria "ausente" por duplicado.
    if (estado === 'Aprobada' && sol.es_ausencia) {
      const otra = await solicitudSolapada(cli, {
        idEmpleado: sol.id_empleado, inicio: sol.inicio, fin: sol.fin,
        estados: ['Aprobada'], excluirId: Number(id),
      });
      if (otra) {
        await cli.query('ROLLBACK');
        return res.status(400).json({
          error: `No se puede aprobar: la solicitud #${otra.id} ya está aprobada y cubre esas fechas.`,
          id_solicitud: otra.id,
        });
      }
    }

    const tipoVac = await idTipoVacaciones(cli);
    const esVacaciones = sol.id_tipo === tipoVac;
    let descontados = sol.dias_descontados;
    let idVacaciones = sol.id_vacaciones;
    let notaSaldo = null;

    if (esVacaciones) {
      const anio = Number(sol.inicio.slice(0, 4));

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

      // El acuerdo se asigna una sola vez: si RRHH no lo escribe, el sistema
      // toma el siguiente correlativo del anio en que inician las vacaciones.
      if (estado === 'Aprobada' && !sol.numero_acuerdo && !acuerdo) {
        acuerdo = await siguienteAcuerdo(cli, anio);
      }

      if (sol.estado === 'Aprobada' && estado !== 'Aprobada' && sol.dias_descontados > 0) {
        await cli.query(
          'UPDATE vacaciones SET dias_tomados = GREATEST(dias_tomados - $1, 0) WHERE id = $2',
          [sol.dias_descontados, sol.id_vacaciones]);
        notaSaldo = `Se devolvieron ${sol.dias_descontados} días hábiles al saldo.`;
        descontados = 0;
      }
    }

    const guardarActa = esVacaciones && estado === 'Aprobada';
    const result = await cli.query(
      `UPDATE solicitudes SET
         estado = $1, comentario_rrhh = $2, id_revisado_por = $3, fecha_revision = NOW(),
         dias_descontados = $4, id_vacaciones = $5,
         libro = COALESCE($7, libro), folio = COALESCE($8, folio),
         numero_acuerdo = COALESCE($9, numero_acuerdo)
       WHERE id = $6 RETURNING *`,
      [estado, comentario_rrhh || null, req.usuario.id, descontados, idVacaciones, id,
       guardarActa ? libro : null, guardarActa ? folio : null, guardarActa ? acuerdo : null]);
    const actualizada = result.rows[0];
    const textoActa = guardarActa && actualizada.numero_acuerdo
      ? `Acuerdo No. ${actualizada.numero_acuerdo}`
        + (actualizada.libro || actualizada.folio
            ? ` (Libro ${actualizada.libro || '—'}, Folio ${actualizada.folio || '—'})` : '')
      : null;

    const idUsuarioEmpleado = await notif.usuarioDeEmpleado(sol.id_empleado, cli);
    const verbo = VERBO_ESTADO[estado];
    // Una constancia no tiene rango: se nombra por su fecha de solicitud.
    const periodo = sol.es_ausencia
      ? `del ${sol.inicio} al ${sol.fin}`
      : `con fecha ${sol.inicio}`;
    const partes = [
      `Su solicitud de ${sol.tipo_nombre.toLowerCase()} ${periodo} fue ${verbo}.`,
    ];
    if (comentario_rrhh) partes.push(`Comentario: ${comentario_rrhh}`);
    if (notaSaldo) partes.push(notaSaldo);
    if (textoActa) partes.push(`${textoActa}.`);

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
        numero_acuerdo: guardarActa ? actualizada.numero_acuerdo : undefined,
        libro: guardarActa ? actualizada.libro : undefined,
        folio: guardarActa ? actualizada.folio : undefined,
      },
    }, cli);

    await cli.query('COMMIT');
    notif.emitirPendientes(pendientes);

    res.json({
      mensaje: `Solicitud ${estado.toLowerCase()}.`,
      solicitud: actualizada,
      saldo: notaSaldo,
      acuerdo: textoActa,
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    if (err.code === '23505' && /numero_acuerdo/.test(`${err.constraint || ''} ${err.detail || ''}`)) {
      return res.status(409).json({ error: 'Ese número de acuerdo ya está asignado a otra solicitud.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar solicitud.' });
  } finally {
    cli.release();
  }
};

/**
 * Corrige libro, folio y numero de acuerdo de una vacacion ya aprobada
 * (p. ej. las aprobadas antes de llevar el acta en el sistema). Un acuerdo
 * vacio se sustituye por el siguiente correlativo del anio.
 */
const actualizarActa = async (req, res) => {
  const { id } = req.params;
  const libro = textoCorto(req.body.libro, 10);
  const folio = textoCorto(req.body.folio, 10);
  let acuerdo = textoCorto(req.body.numero_acuerdo, 20);
  if ([libro, folio, acuerdo].includes(undefined)) {
    return res.status(400).json({ error: 'Libro y folio admiten hasta 10 caracteres; el acuerdo hasta 20.' });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const actual = await cli.query(
      `SELECT s.id, s.id_tipo, s.estado, s.libro, s.folio, s.numero_acuerdo,
              TO_CHAR(s.fecha_inicio, 'YYYY') AS anio
         FROM solicitudes s WHERE s.id = $1 FOR UPDATE`, [id]);
    if (actual.rows.length === 0) {
      await cli.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const sol = actual.rows[0];
    if (sol.id_tipo !== await idTipoVacaciones(cli) || sol.estado !== 'Aprobada') {
      await cli.query('ROLLBACK');
      return res.status(400).json({ error: 'El acta solo se registra en vacaciones aprobadas.' });
    }
    if (!acuerdo) acuerdo = await siguienteAcuerdo(cli, sol.anio);

    const { rows } = await cli.query(
      `UPDATE solicitudes SET libro = $1, folio = $2, numero_acuerdo = $3
        WHERE id = $4 RETURNING id, libro, folio, numero_acuerdo`,
      [libro, folio, acuerdo, id]);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ACTUALIZAR,
      tabla: 'solicitudes',
      registro_id: Number(id),
      detalle: {
        acta: 'vacaciones',
        antes: { libro: sol.libro, folio: sol.folio, numero_acuerdo: sol.numero_acuerdo },
        despues: { libro, folio, numero_acuerdo: acuerdo },
      },
    }, cli);
    await cli.query('COMMIT');

    res.json({ mensaje: 'Acta actualizada.', solicitud: rows[0] });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    if (err.code === '23505' && /numero_acuerdo/.test(`${err.constraint || ''} ${err.detail || ''}`)) {
      return res.status(409).json({ error: 'Ese número de acuerdo ya está asignado a otra solicitud.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar el acta.' });
  } finally {
    cli.release();
  }
};

module.exports = {
  getSolicitudes, getSolicitudById, crearSolicitud, actualizarEstado, actualizarActa,
  getTipos, getMisSolicitudes, previsualizarDias,
};
