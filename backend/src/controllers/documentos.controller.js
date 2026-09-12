const fs = require('fs');
const pool = require('../config/db');
const { descartar, rutaSegura } = require('../middleware/upload.middleware');
const auditoria = require('../services/auditoria');

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

/** Estados en los que el empleado todavia puede modificar sus adjuntos. */
const ESTADOS_EDITABLES = ['Pendiente', 'En revision'];

/**
 * Devuelve la solicitud si el usuario puede verla, o null.
 * Un empleado solo alcanza las suyas; RRHH y admin alcanzan todas.
 */
async function solicitudAccesible(req, idSolicitud) {
  const { rows } = await pool.query(
    `SELECT s.id, s.id_empleado, s.estado, t.nombre AS tipo, t.requiere_doc
       FROM solicitudes s JOIN tipos_solicitud t ON t.id = s.id_tipo
      WHERE s.id = $1`, [idSolicitud]);
  const sol = rows[0];
  if (!sol) return null;
  if (esRRHH(req)) return sol;

  const u = await pool.query('SELECT id_empleado FROM usuarios WHERE id = $1', [req.usuario.id]);
  const propio = u.rows[0] ? u.rows[0].id_empleado : null;
  return propio !== null && propio === sol.id_empleado ? sol : null;
}

const listar = async (req, res) => {
  try {
    const sol = await solicitudAccesible(req, req.params.id);
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada.' });

    const { rows } = await pool.query(
      `SELECT id, nombre_archivo, tipo_mime, tamano_bytes, subido_en
         FROM documentos_adjuntos WHERE id_solicitud = $1 ORDER BY subido_en`, [sol.id]);
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener los documentos.' });
  }
};

const subir = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Adjunte un archivo en el campo "documento".' });
  }
  try {
    const sol = await solicitudAccesible(req, req.params.id);
    if (!sol) {
      descartar(req.file);
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (!esRRHH(req) && !ESTADOS_EDITABLES.includes(sol.estado)) {
      descartar(req.file);
      return res.status(400).json({
        error: `No se pueden adjuntar documentos a una solicitud en estado "${sol.estado}".`,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO documentos_adjuntos
         (id_solicitud, nombre_archivo, ruta_archivo, tipo_mime, tamano_bytes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nombre_archivo, tipo_mime, tamano_bytes, subido_en`,
      [sol.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size]);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.SUBIR_DOCUMENTO,
      tabla: 'documentos_adjuntos',
      registro_id: rows[0].id,
      detalle: {
        id_solicitud: sol.id, tipo_solicitud: sol.tipo,
        nombre: req.file.originalname, bytes: req.file.size, mime: req.file.mimetype,
      },
    });

    res.status(201).json({ mensaje: 'Documento adjuntado.', documento: rows[0] });
  } catch (err) {
    descartar(req.file);
    console.error(err.message);
    res.status(500).json({ error: 'Error al adjuntar el documento.' });
  }
};

const descargar = async (req, res) => {
  try {
    const sol = await solicitudAccesible(req, req.params.id);
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada.' });

    const { rows } = await pool.query(
      `SELECT nombre_archivo, ruta_archivo, tipo_mime
         FROM documentos_adjuntos WHERE id = $1 AND id_solicitud = $2`,
      [req.params.idDoc, sol.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    const doc = rows[0];
    const ruta = rutaSegura('documentos', doc.ruta_archivo);
    if (!ruta || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'El archivo ya no esta disponible en el servidor.' });
    }

    res.setHeader('Content-Type', doc.tipo_mime || 'application/octet-stream');
    // El nombre se envia entre comillas y sin saltos de linea para no romper la cabecera.
    const nombre = String(doc.nombre_archivo).replace(/["\r\n]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    fs.createReadStream(ruta).pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al descargar el documento.' });
  }
};

const eliminar = async (req, res) => {
  try {
    const sol = await solicitudAccesible(req, req.params.id);
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    if (!esRRHH(req) && !ESTADOS_EDITABLES.includes(sol.estado)) {
      return res.status(400).json({
        error: `No se pueden eliminar documentos de una solicitud en estado "${sol.estado}".`,
      });
    }

    const { rows } = await pool.query(
      `DELETE FROM documentos_adjuntos WHERE id = $1 AND id_solicitud = $2
       RETURNING nombre_archivo, ruta_archivo`,
      [req.params.idDoc, sol.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    const ruta = rutaSegura('documentos', rows[0].ruta_archivo);
    if (ruta) fs.promises.unlink(ruta).catch(() => {});

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ELIMINAR,
      tabla: 'documentos_adjuntos',
      registro_id: Number(req.params.idDoc),
      detalle: { id_solicitud: sol.id, nombre: rows[0].nombre_archivo },
    });

    res.json({ mensaje: 'Documento eliminado.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al eliminar el documento.' });
  }
};

module.exports = { listar, subir, descargar, eliminar };
