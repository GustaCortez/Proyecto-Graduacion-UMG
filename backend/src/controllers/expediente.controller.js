const pool = require('../config/db');
const auditoria = require('../services/auditoria');
const notif = require('../services/notificaciones');
const almacenamiento = require('../services/almacenamiento');

const claveDoc = (nombre) => almacenamiento.clave('documentos', nombre);

/**
 * Expediente del empleado: capacitaciones, evaluaciones de desempeño, llamadas
 * de atención y aviso de baja ante el IGSS (migración 007).
 *
 * Las cuatro secciones comparten el mismo ciclo (listar, crear, editar,
 * eliminar, adjuntar), así que se describen con una tabla de configuración y
 * un solo juego de funciones. Agregar una sección nueva es agregar una entrada.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const vacioANull = (v) => {
  if (v === undefined || v === null) return null;
  const limpio = String(v).trim();
  return limpio === '' ? null : limpio;
};

const CRITERIOS = ['puntualidad', 'responsabilidad', 'calidad_trabajo', 'trabajo_equipo', 'iniciativa'];

/** Misma escala que documenta la migración 007 sobre la columna promedio. */
const SQL_RESULTADO = `CASE WHEN t.promedio >= 4.5 THEN 'Excelente'
                            WHEN t.promedio >= 3.5 THEN 'Muy bueno'
                            WHEN t.promedio >= 2.5 THEN 'Satisfactorio'
                            ELSE 'Necesita mejorar' END AS resultado`;

const SECCIONES = {
  capacitaciones: {
    tabla: 'capacitaciones',
    etiqueta: 'la capacitación',
    orden: 't.fecha_inicio DESC, t.id DESC',
    texto: ['nombre', 'institucion', 'observaciones'],
    fecha: ['fecha_inicio', 'fecha_fin'],
    numero: ['horas'],
    booleano: ['aprobada'],
    opcion: {
      tipo: ['Curso', 'Taller', 'Diplomado', 'Seminario', 'Certificación', 'Otro'],
      modalidad: ['Presencial', 'Virtual', 'Mixta'],
    },
    requeridos: { nombre: 'el nombre de la capacitación', fecha_inicio: 'la fecha de inicio' },
    validar: (d) => {
      if (d.fecha_fin && d.fecha_fin < d.fecha_inicio) return 'La fecha de fin no puede ser anterior al inicio.';
      if (d.horas !== null && d.horas < 0) return 'Las horas no pueden ser negativas.';
      return null;
    },
    extraSelect: '',
    notificar: (d) => ({
      titulo: 'Capacitación registrada',
      mensaje: `Se agregó "${d.nombre}" a su expediente de capacitaciones.`,
    }),
    resumen: (d) => ({ nombre: d.nombre, tipo: d.tipo, horas: d.horas }),
  },

  evaluaciones: {
    tabla: 'evaluaciones_desempeno',
    etiqueta: 'la evaluación de desempeño',
    orden: 't.fecha DESC, t.id DESC',
    texto: ['periodo', 'evaluador', 'fortalezas', 'areas_mejora', 'compromisos'],
    fecha: ['fecha'],
    numero: CRITERIOS,
    booleano: [],
    opcion: {},
    requeridos: { periodo: 'el período evaluado', evaluador: 'quién evalúa', fecha: 'la fecha' },
    validar: (d) => {
      for (const c of CRITERIOS) {
        if (!Number.isInteger(d[c]) || d[c] < 1 || d[c] > 5) {
          return `Cada criterio lleva un puntaje entero de 1 a 5 (revise "${c.replace('_', ' ')}").`;
        }
      }
      return null;
    },
    extraSelect: `, t.promedio, ${SQL_RESULTADO}`,
    notificar: (d) => ({
      titulo: 'Evaluación de desempeño registrada',
      mensaje: `RRHH registró su evaluación del período ${d.periodo}. Puede verla en Mi Perfil.`,
    }),
    resumen: (d) => ({ periodo: d.periodo, evaluador: d.evaluador }),
  },

  llamadas: {
    tabla: 'llamadas_atencion',
    etiqueta: 'la llamada de atención',
    orden: 't.fecha DESC, t.id DESC',
    texto: ['motivo', 'sancion', 'emitida_por'],
    fecha: ['fecha'],
    numero: [],
    booleano: [],
    opcion: { tipo: ['Verbal', 'Escrita', 'Grave'] },
    requeridos: { motivo: 'el motivo', fecha: 'la fecha' },
    validar: (d) => (d.motivo.length < 5 ? 'Describa el motivo (al menos 5 caracteres).' : null),
    extraSelect: '',
    notificar: (d) => ({
      titulo: 'Llamada de atención registrada',
      mensaje: `Se registró una llamada de atención ${d.tipo.toLowerCase()} en su expediente.`,
    }),
    resumen: (d) => ({ tipo: d.tipo, motivo: d.motivo }),
  },

  'bajas-igss': {
    tabla: 'bajas_igss',
    etiqueta: 'el aviso de baja ante el IGSS',
    orden: 't.fecha_baja DESC, t.id DESC',
    texto: ['numero_afiliacion', 'numero_aviso', 'observaciones'],
    fecha: ['fecha_baja', 'fecha_aviso'],
    numero: [],
    booleano: [],
    opcion: {
      motivo: ['Renuncia', 'Despido', 'Fin de contrato', 'Jubilación', 'Fallecimiento', 'Otro'],
      estado: ['Pendiente', 'Presentado'],
    },
    requeridos: { fecha_baja: 'la fecha de baja' },
    validar: (d) => {
      if (d.estado === 'Presentado' && !d.fecha_aviso) return 'Indique la fecha en que se presentó el aviso al IGSS.';
      if (d.fecha_aviso && d.fecha_aviso < d.fecha_baja) return 'El aviso no puede ser anterior a la fecha de baja.';
      return null;
    },
    extraSelect: '',
    notificar: null,   // el empleado ya no labora: no se le avisa
    resumen: (d) => ({ motivo: d.motivo, estado: d.estado, fecha_baja: d.fecha_baja }),
  },
};

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

