/**
 * PU-55 a PU-63: reglas de negocio de solicitudes (src/controllers/solicitudes.controller.js)
 * a traves de la API, con la transaccion simulada: pool.connect() devuelve un
 * cliente falso cuyo query responde segun el SQL recibido.
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
const { ARTICULO } = require('../src/utils/vacaciones');
const app = require('../app');

const tokenDe = (u) => jwt.sign(u, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
const TOKEN_RRHH     = tokenDe({ id: 9,  username: 'mlopez', rol: 'rrhh' });
const TOKEN_EMPLEADO = tokenDe({ id: 20, username: 'jperez', rol: 'empleado' });

const TIPO_CONSTANCIA = { id: 3, nombre: 'Constancia laboral', activo: true, es_ausencia: false };
const TIPO_VACACIONES = { id: 1, nombre: 'Vacaciones',         activo: true, es_ausencia: true };
const MOTIVO = 'Trámite personal ante el banco.';

/** Asueto nacional dentro del rango consultado: 2026-10-20, Día de la Revolución. */
const feriados = ([desde, hasta]) =>
  desde <= '2026-10-20' && hasta >= '2026-10-20' ? [{ fecha: '2026-10-20', nombre: 'Día de la Revolución de 1944' }] : [];

/**
 * Opciones:
 *  - diasTomados: dias ya gozados del registro de vacaciones que se crea en la corrida.
 *  - vacacionesExistente: fila que YA estaba en la tabla (p. ej. ajustada por RRHH);
 *    el INSERT ... DO NOTHING no inserta nada y el SELECT devuelve esta fila.
 *  - solapadas: filas que devuelve la comprobacion de solapamiento de fechas.
 */
