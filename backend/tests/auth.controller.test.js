/**
 * PU-73 a PU-78: renovacion del refresh token (src/controllers/auth.controller.js)
 * a traves de POST /api/auth/refresh, con la transaccion simulada: pool.connect()
 * devuelve un cliente falso cuyo query responde segun el SQL recibido.
 *
 * Cubre la rotacion normal, la ventana de gracia (dos pestanas renovando a la
 * vez no expulsan al usuario) y el reuso fuera de la ventana (robo: se cierran
 * todas las sesiones).
 */
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/services/auditoria', () => {
  const real = jest.requireActual('../src/services/auditoria');
  return { ...real, registrar: jest.fn().mockResolvedValue(undefined) };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const auditoria = require('../src/services/auditoria');
const app = require('../app');

const EN_UN_DIA = new Date(Date.now() + 24 * 60 * 60 * 1000);
const USUARIO = { id_usuario: 20, username: 'jperez', rol: 'empleado', activo: true, id_empleado: 7,
                  nombres: 'Juan', apellidos: 'Pérez' };

/**
 * @param fila  lo que devuelve el SELECT ... FOR UPDATE OF rt para el token recibido
 *              (null = hash desconocido).
 * @param vigente  lo que devuelve la busqueda del reemplazo vigente (fila.reemplazado_por).
 * @param abiertas  sesiones abiertas que cerraria revocarTodos.
 */
function clienteMock({ fila, vigente = null, abiertas = 2 } = {}) {
  const query = jest.fn(async (sql, params = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
    if (/FOR UPDATE OF rt/.test(sql))                 return { rows: fila ? [fila] : [] };
    if (/SELECT id FROM refresh_tokens\s+WHERE id = \$1 AND id_usuario = \$2 AND revocado_en IS NULL/.test(sql)) {
      return { rows: vigente && vigente.id === params[0] ? [vigente] : [] };
    }
    if (/UPDATE refresh_tokens SET revocado_en = NOW\(\)\s+WHERE id_usuario = \$1 AND revocado_en IS NULL/.test(sql)) {
      return { rowCount: abiertas, rows: [] };
    }
    if (/UPDATE refresh_tokens SET revocado_en = NOW\(\) WHERE id = \$1/.test(sql)) return { rowCount: 1, rows: [] };
    if (/INSERT INTO refresh_tokens/.test(sql))       return { rows: [{ id: 900 }] };
    if (/UPDATE refresh_tokens SET reemplazado_por/.test(sql)) return { rowCount: 1, rows: [] };
    throw new Error(`consulta no esperada: ${sql}`);
  });
  return { query, release: jest.fn() };
}

const llamadas = (cli, patron) => cli.query.mock.calls.filter(([sql]) => patron.test(sql));
const renovar = () => request(app).post('/api/auth/refresh').send({ refreshToken: 'a'.repeat(96) });