const seccionDe = (req) => SECCIONES[req.params.seccion] || null;

/** Campos que se escriben en INSERT/UPDATE, en orden fijo. */
const columnasDe = (sec) => [
  ...sec.texto, ...sec.fecha, ...sec.numero, ...sec.booleano, ...Object.keys(sec.opcion),
];

/** Normaliza el cuerpo según la sección; devuelve { datos } o { error }. */
function normalizar(sec, body) {
  const d = {};
  for (const c of sec.texto) d[c] = vacioANull(body[c]);
  for (const c of sec.fecha) {
    const v = vacioANull(body[c]);
    if (v !== null && !FECHA.test(v)) return { error: `La fecha "${c.replace('_', ' ')}" debe tener formato AAAA-MM-DD.` };
    d[c] = v;
  }
  for (const c of sec.numero) {
    const v = vacioANull(body[c]);
    if (v === null) { d[c] = null; continue; }
    const n = Number(v);
    if (!Number.isFinite(n)) return { error: `El campo "${c.replace('_', ' ')}" debe ser numérico.` };
    d[c] = n;
  }
  for (const c of sec.booleano) {
    d[c] = body[c] === undefined ? true : (body[c] === true || body[c] === 'true' || body[c] === 1);
  }
  for (const [c, lista] of Object.entries(sec.opcion)) {
    const v = vacioANull(body[c]);
    if (v === null) { d[c] = lista[0]; continue; }
    if (!lista.includes(v)) return { error: `"${v}" no es una opción válida para ${c}. Use: ${lista.join(', ')}.` };
    d[c] = v;
  }
  for (const [c, nombre] of Object.entries(sec.requeridos)) {
    if (d[c] === null || d[c] === undefined) return { error: `Indique ${nombre}.` };
  }
  const msg = sec.validar(d);
  if (msg) return { error: msg };
  return { datos: d };
}

