const path = require('path');
const pool = require('../config/db');
const almacenamiento = require('../services/almacenamiento');
const { CARPETAS } = require('../middleware/upload.middleware');
const auditoria = require('../services/auditoria');

/**
 * Foto de perfil. No se sirve como estático público: va por una ruta
 * autenticada para que no quede accesible adivinando la URL.
 */

const esRRHH = (req) => ['admin', 'rrhh'].includes(req.usuario.rol);

const claveFoto = (nombre) => almacenamiento.clave('fotos', nombre);

function borrarArchivo(nombreEnDisco) {
  const clave = claveFoto(nombreEnDisco);
  if (clave) almacenamiento.eliminar(clave).catch(() => {});
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
  const clave = claveFoto(req.file.filename);
  try {
    const idEmpleado = await empleadoDelUsuario(req.usuario.id);
    if (!idEmpleado) {
      return res.status(400).json({ error: 'Su usuario no está ligado a un expediente de empleado.' });
    }

    const previo = await pool.query('SELECT foto_url FROM empleados WHERE id = $1', [idEmpleado]);
    const anterior = previo.rows[0] ? previo.rows[0].foto_url : null;

    // Primero el archivo y luego la fila: si el almacenamiento falla no queda
    // una referencia a un archivo que no existe.
    try {
      await almacenamiento.guardar(req.file.buffer, clave, req.file.mimetype);
    } catch (err) {
      console.error('[foto] no se pudo guardar el archivo:', err.message);
      return res.status(500).json({
        error: 'No se pudo guardar la imagen en el almacenamiento de archivos. Intente de nuevo.',
      });
    }

    try {
      await pool.query('UPDATE empleados SET foto_url = $1 WHERE id = $2',
        [req.file.filename, idEmpleado]);
    } catch (err) {
      await almacenamiento.eliminar(clave).catch(() => {});
      throw err;
    }
    if (anterior && anterior !== req.file.filename) borrarArchivo(anterior);

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

    // RETURNING trae la fila previa: da el archivo a borrar sin una lectura extra.
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

    const clave = claveFoto(nombre);
    const archivo = clave ? await almacenamiento.obtener(clave) : null;
    if (!archivo) {
      return res.status(404).json({ error: 'La imagen ya no está disponible.' });
    }

    const tipos = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type',
      tipos[path.extname(nombre).toLowerCase()] || archivo.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    almacenamiento.enviar(res, archivo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener la foto.' });
  }
};

module.exports = { subirMiFoto, eliminarMiFoto, servir, CARPETAS };
