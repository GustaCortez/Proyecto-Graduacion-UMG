/**
 * PU-15 a PU-24: regla de vacaciones (src/utils/vacaciones.js).
 * Ley de Servicio Municipal, art. 44 b): <1 anio = 0, 1-4 = 20, >=5 = 25 dias habiles.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const {
  aniosDeServicio, fechaDerecho, diasPorAntiguedad, explicacion, asegurarRegistroAnual, ARTICULO,
} = require('../src/utils/vacaciones');

describe('aniosDeServicio y fechaDerecho', () => {
  test('PU-15 calcula los anios cumplidos en el aniversario del anio indicado', () => {
    expect(aniosDeServicio('2020-03-15', 2026)).toBe(6);
    expect(aniosDeServicio('2026-01-10', 2026)).toBe(0);
    expect(aniosDeServicio(new Date(2019, 6, 1), 2026)).toBe(7);
  });

  test('PU-16 la fecha de derecho es el aniversario de ingreso dentro del anio', () => {
    expect(fechaDerecho('2020-03-15', 2026)).toBe('2026-03-15');
    expect(fechaDerecho('2021-12-01', 2026)).toBe('2026-12-01');
  });
});

describe('diasPorAntiguedad (art. 44 b)', () => {
  test.each([
    ['2026-01-10', 2026, 0,  'menos de 1 anio'],
    ['2025-01-10', 2026, 20, 'exactamente 1 anio'],
    ['2022-01-10', 2026, 20, '4 anios (ultimo del primer tramo)'],
    ['2021-01-10', 2026, 25, 'exactamente 5 anios'],
    ['2016-01-10', 2026, 25, '10 anios'],
  ])('PU-17 ingreso %s en %i -> %i dias (%s)', (ingreso, anio, esperado) => {
    expect(diasPorAntiguedad(ingreso, anio)).toBe(esperado);
  });
});

describe('explicacion', () => {
  test('PU-18 sin un anio de servicio explica que aun no hay derecho y cita la ley', () => {
    const texto = explicacion('2026-02-01', 2026);
    expect(texto).toMatch(/Aún no cumple un año/);
    expect(texto).toContain('2026-02-01');
    expect(texto).toContain(ARTICULO);
  });

  test('PU-19 con derecho indica anios, fecha y dias asignados', () => {
    const texto = explicacion('2021-03-15', 2026);
    expect(texto).toContain('5 año(s) de servicio continuo al 2026-03-15');
    expect(texto).toContain('25 días hábiles');
    expect(texto).toContain(ARTICULO);
  });
});

describe('asegurarRegistroAnual', () => {
  /**
   * Tres consultas en orden: empleado, INSERT ... ON CONFLICT DO NOTHING (sin
   * filas) y SELECT de la fila que quedo en la tabla.
   */
  const clienteCon = (empleado, filaVacaciones) => ({
    query: jest.fn()
      .mockResolvedValueOnce({ rows: empleado ? [empleado] : [] })
      .mockResolvedValueOnce({ rows: [], rowCount: filaVacaciones ? 1 : 0 })
      .mockResolvedValueOnce({ rows: filaVacaciones ? [filaVacaciones] : [] }),
  });

  test('PU-20 empleado inexistente devuelve null sin insertar', async () => {
    const cli = clienteCon(null);
    expect(await asegurarRegistroAnual(cli, 999, 2026)).toBeNull();
    expect(cli.query).toHaveBeenCalledTimes(1);
    expect(cli.query.mock.calls[0][1]).toEqual([999]);
  });

  test('PU-21 calcula 25 dias para 5 anios, inserta solo si falta (DO NOTHING) y devuelve la fila guardada', async () => {
    const fila = { id: 3, id_empleado: 7, anio: 2026, dias_asignados: 25, dias_tomados: 0, derecho_desde: '2026-03-15' };
    const cli = clienteCon({ id: 7, fecha_ingreso: '2021-03-15' }, fila);

    const res = await asegurarRegistroAnual(cli, 7, 2026);

    expect(res).toEqual(fila);
    expect(cli.query).toHaveBeenCalledTimes(3);
    const [sql, params] = cli.query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO vacaciones/);
    expect(sql).toMatch(/ON CONFLICT \(id_empleado, anio\) DO NOTHING/);
    expect(sql).not.toMatch(/DO UPDATE/);
    expect(params).toEqual([7, 2026, 25, '2026-03-15']);
    const [consulta, filtro] = cli.query.mock.calls[2];
    expect(consulta).toMatch(/FROM vacaciones WHERE id_empleado = \$1 AND anio = \$2/);
    expect(filtro).toEqual([7, 2026]);
  });

  test('PU-82 si el registro ya existe lo devuelve tal cual: una consulta de saldo no pisa el ajuste manual de RRHH', async () => {
    // RRHH ajusto a 30 dias (la formula daria 20) y ya se gozaron 22: con el
    // viejo DO UPDATE se habrian puesto 20 asignados, violando chk_dias.
    const ajustada = { id: 3, id_empleado: 7, anio: 2026, dias_asignados: 30, dias_tomados: 22, derecho_desde: '2026-02-01' };
    const cli = clienteCon({ id: 7, fecha_ingreso: '2024-02-01' }, ajustada);

    const res = await asegurarRegistroAnual(cli, 7, 2026);

    expect(res).toEqual(ajustada);
    expect(res.dias_asignados).toBe(30);
    const sqls = cli.query.mock.calls.map(([sql]) => sql);
    expect(sqls.some((s) => /UPDATE/.test(s))).toBe(false);
  });

  test('PU-22 con menos de un anio asigna 0 dias y derecho_desde nulo', async () => {
    const cli = clienteCon({ id: 8, fecha_ingreso: '2026-05-02' }, { id: 4, dias_asignados: 0 });
    await asegurarRegistroAnual(cli, 8, 2026);
    expect(cli.query.mock.calls[1][1]).toEqual([8, 2026, 0, null]);
  });

  test('PU-23 entre 1 y 4 anios asigna 20 dias', async () => {
    const cli = clienteCon({ id: 9, fecha_ingreso: '2023-08-20' }, { id: 5 });
    await asegurarRegistroAnual(cli, 9, 2026);
    expect(cli.query.mock.calls[1][1]).toEqual([9, 2026, 20, '2026-08-20']);
  });

  test('PU-24 si no se indica el anio usa el anio en curso', async () => {
    const cli = clienteCon({ id: 9, fecha_ingreso: '2000-01-01' }, { id: 6 });
    await asegurarRegistroAnual(cli, 9);
    expect(cli.query.mock.calls[1][1][1]).toBe(new Date().getFullYear());
  });
});
