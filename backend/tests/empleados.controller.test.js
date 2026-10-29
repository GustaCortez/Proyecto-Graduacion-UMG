/**
 * PU-79 a PU-81: baja de empleado (src/controllers/empleados.controller.js)
 * a traves de PATCH /api/empleados/:id/baja, con la transaccion simulada.
 *
 * La baja debe, en la misma transaccion: marcar al empleado Inactivo, abrir el
 * aviso al IGSS, desactivar la cuenta de usuario ligada al empleado y cerrar
 * sus sesiones (refresh tokens). Si no, el ex empleado seguiria entrando.
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

const TOKEN_RRHH = jwt.sign({ id: 9, username: 'mlopez', rol: 'rrhh' }, process.env.JWT_SECRET,
                            { algorithm: 'HS256', expiresIn: '5m' });

const EMPLEADO = { id: 7, codigo_empleado: 'EMP-0007', nombres: 'Juan', apellidos: 'Pérez', igss: '1234567890' };

/**
 * @param empleado  fila que devuelve el UPDATE empleados (null = no existe o ya inactivo).
 * @param cuentas   usuarios activos ligados al empleado.
 * @param sesiones  refresh tokens abiertos por cuenta.
 */
function clienteMock({ empleado = EMPLEADO, cuentas = [{ id: 20, username: 'jperez' }], sesiones = 2 } = {}) {
  const query = jest.fn(async (sql, params = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
    if (/UPDATE empleados SET estado='Inactivo'/.test(sql)) return { rows: empleado ? [empleado] : [] };
    if (/INSERT INTO bajas_igss/.test(sql))                 return { rows: [{ id: 33 }] };
    if (/UPDATE usuarios SET activo = FALSE/.test(sql)) {
      return { rows: params[0] === EMPLEADO.id ? cuentas : [] };
    }
    if (/UPDATE refresh_tokens SET revocado_en = NOW\(\)\s+WHERE id_usuario = \$1 AND revocado_en IS NULL/.test(sql)) {
      return { rowCount: sesiones, rows: [] };
    }
    throw new Error(`consulta no esperada: ${sql}`);
  });
  return { query, release: jest.fn() };
}

const llamadas = (cli, patron) => cli.query.mock.calls.filter(([sql]) => patron.test(sql));
const darBaja = (id, cuerpo) =>
  request(app).patch(`/api/empleados/${id}/baja`).set('Authorization', `Bearer ${TOKEN_RRHH}`).send(cuerpo);

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  auditoria.registrar.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('PATCH /api/empleados/:id/baja', () => {
  test('PU-79 la baja desactiva la cuenta del empleado y revoca sus refresh tokens en la misma transaccion', async () => {
    const cli = clienteMock();
    pool.connect.mockResolvedValue(cli);

    const res = await darBaja(7, { motivo_baja: 'Renuncia voluntaria presentada por escrito.', tipo_baja: 'Renuncia' });

    expect(res.status).toBe(200);
    expect(res.body.empleado).toEqual(EMPLEADO);
    expect(res.body.aviso_igss).toBe(33);

    const desactivar = llamadas(cli, /UPDATE usuarios SET activo = FALSE/);
    expect(desactivar).toHaveLength(1);
    expect(desactivar[0][1]).toEqual([7]);

    const revocar = llamadas(cli, /UPDATE refresh_tokens SET revocado_en = NOW\(\)/);
    expect(revocar).toHaveLength(1);
    expect(revocar[0][1]).toEqual([20]);

    // Todo dentro de BEGIN ... COMMIT, y antes del COMMIT.
    const orden = cli.query.mock.calls.map(([sql]) => sql.trim());
    const iCommit = orden.findIndex((s) => s === 'COMMIT');
    expect(orden[0]).toBe('BEGIN');
    expect(iCommit).toBeGreaterThan(orden.findIndex((s) => /UPDATE usuarios SET activo = FALSE/.test(s)));
    expect(iCommit).toBeGreaterThan(orden.findIndex((s) => /UPDATE refresh_tokens/.test(s)));
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(0);

    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: 'BAJA_EMPLEADO', tabla: 'empleados', registro_id: 7,
      detalle: expect.objectContaining({
        tipo_baja: 'Renuncia', aviso_igss: 33,
        usuarios_desactivados: ['jperez'], sesiones_cerradas: 2,
      }),
    }), cli);
  });

  test('PU-80 empleado sin cuenta de usuario: la baja procede y el detalle lo deja claro', async () => {
    const cli = clienteMock({ cuentas: [] });
    pool.connect.mockResolvedValue(cli);

    const res = await darBaja(7, { motivo_baja: 'Fin del contrato temporal.', tipo_baja: 'Fin de contrato' });

    expect(res.status).toBe(200);
    expect(llamadas(cli, /UPDATE refresh_tokens/)).toHaveLength(0);
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      detalle: expect.objectContaining({ usuarios_desactivados: [], sesiones_cerradas: 0 }),
    }), cli);
  });

  test('PU-81 empleado inexistente o ya inactivo: 404, ROLLBACK y no se toca ningun usuario', async () => {
    const cli = clienteMock({ empleado: null });
    pool.connect.mockResolvedValue(cli);

    const res = await darBaja(99, { motivo_baja: 'Motivo suficientemente largo.' });

    expect(res.status).toBe(404);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(cli, /UPDATE usuarios/)).toHaveLength(0);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