let cli;
beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  auditoria.registrar.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('POST /api/auth/refresh', () => {
  test('PU-73 token vigente: rota (revoca el recibido, emite uno nuevo) y devuelve el par', async () => {
    cli = clienteMock({ fila: { id: 100, ...USUARIO, expira_en: EN_UN_DIA, revocado_en: null,
                                reemplazado_por: null, revocado_hace_seg: null } });
    pool.connect.mockResolvedValue(cli);

    const res = await renovar();

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({ id: 20, rol: 'empleado' });
    expect(res.body.usuario).toEqual({ id: 20, username: 'jperez', rol: 'empleado', id_empleado: 7, nombre: 'Juan Pérez' });

    const revocado = llamadas(cli, /SET revocado_en = NOW\(\) WHERE id = \$1/);
    expect(revocado).toHaveLength(1);
    expect(revocado[0][1]).toEqual([100]);
    expect(llamadas(cli, /SET reemplazado_por/)[0][1]).toEqual([900, 100]);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: 'TOKEN_RENOVADO', detalle: { anterior: 100 } }), cli);
  });

  test('PU-74 ventana de gracia: reuso de un token rotado hace 2 s por otra pestaña NO expulsa, rota desde el vigente', async () => {
    cli = clienteMock({
      fila: { id: 100, ...USUARIO, expira_en: EN_UN_DIA, revocado_en: new Date(Date.now() - 2000),
              reemplazado_por: 101, revocado_hace_seg: '2.1' },
      vigente: { id: 101 },
    });
    pool.connect.mockResolvedValue(cli);

    const res = await renovar();

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({ id: 20 });

    // Se rota el reemplazo vigente (101), no el recibido (100), y nada se cierra en masa.
    expect(llamadas(cli, /WHERE id = \$1 AND id_usuario = \$2 AND revocado_en IS NULL/)[0][1]).toEqual([101, 20]);
    expect(llamadas(cli, /SET revocado_en = NOW\(\) WHERE id = \$1/)[0][1]).toEqual([101]);
    expect(llamadas(cli, /SET reemplazado_por/)[0][1]).toEqual([900, 101]);
    expect(llamadas(cli, /WHERE id_usuario = \$1 AND revocado_en IS NULL/)).toHaveLength(0);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: 'TOKEN_RENOVADO',
      detalle: expect.objectContaining({ anterior: 101, gracia: true, reutilizado: 100 }) }), cli);
    expect(auditoria.registrar).not.toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ accion: 'TOKEN_REUSADO' }), expect.anything());
  });

  test('PU-75 fuera de la ventana: reuso de un token revocado hace 45 s se trata como robo y cierra todas las sesiones', async () => {
    cli = clienteMock({
      fila: { id: 100, ...USUARIO, expira_en: EN_UN_DIA, revocado_en: new Date(Date.now() - 45000),
              reemplazado_por: 101, revocado_hace_seg: '45' },
      vigente: { id: 101 },
      abiertas: 3,
    });
    pool.connect.mockResolvedValue(cli);

    const res = await renovar();

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/uso indebido/);
    expect(res.body.refreshToken).toBeUndefined();
    // Ni siquiera se consulta el reemplazo: fuera de la ventana no hay gracia.
    expect(llamadas(cli, /WHERE id = \$1 AND id_usuario = \$2 AND revocado_en IS NULL/)).toHaveLength(0);
    expect(llamadas(cli, /WHERE id_usuario = \$1 AND revocado_en IS NULL/)[0][1]).toEqual([20]);
    expect(llamadas(cli, /INSERT INTO refresh_tokens/)).toHaveLength(0);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: 'TOKEN_REUSADO', registro_id: 100,
      detalle: expect.objectContaining({ sesiones_cerradas: 3 }) }), cli);
  });

  test('PU-76 dentro de la ventana pero el reemplazo ya no esta vigente (robo encadenado): cierra todas las sesiones', async () => {
    cli = clienteMock({
      fila: { id: 100, ...USUARIO, expira_en: EN_UN_DIA, revocado_en: new Date(Date.now() - 5000),
              reemplazado_por: 101, revocado_hace_seg: '5' },
      vigente: null,
    });
    pool.connect.mockResolvedValue(cli);

    const res = await renovar();

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/uso indebido/);
    expect(llamadas(cli, /WHERE id = \$1 AND id_usuario = \$2 AND revocado_en IS NULL/)).toHaveLength(1);
    expect(llamadas(cli, /WHERE id_usuario = \$1 AND revocado_en IS NULL/)).toHaveLength(1);
    expect(llamadas(cli, /INSERT INTO refresh_tokens/)).toHaveLength(0);
  });

  test('PU-77 token revocado sin reemplazo (logout) reutilizado: no hay gracia aunque sea reciente', async () => {
    cli = clienteMock({
      fila: { id: 100, ...USUARIO, expira_en: EN_UN_DIA, revocado_en: new Date(Date.now() - 1000),
              reemplazado_por: null, revocado_hace_seg: '1' },
    });
    pool.connect.mockResolvedValue(cli);

    const res = await renovar();

    expect(res.status).toBe(401);
    expect(llamadas(cli, /WHERE id = \$1 AND id_usuario = \$2 AND revocado_en IS NULL/)).toHaveLength(0);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ accion: 'TOKEN_REUSADO' }), cli);
  });

  test('PU-78 hash desconocido responde 401 sin tocar nada; token vencido responde 401 y hace ROLLBACK', async () => {
    cli = clienteMock({ fila: null });
    pool.connect.mockResolvedValue(cli);
    let res = await renovar();
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Sesión inválida/);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);

    cli = clienteMock({ fila: { id: 100, ...USUARIO, expira_en: new Date(Date.now() - 1000), revocado_en: null,
                                reemplazado_por: null, revocado_hace_seg: null } });
    pool.connect.mockResolvedValue(cli);
    res = await renovar();
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expiró/);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(cli, /INSERT INTO refresh_tokens/)).toHaveLength(0);
  });
});