function clienteMock({
  tipo, empleado, diasTomados = 0, idEmpleadoDelUsuario = 7, solicitud, ultimoAcuerdo = 0,
  vacacionesExistente = null, solapadas = [],
} = {}) {
  let insertada = null; // fila que "quedo" tras el INSERT ... ON CONFLICT DO NOTHING
  const query = jest.fn(async (sql, params = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
    // --- solapamiento de fechas (crear y aprobar) ---
    if (/s\.estado = ANY\(\$2::text\[\]\)/.test(sql)) return { rows: solapadas };
    // --- aprobacion (PATCH /:id/estado) ---
    if (/FOR UPDATE OF s/.test(sql))                 return { rows: solicitud ? [solicitud] : [] };
    if (/AS anio\s+FROM solicitudes s WHERE s\.id = \$1 FOR UPDATE/.test(sql)) {
      return { rows: solicitud ? [{ ...solicitud, anio: solicitud.inicio.slice(0, 4) }] : [] };
    }
    if (/UPDATE solicitudes SET libro = \$1/.test(sql)) {
      return { rows: [{ id: solicitud.id, libro: params[0], folio: params[1], numero_acuerdo: params[2] }] };
    }
    if (/pg_advisory_xact_lock/.test(sql))           return { rows: [] };
    if (/MAX\(NULLIF\(split_part\(numero_acuerdo/.test(sql)) return { rows: [{ n: ultimoAcuerdo + 1 }] };
    if (/UPDATE vacaciones SET dias_tomados/.test(sql)) return { rows: [] };
    if (/UPDATE solicitudes SET/.test(sql)) {
      return { rows: [{ ...solicitud, estado: params[0], dias_descontados: params[3],
                        libro: params[6] ?? solicitud.libro ?? null,
                        folio: params[7] ?? solicitud.folio ?? null,
                        numero_acuerdo: params[8] ?? solicitud.numero_acuerdo ?? null }] };
    }
    if (/SELECT id FROM usuarios WHERE id_empleado/.test(sql)) return { rows: [{ id: 20 }] };
    if (/SELECT id_empleado FROM usuarios WHERE id/.test(sql)) {
      return { rows: idEmpleadoDelUsuario ? [{ id_empleado: idEmpleadoDelUsuario }] : [] };
    }
    if (/es_ausencia FROM tipos_solicitud WHERE id/.test(sql)) return { rows: tipo ? [tipo] : [] };
    if (/FROM tipos_solicitud WHERE nombre ILIKE/.test(sql))  return { rows: [{ id: TIPO_VACACIONES.id }] };
    if (/FROM dias_feriados/.test(sql))                        return { rows: feriados(params) };
    if (/AS fecha_ingreso FROM empleados/.test(sql))           return { rows: empleado ? [empleado] : [] };
    if (/INSERT INTO vacaciones/.test(sql)) {
      // INSERT ... ON CONFLICT DO NOTHING: si ya habia fila no inserta nada; si
      // no, queda una fila con los asignados segun antiguedad (los calculo el
      // codigo) y los dias ya tomados ese anio.
      if (vacacionesExistente) return { rows: [], rowCount: 0 };
      insertada = { id: 3, id_empleado: params[0], anio: params[1], dias_asignados: params[2],
                    dias_tomados: diasTomados, derecho_desde: params[3] };
      return { rows: [], rowCount: 1 };
    }
    if (/FROM vacaciones WHERE id_empleado = \$1 AND anio = \$2/.test(sql)) {
      const fila = vacacionesExistente || insertada;
      return { rows: fila ? [fila] : [] };
    }
    if (/INSERT INTO solicitudes/.test(sql)) {
      return { rows: [{ id: 101, id_empleado: params[0], id_tipo: params[1], fecha_inicio: params[2],
                        fecha_fin: params[3], dias_solicitados: params[4], dias_habiles: params[5],
                        motivo: params[6], estado: 'En revision' }] };
    }
    if (/AS nombre FROM empleados WHERE id/.test(sql))         return { rows: [{ nombre: 'Juan Pérez' }] };
    if (/SELECT id FROM usuarios WHERE activo = TRUE AND rol IN/.test(sql)) return { rows: [{ id: 1 }, { id: 9 }] };
    if (/INSERT INTO notificaciones/.test(sql)) {
      return { rows: [{ id: 70, titulo: params[1], mensaje: params[2], leida: false, id_solicitud: params[3] }] };
    }
    throw new Error(`consulta no esperada: ${sql}`);
  });
  return { query, release: jest.fn() };
}

const llamadas = (cli, patron) => cli.query.mock.calls.filter(([sql]) => patron.test(sql));

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  auditoria.registrar.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('POST /api/solicitudes - tramites de documento', () => {
  test('PU-55 una constancia descarta fecha_fin, registra 0 dias habiles y no consulta asuetos', async () => {
    const cli = clienteMock({ tipo: TIPO_CONSTANCIA });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 3, fecha_inicio: '2026-10-16', fecha_fin: '2026-10-30', motivo: MOTIVO });

    expect(res.status).toBe(201);
    expect(res.body.mensaje).toBe('Solicitud creada exitosamente.');
    expect(res.body.solicitud).toEqual(expect.objectContaining({ fecha_fin: null, dias_habiles: 0 }));

    const [insercion] = llamadas(cli, /INSERT INTO solicitudes/);
    expect(insercion[1]).toEqual([7, 3, '2026-10-16', null, 0, 0, MOTIVO]);
    expect(llamadas(cli, /FROM dias_feriados/)).toHaveLength(0);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
    expect(cli.release).toHaveBeenCalledTimes(1);
  });

  test('PU-56 el aviso a RRHH habla de "con fecha" y no se envia a quien la registro', async () => {
    const cli = clienteMock({ tipo: TIPO_CONSTANCIA });
    pool.connect.mockResolvedValue(cli);

    await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 3, fecha_inicio: '2026-10-16', motivo: MOTIVO });

    const avisos = llamadas(cli, /INSERT INTO notificaciones/);
    expect(avisos).toHaveLength(1);                 // RRHH son los usuarios 1 y 9; el 9 es quien registra
    expect(avisos[0][1][0]).toBe(1);
    expect(avisos[0][1][2]).toBe('Juan Pérez solicitó constancia laboral con fecha 2026-10-16.');
    expect(avisos[0][1][2]).not.toMatch(/días hábiles/);
    expect(auditoria.registrar.mock.calls[0][1]).toEqual(expect.objectContaining({
      accion: 'CREAR', tabla: 'solicitudes', registro_id: 101,
      detalle: expect.objectContaining({ es_ausencia: false, fecha_fin: null, dias_habiles: 0 }),
    }));
  });
});