/** RRHH accede a cualquier expediente; el empleado solo al suyo. */
async function empleadoAccesible(req, idEmpleado) {
  const id = Number(idEmpleado);
  if (!Number.isInteger(id) || id <= 0) return null;

  if (!esRRHH(req)) {
    const u = await pool.query('SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!u.rows[0] || u.rows[0].id_empleado !== id) return null;
  }

  const { rows } = await pool.query(
    `SELECT e.id, e.codigo_empleado, e.nombres, e.apellidos,
            e.nombres || ' ' || e.apellidos AS nombre_completo,
            e.estado, e.situacion, e.igss, e.foto_url,
            TO_CHAR(e.fecha_ingreso, 'YYYY-MM-DD') AS fecha_ingreso,
            TO_CHAR(e.fecha_baja,    'YYYY-MM-DD') AS fecha_baja,
            e.motivo_baja,
            d.nombre AS departamento, p.nombre AS puesto
       FROM empleados e
       JOIN departamentos d ON d.id = e.id_departamento
       JOIN puestos       p ON p.id = e.id_puesto
      WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

const selectFechas = (sec) => sec.fecha.map((c) => `TO_CHAR(t.${c}, 'YYYY-MM-DD') AS ${c}`).join(', ');

async function listarSeccion(clave, idEmpleado) {
  const sec = SECCIONES[clave];
  const { rows } = await pool.query(
    `SELECT t.*, ${selectFechas(sec)} ${sec.extraSelect},
            COALESCE(u.username, '') AS registrado_por_usuario,
            (SELECT COUNT(*)::int FROM expediente_adjuntos a
              WHERE a.seccion = $2 AND a.id_registro = t.id) AS adjuntos
       FROM ${sec.tabla} t
       LEFT JOIN usuarios u ON u.id = t.registrado_por
      WHERE t.id_empleado = $1
      ORDER BY ${sec.orden}`, [idEmpleado, clave]);
  return rows;
}

async function armarExpediente(empleado) {
  const [capacitaciones, evaluaciones, llamadas, bajas] = await Promise.all([
    listarSeccion('capacitaciones', empleado.id),
    listarSeccion('evaluaciones', empleado.id),
    listarSeccion('llamadas', empleado.id),
    listarSeccion('bajas-igss', empleado.id),
  ]);

  const hace12Meses = new Date(); hace12Meses.setFullYear(hace12Meses.getFullYear() - 1);
  const corte = hace12Meses.toISOString().slice(0, 10);
  const ultimaEval = evaluaciones[0] || null;

  return {
    empleado,
    capacitaciones, evaluaciones, llamadas,
    bajas_igss: bajas,
    resumen: {
      capacitaciones: capacitaciones.length,
      horas_capacitacion: capacitaciones.reduce((n, c) => n + Number(c.horas || 0), 0),
      ultima_evaluacion: ultimaEval
        ? { periodo: ultimaEval.periodo, promedio: Number(ultimaEval.promedio), resultado: ultimaEval.resultado }
        : null,
      llamadas_12_meses: llamadas.filter((l) => l.fecha >= corte).length,
      llamadas_total: llamadas.length,
      aviso_igss: bajas[0] ? { estado: bajas[0].estado, fecha_baja: bajas[0].fecha_baja } : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

const obtener = async (req, res) => {
  try {
    const empleado = await empleadoAccesible(req, req.params.idEmpleado);
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado.' });
    res.json(await armarExpediente(empleado));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener el expediente.' });
  }
};

/** El empleado consulta su propio expediente desde Mi Perfil. */
const mio = async (req, res) => {
  try {
    const u = await pool.query('SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
    const idEmpleado = u.rows[0] ? u.rows[0].id_empleado : null;
    if (!idEmpleado) return res.json(null);
    const empleado = await empleadoAccesible(req, idEmpleado);
    if (!empleado) return res.json(null);
    const exp = await armarExpediente(empleado);
    // El aviso IGSS es trámite interno de RRHH; el empleado no lo necesita.
    delete exp.bajas_igss;
    res.json(exp);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener el expediente.' });
  }
};

// ---------------------------------------------------------------------------
// Alta, edición y baja de registros (solo RRHH)
// ---------------------------------------------------------------------------

/** Avisa al empleado (si tiene usuario) y audita; nunca interrumpe la operación. */
async function avisarYAuditar(req, { sec, accion, empleado, registro, datos }) {
  try {
    if (accion === auditoria.ACCIONES.CREAR && sec.notificar) {
      const idUsuario = await notif.usuarioDeEmpleado(empleado.id);
      if (idUsuario) {
        const n = await notif.notificar({ id_usuario: idUsuario, ...sec.notificar(datos) });
        notif.emitirPendientes([n]);
      }
    }
  } catch (err) {
    console.error('[expediente] no se pudo notificar:', err.message);
  }
  await auditoria.registrar(req, {
    accion, tabla: sec.tabla, registro_id: registro.id,
    detalle: { id_empleado: empleado.id, ...sec.resumen(datos) },
  });
}

const crear = async (req, res) => {
  const sec = seccionDe(req);
  if (!sec) return res.status(404).json({ error: 'Sección del expediente no reconocida.' });
  try {
    const empleado = await empleadoAccesible(req, req.params.idEmpleado);
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado.' });

    const { datos, error } = normalizar(sec, req.body || {});
    if (error) return res.status(400).json({ error });

    // Sin número IGSS no hay aviso que presentar; se avisa en vez de guardar vacío.
    if (sec.tabla === 'bajas_igss' && !datos.numero_afiliacion) datos.numero_afiliacion = empleado.igss;

    const cols = columnasDe(sec);
    const { rows } = await pool.query(
      `INSERT INTO ${sec.tabla} (id_empleado, registrado_por, ${cols.join(', ')})
       VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')})
       RETURNING id`,
      [empleado.id, req.usuario.id, ...cols.map((c) => datos[c])]);

    await avisarYAuditar(req, { sec, accion: auditoria.ACCIONES.CREAR, empleado, registro: rows[0], datos });
    res.status(201).json({ mensaje: `Se registró ${sec.etiqueta}.`, id: rows[0].id });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: `Error al registrar ${sec.etiqueta}.` });
  }
};

const actualizar = async (req, res) => {
  const sec = seccionDe(req);
  if (!sec) return res.status(404).json({ error: 'Sección del expediente no reconocida.' });
  try {
    const empleado = await empleadoAccesible(req, req.params.idEmpleado);
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado.' });

    const { datos, error } = normalizar(sec, req.body || {});
    if (error) return res.status(400).json({ error });

    const cols = columnasDe(sec);
    const { rows } = await pool.query(
      `UPDATE ${sec.tabla}
          SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, actualizado_en = NOW()
        WHERE id = $1 AND id_empleado = $2
        RETURNING id`,
      [req.params.id, empleado.id, ...cols.map((c) => datos[c])]);
    if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });

    await avisarYAuditar(req, { sec, accion: auditoria.ACCIONES.ACTUALIZAR, empleado, registro: rows[0], datos });
    res.json({ mensaje: `Se actualizó ${sec.etiqueta}.` });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: `Error al actualizar ${sec.etiqueta}.` });
  }
};

const eliminar = async (req, res) => {
  const sec = seccionDe(req);
  if (!sec) return res.status(404).json({ error: 'Sección del expediente no reconocida.' });
  const cliente = await pool.connect();
  try {
    const empleado = await empleadoAccesible(req, req.params.idEmpleado);
    if (!empleado) { cliente.release(); return res.status(404).json({ error: 'Empleado no encontrado.' }); }

    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `DELETE FROM ${sec.tabla} WHERE id = $1 AND id_empleado = $2 RETURNING *`,
      [req.params.id, empleado.id]);
    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }
    // Los adjuntos se van con el registro: en la base y en el almacenamiento.
    const adj = await cliente.query(
      `DELETE FROM expediente_adjuntos WHERE seccion = $1 AND id_registro = $2 RETURNING ruta_archivo`,
      [req.params.seccion, req.params.id]);
    await cliente.query('COMMIT');

    for (const a of adj.rows) {
      const clave = claveDoc(a.ruta_archivo);
      if (clave) almacenamiento.eliminar(clave).catch(() => {});
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ELIMINAR, tabla: sec.tabla, registro_id: Number(req.params.id),
      detalle: { id_empleado: empleado.id, ...sec.resumen(rows[0]), adjuntos_eliminados: adj.rows.length },
    });
    res.json({ mensaje: `Se eliminó ${sec.etiqueta}.` });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    res.status(500).json({ error: `Error al eliminar ${sec.etiqueta}.` });
  } finally {
    cliente.release();
  }
};

// ---------------------------------------------------------------------------
// Adjuntos (diploma, acta firmada, formulario IGSS...)
// ---------------------------------------------------------------------------

async function registroAccesible(req) {
  const sec = seccionDe(req);
  if (!sec) return null;
  const empleado = await empleadoAccesible(req, req.params.idEmpleado);
  if (!empleado) return null;
  const { rows } = await pool.query(
    `SELECT id FROM ${sec.tabla} WHERE id = $1 AND id_empleado = $2`, [req.params.id, empleado.id]);
  return rows[0] ? { sec, empleado, registro: rows[0] } : null;
}

const listarAdjuntos = async (req, res) => {
  try {
    const ctx = await registroAccesible(req);
    if (!ctx) return res.status(404).json({ error: 'Registro no encontrado.' });
    const { rows } = await pool.query(
      `SELECT id, nombre_archivo, tipo_mime, tamano_bytes, subido_en
         FROM expediente_adjuntos WHERE seccion = $1 AND id_registro = $2 ORDER BY subido_en`,
      [req.params.seccion, ctx.registro.id]);
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener los adjuntos.' });
  }
};

const subirAdjunto = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Adjunte un archivo en el campo "documento".' });
  const clave = claveDoc(req.file.filename);
  try {
    const ctx = await registroAccesible(req);
    if (!ctx) return res.status(404).json({ error: 'Registro no encontrado.' });

    // Primero el archivo y luego la fila: si el almacenamiento falla no queda
    // una fila que apunte a un archivo inexistente.
    try {
      await almacenamiento.guardar(req.file.buffer, clave, req.file.mimetype);
    } catch (err) {
      console.error('[expediente] no se pudo guardar el archivo:', err.message);
      return res.status(500).json({
        error: 'No se pudo guardar el archivo en el almacenamiento de archivos. Intente de nuevo.',
      });
    }

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO expediente_adjuntos
           (id_empleado, seccion, id_registro, nombre_archivo, ruta_archivo, tipo_mime, tamano_bytes, subido_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, nombre_archivo, tipo_mime, tamano_bytes, subido_en`,
        [ctx.empleado.id, req.params.seccion, ctx.registro.id, req.file.originalname,
         req.file.filename, req.file.mimetype, req.file.size, req.usuario.id]));
    } catch (err) {
      await almacenamiento.eliminar(clave).catch(() => {});
      throw err;
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.SUBIR_DOCUMENTO, tabla: 'expediente_adjuntos', registro_id: rows[0].id,
      detalle: { id_empleado: ctx.empleado.id, seccion: req.params.seccion, id_registro: ctx.registro.id,
                 nombre: req.file.originalname, bytes: req.file.size, mime: req.file.mimetype },
    });
    res.status(201).json({ mensaje: 'Documento adjuntado.', documento: rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al adjuntar el documento.' });
  }
};

