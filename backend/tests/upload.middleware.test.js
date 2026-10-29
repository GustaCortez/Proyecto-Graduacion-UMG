/**
 * PU-35 a PU-38: defensa contra path traversal en la carpeta de subidas.
 * PU-45 a PU-48: el middleware recibe el archivo en memoria, genera el nombre
 * en el servidor y rechaza tipos no permitidos y archivos demasiado grandes.
 */
const path = require('path');
const express = require('express');
const request = require('supertest');
const {
  rutaSegura, CARPETAS, subirFoto, subirDocumento,
} = require('../src/middleware/upload.middleware');

const dentroDe = (base, ruta) => ruta !== null && ruta.startsWith(path.resolve(base) + path.sep);

describe('rutaSegura', () => {
  test('PU-35 un nombre plano se resuelve dentro de uploads/documentos', () => {
    const ruta = rutaSegura('documentos', '1760000000000-0a1b2c3d4e5f6a7b.pdf');
    expect(ruta).toBe(path.join(CARPETAS.documentos, '1760000000000-0a1b2c3d4e5f6a7b.pdf'));
    expect(dentroDe(CARPETAS.documentos, ruta)).toBe(true);
  });

  test('PU-36 "../../server.js" no escapa de la carpeta de subidas', () => {
    const ruta = rutaSegura('documentos', '../../server.js');
    expect(dentroDe(CARPETAS.documentos, ruta)).toBe(true);
    expect(ruta).not.toBe(path.resolve(__dirname, '..', 'server.js'));
    expect(ruta).not.toContain('..');
  });

  test('PU-37 rutas absolutas (Windows y POSIX) quedan confinadas a la carpeta', () => {
    const intentos = [
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      '/etc/passwd',
      'C:/Sistema Web solicitudes/backend/.env',
    ];
    for (const intento of intentos) {
      const ruta = rutaSegura('fotos', intento);
      expect(dentroDe(CARPETAS.fotos, ruta)).toBe(true);
    }
  });

  test('PU-38 nombres que resuelven a la carpeta misma o a su padre devuelven null', () => {
    expect(rutaSegura('documentos', '..')).toBeNull();
    expect(rutaSegura('documentos', '.')).toBeNull();
    expect(rutaSegura('documentos', '')).toBeNull();
  });
});

describe('subida en memoria', () => {
  // App minima: el "controlador" devuelve lo que multer dejo en req.file.
  const app = express();
  const eco = (req, res) => res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    enMemoria: Buffer.isBuffer(req.file.buffer),
    tienePath: 'path' in req.file,
  });
  app.post('/foto', subirFoto, eco);
  app.post('/documento', subirDocumento, eco);

  test('PU-45 el archivo llega como buffer y el nombre lo genera el servidor, con la extension del MIME', async () => {
    const res = await request(app).post('/foto')
      .attach('foto', Buffer.from('imagen'), { filename: '../../server.js', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.enMemoria).toBe(true);
    expect(res.body.tienePath).toBe(false);
    expect(res.body.size).toBe(6);
    expect(res.body.mimetype).toBe('image/png');
    // El nombre original es solo para mostrar (multer ya le quita las carpetas).
    expect(res.body.originalname).toBe('server.js');
    // El nombre con el que se guarda nunca es el del cliente.
    expect(res.body.filename).toMatch(/^\d{13}-[0-9a-f]{16}\.png$/);
  });

  test('PU-46 un tipo fuera de la lista blanca responde 400', async () => {
    const res = await request(app).post('/foto')
      .attach('foto', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no permitido/);
    expect(res.body.error).toMatch(/image\/jpeg/);
  });

  test('PU-47 el PDF se acepta como documento pero no como foto', async () => {
    const pdf = { filename: 'acta.pdf', contentType: 'application/pdf' };
    const doc = await request(app).post('/documento').attach('documento', Buffer.from('%PDF'), pdf);
    expect(doc.status).toBe(200);
    expect(doc.body.filename).toMatch(/\.pdf$/);

    const foto = await request(app).post('/foto').attach('foto', Buffer.from('%PDF'), pdf);
    expect(foto.status).toBe(400);
  });

  test('PU-48 un archivo que supera el limite responde 400 con el tamano maximo', async () => {
    const grande = Buffer.alloc(3 * 1024 * 1024 + 1);
    const res = await request(app).post('/foto')
      .attach('foto', grande, { filename: 'grande.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El archivo supera el límite de 3 MB.');
  });
});