describe('POST /api/solicitudes - saldo de vacaciones', () => {
  // Empleado con ingreso 2024-02-01: en 2026 cumple 2 anios -> 20 dias habiles.
  const EMPLEADO = { id: 7, fecha_ingreso: '2024-02-01' };

  test('PU-57 rechaza con 400 si los dias habiles superan el saldo y revierte la transaccion', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, diasTomados: 15 });
    pool.connect.mockResolvedValue(cli);

    // 2026-10-12 al 2026-10-23: 10 dias entre semana menos el asueto del 20 = 9 habiles.
    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-23', motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Solicita 9 días hábiles pero su saldo disponible es de 5.',
      dias_habiles: 9, saldo: 5, dias_asignados: 20, dias_tomados: 15,
    });
    expect(llamadas(cli, /INSERT INTO solicitudes/)).toHaveLength(0);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(0);
    expect(cli.release).toHaveBeenCalledTimes(1);
  });

  test('PU-58 sin un anio de servicio no hay derecho: 400 con cita legal', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: { id: 7, fecha_ingreso: '2026-03-01' } });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-26', fecha_fin: '2026-10-27', motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Aún no ha cumplido un año de servicio continuo/);
    expect(res.body.error).toContain(ARTICULO);
    expect(res.body).toEqual(expect.objectContaining({ dias_asignados: 0, saldo: 0 }));
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
  });

  test('PU-59 antes del aniversario de ingreso el derecho del anio aun no se adquiere', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: { id: 7, fecha_ingreso: '2024-11-01' } });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-26', fecha_fin: '2026-10-27', motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.derecho_desde).toBe('2026-11-01');
    expect(res.body.error).toContain('se adquiere hasta el 2026-11-01');
  });

  test('PU-60 un rango solo de fin de semana no contiene dias habiles: 400', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-17', fecha_fin: '2026-10-18', motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ningún día hábil/);
  });

  test('PU-61 con saldo suficiente crea la solicitud con los dias habiles calculados', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, diasTomados: 10 });
    pool.connect.mockResolvedValue(cli);

    // Lunes 26 a viernes 30 de octubre de 2026: 5 habiles, sin asuetos; saldo 20 - 10 = 10.
    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-26', fecha_fin: '2026-10-30', motivo: MOTIVO });

    expect(res.status).toBe(201);
    expect(res.body.solicitud.dias_habiles).toBe(5);
    const [insercion] = llamadas(cli, /INSERT INTO solicitudes/);
    expect(insercion[1]).toEqual([7, 1, '2026-10-26', '2026-10-30', 5, 5, MOTIVO]);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
  });
});

