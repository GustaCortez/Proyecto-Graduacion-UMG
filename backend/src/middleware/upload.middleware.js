const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Carga de archivos (documentos adjuntos de solicitudes y fotos de perfil).
 *
 * Decisiones de seguridad:
 *  - El nombre en disco lo genera el servidor (aleatorio), nunca el cliente:
 *    evita que un nombre como "../../server.js" escriba fuera de la carpeta.
 *  - Se valida el tipo MIME contra una lista blanca, no una negra.
 *  - Hay limite de tamano y de cantidad de archivos por peticion.
 *  - El nombre original se guarda en base de datos solo para mostrarlo.
 */

const RAIZ = path.join(__dirname, '..', '..', 'uploads');
const CARPETAS = {
  documentos: path.join(RAIZ, 'documentos'),
  fotos: path.join(RAIZ, 'fotos'),
};

for (const dir of Object.values(CARPETAS)) {
  fs.mkdirSync(dir, { recursive: true });
}

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

/** Nombre impredecible generado por el servidor. */
const nombreSeguro = (extension) => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

function crearSubida({ carpeta, tipos, limiteMB, campo }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, carpeta),
    filename: (req, file, cb) => cb(null, nombreSeguro(tipos[file.mimetype] || '')),
  });

  const subida = multer({
    storage,
    limits: { fileSize: limiteMB * MB, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!tipos[file.mimetype]) {
        return cb(new Error(`Tipo de archivo no permitido (${file.mimetype}). `
          + `Se aceptan: ${Object.keys(tipos).join(', ')}.`));
      }
      cb(null, true);
    },
  }).single(campo);

  // Envoltura para devolver errores de multer como JSON y no como excepcion de Express.
  return (req, res, next) => subida(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el límite de ${limiteMB} MB.`
        : `Error al subir el archivo: ${err.message}`;
      return res.status(400).json({ error: mensaje });
    }
    return res.status(400).json({ error: err.message });
  });
}

const subirDocumento = crearSubida({
  carpeta: CARPETAS.documentos, tipos: TIPOS_DOCUMENTO, limiteMB: 10, campo: 'documento',
});

const subirFoto = crearSubida({
  carpeta: CARPETAS.fotos, tipos: TIPOS_FOTO, limiteMB: 3, campo: 'foto',
});

/** Borra un archivo subido cuando la operacion de base de datos falla. */
function descartar(archivo) {
  if (!archivo) return;
  fs.promises.unlink(archivo.path).catch(() => {});
}

/**
 * Resuelve una ruta guardada en base de datos contra la carpeta de subidas y
 * comprueba que no se escape de ella (defensa contra path traversal).
 */
function rutaSegura(tipo, nombreEnDisco) {
  const base = CARPETAS[tipo];
  const destino = path.resolve(base, path.basename(String(nombreEnDisco)));
  if (!destino.startsWith(path.resolve(base) + path.sep)) return null;
  return destino;
}

module.exports = { subirDocumento, subirFoto, descartar, rutaSegura, CARPETAS, RAIZ };
