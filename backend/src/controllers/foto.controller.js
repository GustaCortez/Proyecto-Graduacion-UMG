const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { descartar, rutaSegura, CARPETAS } = require('../middleware/upload.middleware');
const auditoria = require('../services/auditoria');

/**
 * Foto de perfil del empleado.
 *
 * Los archivos NO se sirven como estáticos públicos: se entregan por una ruta
 * autenticada, para que la foto del personal no quede accesible a cualquiera
 * que adivine la URL.
 */

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

/** Borra del disco la foto anterior para no dejar archivos huérfanos. */
function borrarArchivo(nombreEnDisco) {
  if (!nombreEnDisco) return;
  const ruta = rutaSegura('fotos', nombreEnDisco);
  if (ruta) fs.promises.unlink(ruta).catch(() => {});
}

async function empleadoDelUsuario(idUsuario) {
  const { rows } = await pool.query(
    'SELECT id_empleado FROM usuarios WHERE id = $1', [idUsuario]);
  return rows[0] ? rows[0].id_empleado : null;
}

const subirMiFoto = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Adjunte una imagen en el campo "foto".' });
  }
  try {
    const idEmpleado = await empleadoDelUsuario(req.usuario.id);
    if (!idEmpleado) {
      descartar(req.file);
      return res.status(400).json({ error: 'Su usuario no está ligado a un expediente de empleado.' });
    }

    const previo = await pool.query('SELECT foto_url FROM empleados WHERE id = $1', [idEmpleado]);
    const anterior = previo.rows[0] ? previo.rows[0].foto_url : null;

    await pool.query('UPDATE empleados SET foto_url = $1 WHERE id = $2',
      [req.file.filename, idEmpleado]);
    borrarArchivo(anterior);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ACTUALIZAR,
      tabla: 'empleados',
      registro_id: idEmpleado,
      detalle: { campo: 'foto_url', bytes: req.file.size, mime: req.file.mimetype },
    });

    res.json({
      mensaje: 'Foto de perfil actualizada.',
      foto_url: `/api/empleados/${idEmpleado}/foto`,
    });
  } catch (err) {
    descartar(req.file);
    console.error(err.message);
    res.status(500).json({ error: 'Error al guardar la foto.' });
  }
};

const eliminarMiFoto = async (req, res) => {
  try {
    const idEmpleado = await empleadoDelUsuario(req.usuario.id);
    if (!idEmpleado) {
      return res.status(400).json({ error: 'Su usuario no está ligado a un expediente de empleado.' });
    }

    // RETURNING devuelve la fila previa a la actualización en la misma consulta,
    // así se conoce el archivo a borrar sin una lectura extra.
    const { rows } = await pool.query(
      `UPDATE empleados e SET foto_url = NULL
         FROM (SELECT id, foto_url FROM empleados WHERE id = $1) AS antes
        WHERE e.id = antes.id
       RETURNING antes.foto_url AS anterior`, [idEmpleado]);

    if (rows.length === 0) return res.status(404).json({ error: 'Empleado no encontrado.' });
    borrarArchivo(rows[0].anterior);

    res.json({ mensaje: 'Foto de perfil eliminada.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al eliminar la foto.' });
  }
};

/**
 * Entrega la imagen. Un empleado solo puede ver la suya; RRHH y admin pueden
 * ver la de cualquiera (la necesitan en el listado de personal).
 */
const servir = async (req, res) => {
  const { id } = req.params;
  try {
    if (!esRRHH(req)) {
      const propio = await empleadoDelUsuario(req.usuario.id);
      if (String(propio) !== String(id)) {
        return res.status(403).json({ error: 'No puede ver la foto de otro empleado.' });
      }
    }

    const { rows } = await pool.query('SELECT foto_url FROM empleados WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Empleado no encontrado.' });

    const nombre = rows[0].foto_url;
    if (!nombre) return res.status(404).json({ error: 'El empleado no tiene foto.' });

    const ruta = rutaSegura('fotos', nombre);
    if (!ruta || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'La imagen ya no está disponible.' });
    }

    const tipos = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', tipos[path.extname(ruta).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(ruta).pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener la foto.' });
  }
};

module.exports = { subirMiFoto, eliminarMiFoto, servir, CARPETAS };