describe('POST /api/solicitudes - validaciones previas', () => {
  test('PU-62 motivo menor a 10 caracteres responde 400 y libera la conexion sin abrir transaccion', async () => {
    const cli = clienteMock({ tipo: TIPO_CONSTANCIA });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 3, fecha_inicio: '2026-10-16', motivo: 'corto' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El motivo debe tener al menos 10 caracteres.');
    expect(llamadas(cli, /^BEGIN$/)).toHaveLength(0);
    expect(cli.release).toHaveBeenCalledTimes(1);
  });

  test('PU-63 un empleado no puede registrar tipos reservados a RRHH (403)', async () => {
    const cli = clienteMock({ idEmpleadoDelUsuario: 12 });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`)
      .send({ id_empleado: 1, id_tipo: 5, fecha_inicio: '2026-10-16', motivo: MOTIVO });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/solo lo registra el personal de RRHH/);
    expect(llamadas(cli, /INSERT INTO solicitudes/)).toHaveLength(0);
  });
});

describe('GET /api/solicitudes/dias-habiles', () => {
  test('PU-64 previsualiza el conteo con detalle y base legal', async () => {
    pool.query.mockImplementation(async (sql, params) => ({ rows: feriados(params) }));

    const res = await request(app).get('/api/solicitudes/dias-habiles')
      .query({ fecha_inicio: '2026-10-19', fecha_fin: '2026-10-23' })
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      fecha_inicio: '2026-10-19', fecha_fin: '2026-10-23',
      dias_calendario: 5, dias_habiles: 4, base_legal: ARTICULO,
    }));
    expect(res.body.detalle[1]).toEqual({
      fecha: '2026-10-20', dia_semana: 'Martes', habil: false, motivo: 'Día de la Revolución de 1944',
    });
  });

  test('PU-65 fecha de fin anterior a la de inicio responde 400', async () => {
    const res = await request(app).get('/api/solicitudes/dias-habiles')
      .query({ fecha_inicio: '2026-10-23', fecha_fin: '2026-10-19' })
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La fecha de fin no puede ser anterior a la de inicio.');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-87 un rango mayor a 92 dias responde 400 antes de contar (fecha_fin=9999-12-31 no bloquea el servidor)', async () => {
    const res = await request(app).get('/api/solicitudes/dias-habiles')
      .query({ fecha_inicio: '2026-10-01', fecha_fin: '9999-12-31' })
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El rango no puede superar 92 días.');
    expect(pool.query).not.toHaveBeenCalled();

    // 93 dias de diferencia: justo uno mas que el tope.
    const borde = await request(app).get('/api/solicitudes/dias-habiles')
      .query({ fecha_inicio: '2026-10-01', fecha_fin: '2027-01-02' })
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);
    expect(borde.status).toBe(400);
  });

  test('PU-88 las fechas deben ser YYYY-MM-DD reales: "March 5" y 2026-02-30 responden 400', async () => {
    for (const q of [
      { fecha_inicio: 'March 5' },
      { fecha_inicio: '2026-02-30' },
      { fecha_inicio: '2026-10-01', fecha_fin: '2026-10-05T00:00:00Z' },
      { fecha_inicio: '01/10/2026', fecha_fin: '2026-10-05' },
    ]) {
      const res = await request(app).get('/api/solicitudes/dias-habiles')
        .query(q).set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/YYYY-MM-DD/);
    }
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/solicitudes - rango y formato de fechas', () => {
  const EMPLEADO = { id: 7, fecha_ingreso: '2024-02-01' };

  test('PU-89 un rango mayor a 92 dias responde 400 sin abrir transaccion ni consultar asuetos', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-01', fecha_fin: '9999-12-31', motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El rango no puede superar 92 días.');
    expect(llamadas(cli, /^BEGIN$/)).toHaveLength(0);
    expect(llamadas(cli, /FROM dias_feriados/)).toHaveLength(0);
    expect(llamadas(cli, /INSERT INTO solicitudes/)).toHaveLength(0);
    expect(cli.release).toHaveBeenCalledTimes(1);
  });

  test('PU-90 fechas que no son YYYY-MM-DD reales responden 400 aunque Date.parse las acepte', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO });
    pool.connect.mockResolvedValue(cli);

    const inicio = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: 'March 5', motivo: MOTIVO });
    expect(inicio.status).toBe(400);
    expect(inicio.body.error).toBe('El formato de la fecha de inicio no es válido (YYYY-MM-DD).');

    const fin = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-26', fecha_fin: '2026-02-30', motivo: MOTIVO });
    expect(fin.status).toBe(400);
    expect(fin.body.error).toBe('El formato de la fecha de fin no es válido (YYYY-MM-DD).');
    expect(llamadas(cli, /^BEGIN$/)).toHaveLength(0);
  });
});

describe('POST /api/solicitudes - solapamiento de fechas', () => {
  const EMPLEADO = { id: 7, fecha_ingreso: '2024-02-01' };

  test('PU-91 si ya hay una solicitud de ausencia que cubre esas fechas responde 409 y revierte', async () => {
    const cli = clienteMock({
      tipo: TIPO_VACACIONES, empleado: EMPLEADO,
      solapadas: [{ id: 88, estado: 'En revision' }],
    });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 1, fecha_inicio: '2026-10-26', fecha_fin: '2026-10-30', motivo: MOTIVO });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya existe una solicitud (#88, En revision) que cubre esas fechas.');
    const [comprobacion] = llamadas(cli, /s\.estado = ANY\(\$2::text\[\]\)/);
    expect(comprobacion[1]).toEqual([7, ['Pendiente', 'En revision', 'Aprobada'], '2026-10-26', '2026-10-30', null]);
    expect(llamadas(cli, /INSERT INTO solicitudes/)).toHaveLength(0);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(0);
  });

  test('PU-92 la comprobacion se hace para toda ausencia y no para tramites de documento', async () => {
    const constancia = clienteMock({ tipo: TIPO_CONSTANCIA, solapadas: [{ id: 88, estado: 'Aprobada' }] });
    pool.connect.mockResolvedValue(constancia);
    const res = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 3, fecha_inicio: '2026-10-16', motivo: MOTIVO });
    expect(res.status).toBe(201);
    expect(llamadas(constancia, /s\.estado = ANY\(\$2::text\[\]\)/)).toHaveLength(0);

    // Una ausencia que no es vacaciones (p. ej. permiso) tambien se comprueba, con fin = inicio si no viene.
    const permiso = clienteMock({ tipo: { id: 2, nombre: 'Permiso', activo: true, es_ausencia: true } });
    pool.connect.mockResolvedValue(permiso);
    const ok = await request(app).post('/api/solicitudes')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ id_empleado: 7, id_tipo: 2, fecha_inicio: '2026-10-16', motivo: MOTIVO });
    expect(ok.status).toBe(201);
    const [comprobacion] = llamadas(permiso, /s\.estado = ANY\(\$2::text\[\]\)/);
    expect(comprobacion[1].slice(2)).toEqual(['2026-10-16', '2026-10-16', null]);
  });
});

describe('PATCH /api/solicitudes/:id/estado - solapamiento al aprobar', () => {
  const EMPLEADO = { id: 7, fecha_ingreso: '2024-02-01' };
  const PENDIENTE = {
    id: 36, id_empleado: 7, id_tipo: 1, estado: 'Pendiente', tipo_nombre: 'Vacaciones', es_ausencia: true,
    inicio: '2026-09-16', fin: '2026-09-23', dias_habiles: 6, dias_descontados: 0, id_vacaciones: null,
    numero_acuerdo: null, libro: null, folio: null,
  };

  test('PU-93 no se aprueba si otra solicitud ya aprobada cubre esas fechas (400, sin descontar saldo)', async () => {
    const cli = clienteMock({
      tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE,
      solapadas: [{ id: 30, estado: 'Aprobada' }],
    });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Aprobada' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No se puede aprobar: la solicitud #30 ya está aprobada y cubre esas fechas.');
    const [comprobacion] = llamadas(cli, /s\.estado = ANY\(\$2::text\[\]\)/);
    expect(comprobacion[1]).toEqual([7, ['Aprobada'], '2026-09-16', '2026-09-23', 36]); // excluye la propia
    expect(llamadas(cli, /UPDATE vacaciones SET dias_tomados/)).toHaveLength(0);
    expect(llamadas(cli, /UPDATE solicitudes SET/)).toHaveLength(0);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
  });

  test('PU-94 al rechazar no se comprueba el solapamiento', async () => {
    const cli = clienteMock({
      tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE,
      solapadas: [{ id: 30, estado: 'Aprobada' }],
    });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Rechazada' });

    expect(res.status).toBe(200);
    expect(llamadas(cli, /s\.estado = ANY\(\$2::text\[\]\)/)).toHaveLength(0);
  });
});

describe('GET /api/vacaciones/mi-saldo - consultar no modifica el registro', () => {
  test('PU-95 devuelve el registro ajustado por RRHH tal cual y no ejecuta ningun UPDATE', async () => {
    // RRHH ajusto a 30 dias (la formula daria 20 para ingreso 2024-02-01) y ya se gozaron 22.
    const ajustada = { id: 3, id_empleado: 7, anio: new Date().getFullYear(),
                       dias_asignados: 30, dias_tomados: 22, derecho_desde: '2026-02-01' };
    const cli = clienteMock({ empleado: { id: 7, fecha_ingreso: '2024-02-01' }, vacacionesExistente: ajustada });
    pool.connect.mockResolvedValue(cli);
    pool.query.mockImplementation(async (sql) => {
      if (/SELECT id_empleado FROM usuarios WHERE id/.test(sql)) return { rows: [{ id_empleado: 7 }] };
      if (/AS fecha_ingreso FROM empleados/.test(sql)) return { rows: [{ fecha_ingreso: '2024-02-01' }] };
      throw new Error(`consulta no esperada: ${sql}`);
    });

    const res = await request(app).get('/api/vacaciones/mi-saldo')
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ dias_asignados: 30, dias_tomados: 22, saldo: 8 }));
    const [insercion] = llamadas(cli, /INSERT INTO vacaciones/);
    expect(insercion[0]).toMatch(/ON CONFLICT \(id_empleado, anio\) DO NOTHING/);
    expect(llamadas(cli, /UPDATE/)).toHaveLength(0);
    expect(pool.query.mock.calls.some(([sql]) => /UPDATE/.test(sql))).toBe(false);
  });
});

describe('PATCH /api/solicitudes/:id/estado - acta municipal de vacaciones', () => {
  const EMPLEADO = { id: 7, fecha_ingreso: '2024-02-01' };
  const PENDIENTE = {
    id: 36, id_empleado: 7, id_tipo: 1, estado: 'Pendiente', tipo_nombre: 'Vacaciones', es_ausencia: true,
    inicio: '2026-09-16', fin: '2026-09-23', dias_habiles: 6, dias_descontados: 0, id_vacaciones: null,
    numero_acuerdo: null, libro: null, folio: null,
  };

  test('PU-66 al aprobar vacaciones sin acuerdo asigna el siguiente correlativo del anio y guarda libro y folio', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE, ultimoAcuerdo: 8 });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Aprobada', libro: ' 8 ', folio: '281' });

    expect(res.status).toBe(200);
    expect(res.body.acuerdo).toBe('Acuerdo No. 09-2026 (Libro 8, Folio 281)');
    expect(res.body.solicitud).toEqual(expect.objectContaining({ numero_acuerdo: '09-2026', libro: '8', folio: '281' }));

    const [correlativo] = llamadas(cli, /MAX\(NULLIF\(split_part\(numero_acuerdo/);
    expect(correlativo[1]).toEqual(['2026']);
    const [actualizacion] = llamadas(cli, /UPDATE solicitudes SET/);
    expect(actualizacion[1].slice(6)).toEqual(['8', '281', '09-2026']);

    const [aviso] = llamadas(cli, /INSERT INTO notificaciones/);
    expect(aviso[1][2]).toContain('Acuerdo No. 09-2026 (Libro 8, Folio 281).');
    expect(auditoria.registrar.mock.calls[0][1].detalle).toEqual(
      expect.objectContaining({ numero_acuerdo: '09-2026', libro: '8', folio: '281' }));
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
  });

  test('PU-67 si RRHH escribe el acuerdo se respeta y no se consulta el correlativo', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Aprobada', numero_acuerdo: '15-2026' });

    expect(res.status).toBe(200);
    expect(res.body.acuerdo).toBe('Acuerdo No. 15-2026');
    expect(llamadas(cli, /MAX\(NULLIF\(split_part\(numero_acuerdo/)).toHaveLength(0);
  });

  test('PU-68 al rechazar no se guarda ningun dato de acta aunque venga en el cuerpo', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Rechazada', libro: '8', folio: '281', numero_acuerdo: '15-2026' });

    expect(res.status).toBe(200);
    expect(res.body.acuerdo).toBeNull();
    const [actualizacion] = llamadas(cli, /UPDATE solicitudes SET/);
    expect(actualizacion[1].slice(6)).toEqual([null, null, null]);
    expect(llamadas(cli, /MAX\(NULLIF\(split_part\(numero_acuerdo/)).toHaveLength(0);
  });

  test('PU-69 libro o folio mayores a 10 caracteres responden 400 sin abrir transaccion', async () => {
    const cli = clienteMock({ tipo: TIPO_VACACIONES, empleado: EMPLEADO, solicitud: PENDIENTE });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/36/estado')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ estado: 'Aprobada', libro: '12345678901' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hasta 10 caracteres/);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/solicitudes/:id/acta - corregir el acta de una vacacion aprobada', () => {
  const APROBADA = {
    id: 12, id_empleado: 7, id_tipo: 1, estado: 'Aprobada', inicio: '2026-06-01',
    libro: null, folio: null, numero_acuerdo: null,
  };

  test('PU-70 guarda libro y folio y asigna el correlativo si el acuerdo viene vacio', async () => {
    const cli = clienteMock({ solicitud: APROBADA, ultimoAcuerdo: 1 });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/12/acta')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ libro: '6', folio: '135', numero_acuerdo: '' });

    expect(res.status).toBe(200);
    expect(res.body.solicitud).toEqual({ id: 12, libro: '6', folio: '135', numero_acuerdo: '02-2026' });
    expect(auditoria.registrar.mock.calls[0][1]).toEqual(expect.objectContaining({
      accion: 'ACTUALIZAR', tabla: 'solicitudes', registro_id: 12,
      detalle: expect.objectContaining({ despues: { libro: '6', folio: '135', numero_acuerdo: '02-2026' } }),
    }));
    expect(llamadas(cli, /^COMMIT$/)).toHaveLength(1);
  });

  test('PU-71 una solicitud que no es vacacion aprobada responde 400', async () => {
    const cli = clienteMock({ solicitud: { ...APROBADA, estado: 'Rechazada' } });
    pool.connect.mockResolvedValue(cli);

    const res = await request(app).patch('/api/solicitudes/12/acta')
      .set('Authorization', `Bearer ${TOKEN_RRHH}`)
      .send({ libro: '6', folio: '135' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vacaciones aprobadas/);
    expect(llamadas(cli, /UPDATE solicitudes SET libro/)).toHaveLength(0);
    expect(llamadas(cli, /^ROLLBACK$/)).toHaveLength(1);
  });

  test('PU-72 un empleado no puede corregir actas (403)', async () => {
    const res = await request(app).patch('/api/solicitudes/12/acta')
      .set('Authorization', `Bearer ${TOKEN_EMPLEADO}`)
      .send({ libro: '6' });
    expect(res.status).toBe(403);
  });
});
