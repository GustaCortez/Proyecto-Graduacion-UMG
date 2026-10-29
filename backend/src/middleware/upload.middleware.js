const multer = require('multer');
const crypto = require('crypto');
const almacenamiento = require('../services/almacenamiento');

/**
 * Carga de archivos. El archivo llega a memoria (req.file.buffer) y el
 * controlador lo entrega al servicio de almacenamiento (disco o S3). El
 * nombre lo genera el servidor, nunca el cliente (un "../../server.js"
 * escribiria fuera de la carpeta); el MIME se valida contra lista blanca y el
 * nombre original solo se guarda para mostrar.
 */

const MB = 1024 * 1024;

const TIPOS_DOCUMENTO = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const TIPOS_FOTO = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const nombreSeguro = (extension) => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

function crearSubida({ tipos, limiteMB, campo }) {
  const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limiteMB * MB, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!tipos[file.mimetype]) {
        return cb(new Error(`Tipo de archivo no permitido (${file.mimetype}). `
          + `Se aceptan: ${Object.keys(tipos).join(', ')}.`));
      }
      cb(null, true);
    },
  }).single(campo);

  // Devuelve los errores de multer como JSON, no como excepcion de Express.
  return (req, res, next) => subida(req, res, (err) => {
    if (!err) {
      // Mismo contrato que tenia diskStorage: el controlador usa req.file.filename.
      if (req.file) req.file.filename = nombreSeguro(tipos[req.file.mimetype] || '');
      return next();
    }
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el límite de ${limiteMB} MB.`
        : `Error al subir el archivo: ${err.message}`;
      return res.status(400).json({ error: mensaje });
    }
    return res.status(400).json({ error: err.message });
  });
}

const subirDocumento = crearSubida({ tipos: TIPOS_DOCUMENTO, limiteMB: 10, campo: 'documento' });

const subirFoto = crearSubida({ tipos: TIPOS_FOTO, limiteMB: 3, campo: 'foto' });

// Se reexportan para quien ya los importaba de aqui (y para las pruebas PU-35 a PU-38).
const { rutaSegura, CARPETAS, RAIZ } = almacenamiento;

module.exports = { subirDocumento, subirFoto, rutaSegura, CARPETAS, RAIZ, TIPOS_DOCUMENTO, TIPOS_FOTO };
