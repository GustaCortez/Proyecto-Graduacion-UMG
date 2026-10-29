/**
 * PU-39 a PU-43: servicio de almacenamiento de archivos, proveedor local.
 * Se carga el modulo en aislamiento con UPLOADS_DIR apuntando a una carpeta
 * temporal, de modo que no toca backend/uploads ni depende de S3.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmp;
let almacenamiento;

const cargar = (env) => {
  let mod;
  jest.isolateModules(() => {
    const previo = { ...process.env };
    Object.assign(process.env, env);
    try {
      mod = require('../src/services/almacenamiento');
    } finally {
      process.env = previo;
    }
  });
  return mod;
};

const leerStream = (stream) => new Promise((resolve, reject) => {
  const partes = [];
  stream.on('data', (c) => partes.push(c));
  stream.on('end', () => resolve(Buffer.concat(partes)));
  stream.on('error', reject);
});

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'almacenamiento-'));
  almacenamiento = cargar({ UPLOADS_DIR: tmp });
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('almacenamiento (proveedor local)', () => {
  test('PU-39 sin STORAGE_S3_BUCKET el proveedor es local y crea fotos/ y documentos/ en UPLOADS_DIR', () => {
    expect(almacenamiento.proveedor).toBe('local');
    expect(almacenamiento.RAIZ).toBe(path.resolve(tmp));
    expect(fs.existsSync(path.join(tmp, 'fotos'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'documentos'))).toBe(true);
  });

  test('PU-40 guardar / obtener / eliminar funcionan de punta a punta', async () => {
    const clave = almacenamiento.clave('documentos', '1760000000000-0a1b2c3d4e5f6a7b.pdf');
    expect(clave).toBe('documentos/1760000000000-0a1b2c3d4e5f6a7b.pdf');

    await almacenamiento.guardar(Buffer.from('%PDF-1.4 prueba'), clave, 'application/pdf');
    // La columna de la base guarda solo el nombre: el archivo queda en la subcarpeta esperada.
    expect(fs.existsSync(path.join(tmp, 'documentos', '1760000000000-0a1b2c3d4e5f6a7b.pdf'))).toBe(true);

    const archivo = await almacenamiento.obtener(clave);
    expect(archivo).not.toBeNull();
    expect(archivo.tamano).toBe(15);
    expect((await leerStream(archivo.stream)).toString()).toBe('%PDF-1.4 prueba');

    await almacenamiento.eliminar(clave);
    expect(await almacenamiento.obtener(clave)).toBeNull();
  });

  test('PU-41 obtener devuelve null si no existe y eliminar no falla si ya no esta', async () => {
    const clave = almacenamiento.clave('fotos', 'no-existe.jpg');
    expect(await almacenamiento.obtener(clave)).toBeNull();
    await expect(almacenamiento.eliminar(clave)).resolves.toBeUndefined();
    await expect(almacenamiento.eliminar(null)).resolves.toBeUndefined();
  });

  test('PU-42 clave() confina el nombre a la carpeta (path traversal) y rechaza carpetas desconocidas', async () => {
    expect(almacenamiento.clave('documentos', '../../server.js')).toBe('documentos/server.js');
    expect(almacenamiento.clave('fotos', 'C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe('fotos/hosts');
    expect(almacenamiento.clave('documentos', '..')).toBeNull();
    expect(almacenamiento.clave('documentos', '.')).toBeNull();
    expect(almacenamiento.clave('documentos', '')).toBeNull();
    expect(almacenamiento.clave('otra', 'a.pdf')).toBeNull();

    // Una clave armada a mano que intente salirse no se guarda ni se lee.
    await expect(almacenamiento.guardar(Buffer.from('x'), 'documentos/../server.js', 'text/plain'))
      .rejects.toThrow(/invalida/);
    expect(await almacenamiento.obtener('../server.js')).toBeNull();
    expect(fs.existsSync(path.join(tmp, 'server.js'))).toBe(false);
  });

  test('PU-43 el proveedor local encuentra archivos que ya estaban en disco con el nombre guardado en la base', async () => {
    fs.writeFileSync(path.join(tmp, 'fotos', '1789200421984-79f810aa78ed796a.jpg'), 'jpg-previo');
    const archivo = await almacenamiento.obtener(almacenamiento.clave('fotos', '1789200421984-79f810aa78ed796a.jpg'));
    expect(archivo).not.toBeNull();
    expect((await leerStream(archivo.stream)).toString()).toBe('jpg-previo');
  });
});

describe('almacenamiento (seleccion de proveedor)', () => {
  test('PU-44 con STORAGE_S3_BUCKET el proveedor es s3 y no crea carpetas locales', () => {
    const otro = fs.mkdtempSync(path.join(os.tmpdir(), 'almacenamiento-s3-'));
    try {
      const s3 = cargar({
        UPLOADS_DIR: path.join(otro, 'nunca'),
        STORAGE_S3_BUCKET: 'bucket-prueba',
        STORAGE_S3_ENDPOINT: 'https://ejemplo.r2.cloudflarestorage.com',
        STORAGE_S3_ACCESS_KEY: 'k',
        STORAGE_S3_SECRET_KEY: 's',
      });
      expect(s3.proveedor).toBe('s3');
      expect(fs.existsSync(path.join(otro, 'nunca'))).toBe(false);
    } finally {
      fs.rmSync(otro, { recursive: true, force: true });
    }
  });
});
