/**
 * PU-39 a PU-54: pruebas HTTP sobre la aplicacion Express (app.js) con
 * supertest. La base de datos y el servicio de auditoria se sustituyen por
 * mocks; no se abre ningun puerto ni se toca PostgreSQL.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/services/auditoria', () => {
  const real = jest.requireActual('../src/services/auditoria');
  return { ...real, registrar: jest.fn().mockResolvedValue(undefined) };
});

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const auditoria = require('../src/services/auditoria');
const app = require('../app');

const SECRETO = process.env.JWT_SECRET;
const tokenDe = (usuario) => jwt.sign(usuario, SECRETO, { algorithm: 'HS256', expiresIn: '5m' });
const TOKEN_EMPLEADO = tokenDe({ id: 20, username: 'jperez', rol: 'empleado' });
const TOKEN_RRHH     = tokenDe({ id: 9,  username: 'mlopez', rol: 'rrhh' });

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  auditoria.registrar.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('Aplicacion base', () => {
  test('PU-39 GET / responde 200 con JSON de estado', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ mensaje: 'API Municipalidad funcionando' });
  });

  test('PU-40 ruta inexistente responde 404 { error: "Ruta no encontrada" }', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ruta no encontrada' });
  });

  test('PU-41 helmet agrega cabeceras de seguridad', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('PU-42 CORS refleja el origen configurado del frontend', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('PU-43 CORS nunca refleja un origen ajeno: el navegador bloquea la respuesta', async () => {
    // Con un origen fijo, el paquete cors siempre emite el configurado; lo
    // importante es que NO devuelva el origen del atacante (lista blanca, no eco).
    const res = await request(app).get('/').set('Origin', 'http://malicioso.example');
    expect(res.headers['access-control-allow-origin']).not.toBe('http://malicioso.example');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('PU-44 un cuerpo JSON mayor a 1 MB es rechazado con 413', async () => {
    const enorme = JSON.stringify({ username: 'a', password: 'x'.repeat(1024 * 1024 + 1024) });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(enorme);
    expect(res.status).toBe(413);
    expect(res.body.error).toBeDefined();
  });

  test('PU-45 un cuerpo JSON mal formado es rechazado con 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": "admin", ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  test('PU-46 sin usuario o contrasena responde 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Ingrese usuario y contraseña.' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-47 usuario inexistente responde 401 y queda en auditoria como LOGIN_FALLIDO', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/auth/login').send({ username: 'nadie', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar.mock.calls[0][1]).toEqual(expect.objectContaining({
      accion: 'LOGIN_FALLIDO', tabla: 'usuarios', id_usuario: null,
      detalle: expect.objectContaining({ username: 'nadie' }),
    }));
  });

  test('PU-48 contrasena incorrecta responde 401 con el mismo mensaje y audita al usuario', async () => {
    const password_hash = await bcrypt.hash('Correcta.2026', 4);
    pool.query.mockResolvedValue({ rows: [{ id: 3, username: 'admin', rol: 'admin', password_hash }] });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'otra' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    expect(auditoria.registrar.mock.calls[0][1]).toEqual(expect.objectContaining({
      accion: 'LOGIN_FALLIDO', registro_id: 3, id_usuario: 3,
    }));
  });

  test('PU-49 credenciales validas devuelven token JWT, refreshToken y datos del usuario', async () => {
    const password_hash = await bcrypt.hash('Clave.Segura.2026', 4);
    const usuario = {
      id: 9, username: 'mlopez', rol: 'rrhh', id_empleado: 7, password_hash,
      nombres: 'María', apellidos: 'López',
    };
    pool.query.mockImplementation(async (sql) => {
      if (/FROM usuarios u/.test(sql))            return { rows: [usuario] };
      if (/UPDATE usuarios SET ultimo_acceso/.test(sql)) return { rowCount: 1, rows: [] };
      if (/INSERT INTO refresh_tokens/.test(sql)) return { rows: [{ id: 55 }] };
      throw new Error(`consulta no esperada: ${sql}`);
    });

    const res = await request(app).post('/api/auth/login')
      .send({ username: 'mlopez', password: 'Clave.Segura.2026' });

    expect(res.status).toBe(200);
    expect(res.body.expira_en).toBe('15m');
    expect(res.body.usuario).toEqual({
      id: 9, username: 'mlopez', rol: 'rrhh', id_empleado: 7, nombre: 'María López',
    });

    // El token de acceso se verifica con el secreto de pruebas y lleva el rol.
    const carga = jwt.verify(res.body.token, SECRETO, { algorithms: ['HS256'] });
    expect(carga).toEqual(expect.objectContaining({ id: 9, username: 'mlopez', rol: 'rrhh' }));
    expect(carga).not.toHaveProperty('password_hash');

    // El refresh token es aleatorio (48 bytes en hex) y se guarda como SHA-256, no en claro.
    expect(res.body.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    const insercion = pool.query.mock.calls.find(([sql]) => /INSERT INTO refresh_tokens/.test(sql));
    expect(insercion[1][0]).toBe(9);
    expect(insercion[1][1]).toMatch(/^[0-9a-f]{64}$/);
    expect(insercion[1][1]).not.toBe(res.body.refreshToken);

    expect(auditoria.registrar.mock.calls[0][1]).toEqual(expect.objectContaining({
      accion: 'LOGIN', registro_id: 9, id_usuario: 9,
    }));
  });
});

describe('Control de acceso por rol', () => {
  test('PU-50 GET /api/empleados sin token responde 401 SIN_TOKEN', async () => {
    const res = await request(app).get('/api/empleados');
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('SIN_TOKEN');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-51 GET /api/empleados con rol empleado responde 403 SIN_PERMISO', async () => {
    const res = await request(app).get('/api/empleados').set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('SIN_PERMISO');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-52 GET /api/empleados con rol rrhh responde 200 con la lista', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, nombre_completo: 'Ana Gómez' }] });
    const res = await request(app).get('/api/empleados').set('Authorization', `Bearer ${TOKEN_RRHH}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, nombre_completo: 'Ana Gómez' }]);
  });

  test('PU-53 GET /api/usuarios con rol rrhh responde 403: solo admin administra cuentas', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${TOKEN_RRHH}`);
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('SIN_PERMISO');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-54 token vencido en una ruta protegida responde 401 TOKEN_EXPIRADO', async () => {
    const vencido = jwt.sign({ id: 9, rol: 'rrhh' }, SECRETO, { algorithm: 'HS256', expiresIn: -5 });
    const res = await request(app).get('/api/empleados').set('Authorization', `Bearer ${vencido}`);
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_EXPIRADO');
  });
});
