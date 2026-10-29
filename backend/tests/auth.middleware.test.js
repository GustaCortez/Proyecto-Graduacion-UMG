/**
 * PU-25 a PU-34: middleware de autenticacion y autorizacion.
 */
const jwt = require('jsonwebtoken');
const { verificarToken, soloAdmin, soloRRHH } = require('../src/middleware/auth.middleware');

const SECRETO = process.env.JWT_SECRET;

const resMock = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const reqCon = (authorization) => ({ headers: authorization ? { authorization } : {} });

describe('verificarToken', () => {
  test('PU-25 sin cabecera Authorization responde 401 SIN_TOKEN', () => {
    const req = reqCon(); const res = resMock(); const next = jest.fn();
    verificarToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIN_TOKEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('PU-26 token mal formado responde 401 TOKEN_INVALIDO', () => {
    const res = resMock(); const next = jest.fn();
    verificarToken(reqCon('Bearer esto.no.es.un.jwt'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'TOKEN_INVALIDO' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('PU-27 token vencido responde 401 TOKEN_EXPIRADO', () => {
    const vencido = jwt.sign({ id: 1, rol: 'admin' }, SECRETO, { algorithm: 'HS256', expiresIn: -10 });
    const res = resMock(); const next = jest.fn();
    verificarToken(reqCon(`Bearer ${vencido}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'TOKEN_EXPIRADO' }));
  });

  test('PU-28 token valido HS256 llama a next y expone req.usuario', () => {
    const token = jwt.sign({ id: 5, username: 'mlopez', rol: 'rrhh' }, SECRETO, { algorithm: 'HS256', expiresIn: '5m' });
    const req = reqCon(`Bearer ${token}`); const res = resMock(); const next = jest.fn();
    verificarToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.usuario).toEqual(expect.objectContaining({ id: 5, username: 'mlopez', rol: 'rrhh' }));
  });

  test('PU-29 token firmado con otro secreto es rechazado como TOKEN_INVALIDO', () => {
    const ajeno = jwt.sign({ id: 1, rol: 'admin' }, 'otro-secreto-de-al-menos-treinta-y-dos-caracteres', { expiresIn: '5m' });
    const res = resMock(); const next = jest.fn();
    verificarToken(reqCon(`Bearer ${ajeno}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'TOKEN_INVALIDO' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('PU-30 token con algoritmo "none" (sin firma) es rechazado', () => {
    const sinFirma = jwt.sign({ id: 1, rol: 'admin' }, '', { algorithm: 'none' });
    const res = resMock(); const next = jest.fn();
    verificarToken(reqCon(`Bearer ${sinFirma}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'TOKEN_INVALIDO' }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('soloAdmin', () => {
  test('PU-31 admin pasa', () => {
    const next = jest.fn(); const res = resMock();
    soloAdmin({ usuario: { rol: 'admin' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each(['rrhh', 'empleado'])('PU-32 rol %s recibe 403 SIN_PERMISO', (rol) => {
    const next = jest.fn(); const res = resMock();
    soloAdmin({ usuario: { rol } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIN_PERMISO' }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('soloRRHH', () => {
  test.each(['admin', 'rrhh'])('PU-33 rol %s pasa', (rol) => {
    const next = jest.fn(); const res = resMock();
    soloRRHH({ usuario: { rol } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('PU-34 rol empleado recibe 403 SIN_PERMISO', () => {
    const next = jest.fn(); const res = resMock();
    soloRRHH({ usuario: { rol: 'empleado' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIN_PERMISO' }));
    expect(next).not.toHaveBeenCalled();
  });
});