const descargarAdjunto = async (req, res) => {
  try {
    const ctx = await registroAccesible(req);
    if (!ctx) return res.status(404).json({ error: 'Registro no encontrado.' });
    const { rows } = await pool.query(
      `SELECT nombre_archivo, ruta_archivo, tipo_mime FROM expediente_adjuntos
        WHERE id = $1 AND seccion = $2 AND id_registro = $3`,
      [req.params.idDoc, req.params.seccion, ctx.registro.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    const doc = rows[0];
    const clave = claveDoc(doc.ruta_archivo);
    const archivo = clave ? await almacenamiento.obtener(clave) : null;
    if (!archivo) {
      return res.status(404).json({ error: 'El archivo ya no está disponible en el servidor.' });
    }
    res.setHeader('Content-Type', doc.tipo_mime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const nombre = String(doc.nombre_archivo).replace(/["\r\n]/g, '');
    const disposicion = String(doc.tipo_mime || '').startsWith('image/') ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposicion}; filename="${nombre}"`);
    almacenamiento.enviar(res, archivo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al descargar el documento.' });
  }
};

const eliminarAdjunto = async (req, res) => {
  try {
    const ctx = await registroAccesible(req);
    if (!ctx) return res.status(404).json({ error: 'Registro no encontrado.' });
    const { rows } = await pool.query(
      `DELETE FROM expediente_adjuntos WHERE id = $1 AND seccion = $2 AND id_registro = $3
       RETURNING nombre_archivo, ruta_archivo`,
      [req.params.idDoc, req.params.seccion, ctx.registro.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    const clave = claveDoc(rows[0].ruta_archivo);
    if (clave) almacenamiento.eliminar(clave).catch(() => {});

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ELIMINAR, tabla: 'expediente_adjuntos', registro_id: Number(req.params.idDoc),
      detalle: { id_empleado: ctx.empleado.id, seccion: req.params.seccion, nombre: rows[0].nombre_archivo },
    });
    res.json({ mensaje: 'Documento eliminado.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al eliminar el documento.' });
  }
};

// ---------------------------------------------------------------------------
// Resumen institucional: lo consumen Dashboard y Reportes
// ---------------------------------------------------------------------------

async function resumenInstitucional() {
  const anio = new Date().getFullYear();
  const [igss, sinEvaluar, capDep, evalDep, llamDep, reincidentes] = await Promise.all([
    pool.query(
      `SELECT b.id, b.id_empleado, e.nombres || ' ' || e.apellidos AS empleado, e.codigo_empleado,
              TO_CHAR(b.fecha_baja, 'YYYY-MM-DD') AS fecha_baja, b.motivo, b.numero_afiliacion,
              (CURRENT_DATE - b.fecha_baja)::int AS dias_transcurridos
         FROM bajas_igss b JOIN empleados e ON e.id = b.id_empleado
        WHERE b.estado = 'Pendiente'
        ORDER BY b.fecha_baja`),
    pool.query(
      `SELECT COUNT(*)::int AS total
         FROM empleados e
        WHERE e.estado = 'Activo'
          AND NOT EXISTS (SELECT 1 FROM evaluaciones_desempeno v
                           WHERE v.id_empleado = e.id AND EXTRACT(YEAR FROM v.fecha) = $1)`, [anio]),
    pool.query(
      `SELECT d.nombre AS departamento, COUNT(c.id)::int AS capacitaciones,
              COALESCE(SUM(c.horas), 0)::float AS horas
         FROM capacitaciones c
         JOIN empleados e ON e.id = c.id_empleado
         JOIN departamentos d ON d.id = e.id_departamento
        WHERE EXTRACT(YEAR FROM c.fecha_inicio) = $1
        GROUP BY d.nombre ORDER BY horas DESC`, [anio]),
    pool.query(
      `SELECT d.nombre AS departamento, COUNT(v.id)::int AS evaluaciones,
              ROUND(AVG(v.promedio), 2)::float AS promedio
         FROM evaluaciones_desempeno v
         JOIN empleados e ON e.id = v.id_empleado
         JOIN departamentos d ON d.id = e.id_departamento
        WHERE EXTRACT(YEAR FROM v.fecha) = $1
        GROUP BY d.nombre ORDER BY promedio DESC`, [anio]),
    pool.query(
      `SELECT d.nombre AS departamento, COUNT(l.id)::int AS llamadas
         FROM llamadas_atencion l
         JOIN empleados e ON e.id = l.id_empleado
         JOIN departamentos d ON d.id = e.id_departamento
        WHERE l.fecha >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY d.nombre ORDER BY llamadas DESC`),
    pool.query(
      `SELECT e.id AS id_empleado, e.nombres || ' ' || e.apellidos AS empleado, d.nombre AS departamento,
              COUNT(l.id)::int AS llamadas
         FROM llamadas_atencion l
         JOIN empleados e ON e.id = l.id_empleado
         JOIN departamentos d ON d.id = e.id_departamento
        WHERE l.fecha >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY e.id, e.nombres, e.apellidos, d.nombre
       HAVING COUNT(l.id) >= 3
        ORDER BY llamadas DESC`),
  ]);

  return {
    anio,
    bajas_igss_pendientes: igss.rows,
    sin_evaluar: sinEvaluar.rows[0].total,
    capacitacion_por_departamento: capDep.rows,
    desempeno_por_departamento: evalDep.rows,
    llamadas_por_departamento: llamDep.rows,
    llamadas_reincidentes: reincidentes.rows,
  };
}

const resumen = async (req, res) => {
  try {
    res.json(await resumenInstitucional());
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener el resumen del expediente.' });
  }
};

module.exports = {
  obtener, mio, crear, actualizar, eliminar,
  listarAdjuntos, subirAdjunto, descargarAdjunto, eliminarAdjunto,
  resumen, resumenInstitucional,
  SECCIONES,
};
