const fs = require('fs');
const path = require('path');

/**
 * Almacenamiento de archivos subidos (fotos de empleado, adjuntos de
 * solicitudes y del expediente) con dos proveedores intercambiables:
 *
 *  - local: carpeta UPLOADS_DIR (por defecto backend/uploads). Es lo que se
 *    usa en desarrollo; en Render el disco es efimero y se pierde al
 *    redesplegar.
 *  - s3:    cualquier servicio compatible con S3 (Cloudflare R2, Supabase
 *    Storage, Backblaze B2, AWS S3). Se activa con STORAGE_S3_BUCKET.
 *
 * La base de datos guarda solo el nombre del archivo; la carpeta logica
 * ("fotos" o "documentos") la conoce el controlador. Ambas cosas se unen en
 * una clave "carpeta/nombre" con clave(), que ademas confina el nombre con
 * basename() para que un "../../server.js" nunca salga de la carpeta.
 */

const CARPETAS_LOGICAS = ['documentos', 'fotos'];

const RAIZ = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'));

/** Rutas absolutas de cada carpeta en el proveedor local. */
const CARPETAS = Object.fromEntries(CARPETAS_LOGICAS.map((c) => [c, path.join(RAIZ, c)]));

/**
 * Arma la clave "carpeta/nombre" del archivo. Devuelve null si la carpeta no
 * existe o el nombre se reduce a nada (".", "..", "").
 */
function clave(carpeta, nombre) {
  if (!CARPETAS_LOGICAS.includes(carpeta)) return null;
  const base = path.basename(String(nombre == null ? '' : nombre));
  if (!base || base === '.' || base === '..') return null;
  return `${carpeta}/${base}`;
}

/** Resuelve la ruta en disco dentro de la carpeta (defensa path traversal). */
function rutaSegura(carpeta, nombre) {
  const base = CARPETAS[carpeta];
  if (!base) return null;
  const destino = path.resolve(base, path.basename(String(nombre)));
  if (!destino.startsWith(path.resolve(base) + path.sep)) return null;
  return destino;
}

const separar = (claveArchivo) => {
  const [carpeta, ...resto] = String(claveArchivo).split('/');
  return { carpeta, nombre: resto.join('/') };
};

// ---------------------------------------------------------------------------
// Proveedor local
// ---------------------------------------------------------------------------

function crearLocal() {
  for (const dir of Object.values(CARPETAS)) fs.mkdirSync(dir, { recursive: true });

  const rutaDe = (claveArchivo) => {
    const { carpeta, nombre } = separar(claveArchivo);
    return rutaSegura(carpeta, nombre);
  };

  return {
    nombre: 'local',
    descripcion: `local (${RAIZ}) — en Render los archivos se pierden al redesplegar`,

    async guardar(buffer, claveArchivo) {
      const ruta = rutaDe(claveArchivo);
      if (!ruta) throw new Error(`Clave de archivo invalida: ${claveArchivo}`);
      await fs.promises.writeFile(ruta, buffer);
    },

    async obtener(claveArchivo) {
      const ruta = rutaDe(claveArchivo);
      if (!ruta) return null;
      let info;
      try {
        info = await fs.promises.stat(ruta);
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      if (!info.isFile()) return null;
      return { stream: fs.createReadStream(ruta), mime: null, tamano: info.size };
    },

    async eliminar(claveArchivo) {
      const ruta = rutaDe(claveArchivo);
      if (!ruta) return;
      await fs.promises.unlink(ruta).catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Proveedor S3 compatible
// ---------------------------------------------------------------------------

function crearS3() {
  const {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  } = require('@aws-sdk/client-s3');

  const bucket = process.env.STORAGE_S3_BUCKET;
  const cliente = new S3Client({
    region: process.env.STORAGE_S3_REGION || 'auto',
    endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === '1',
    credentials: {
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY || '',
      secretAccessKey: process.env.STORAGE_S3_SECRET_KEY || '',
    },
    // R2 y B2 no aceptan las sumas de verificacion que el SDK agrega por
    // defecto desde la version 3.729; se piden solo cuando el servicio lo exige.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const noExiste = (err) => err && (err.name === 'NoSuchKey' || err.name === 'NotFound'
    || (err.$metadata && err.$metadata.httpStatusCode === 404));

  return {
    nombre: 's3',
    descripcion: `s3 (bucket ${bucket})`,

    async guardar(buffer, claveArchivo, mime) {
      await cliente.send(new PutObjectCommand({
        Bucket: bucket, Key: claveArchivo, Body: buffer,
        ContentType: mime || 'application/octet-stream',
        ContentLength: buffer.length,
      }));
    },

    async obtener(claveArchivo) {
      try {
        const r = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: claveArchivo }));
        return { stream: r.Body, mime: r.ContentType || null, tamano: r.ContentLength || null };
      } catch (err) {
        if (noExiste(err)) return null;
        throw err;
      }
    },

    async eliminar(claveArchivo) {
      try {
        await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: claveArchivo }));
      } catch (err) {
        if (!noExiste(err)) console.error('[almacenamiento] no se pudo eliminar', claveArchivo, err.message);
      }
    },
  };
}

// ---------------------------------------------------------------------------

const impl = process.env.STORAGE_S3_BUCKET ? crearS3() : crearLocal();

if (process.env.NODE_ENV !== 'test') {
  console.log(`Almacenamiento de archivos: ${impl.descripcion}`);
}

const validarClave = (claveArchivo) => {
  const { carpeta, nombre } = separar(claveArchivo);
  if (clave(carpeta, nombre) !== claveArchivo) throw new Error(`Clave de archivo invalida: ${claveArchivo}`);
};

/** Escribe el archivo. La clave viene de clave(carpeta, nombre). */
async function guardar(buffer, claveArchivo, mime) {
  validarClave(claveArchivo);
  await impl.guardar(buffer, claveArchivo, mime);
}

/** Devuelve { stream, mime, tamano } o null si el archivo no existe. */
async function obtener(claveArchivo) {
  const { carpeta, nombre } = separar(claveArchivo);
  if (clave(carpeta, nombre) !== claveArchivo) return null;
  return impl.obtener(claveArchivo);
}

/** Borra el archivo; no falla si ya no existe. */
async function eliminar(claveArchivo) {
  if (!claveArchivo) return;
  const { carpeta, nombre } = separar(claveArchivo);
  if (clave(carpeta, nombre) !== claveArchivo) return;
  await impl.eliminar(claveArchivo);
}

/**
 * Transmite al cliente un archivo devuelto por obtener(). Los encabezados los
 * fija el controlador antes de llamar; aqui solo se cuida que un error de
 * lectura a mitad de camino no deje la respuesta colgada.
 */
function enviar(res, archivo) {
  if (archivo.tamano) res.setHeader('Content-Length', archivo.tamano);
  archivo.stream.on('error', (err) => {
    console.error('[almacenamiento] error al leer el archivo:', err.message);
    if (res.headersSent) res.destroy(); else res.status(500).json({ error: 'Error al leer el archivo.' });
  });
  archivo.stream.pipe(res);
}

module.exports = {
  proveedor: impl.nombre,
  guardar, obtener, eliminar, enviar,
  clave, rutaSegura, CARPETAS, RAIZ,
};
