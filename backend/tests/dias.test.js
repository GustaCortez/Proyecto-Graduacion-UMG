/**
 * PU-01 a PU-14: utilidades de fechas (src/utils/dias.js).
 * La base de datos se sustituye por un mock: solo interesa la logica de calculo.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const pool = require('../src/config/db');
const {
  aISO, domingoPascua, asuetosNacionales, contarDiasHabiles, detalleDiasHabiles,
  esFechaISO, diasCalendario, MAX_DIAS_RANGO,
} = require('../src/utils/dias');

const iso = (d) => d.toISOString().slice(0, 10);

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [] });
});

describe('aISO', () => {
  test('PU-01 recorta una cadena ISO con hora a YYYY-MM-DD', () => {
    expect(aISO('2026-10-15T14:30:00.000Z')).toBe('2026-10-15');
    expect(aISO('2026-10-15')).toBe('2026-10-15');
  });

  test('PU-02 convierte un objeto Date sin corrimiento de zona horaria', () => {
    // Date local: 3 de marzo de 2026, 23:30. Un toISOString() ingenuo lo
    // moveria al dia siguiente en zonas con desfase negativo (Guatemala, UTC-6).
    expect(aISO(new Date(2026, 2, 3, 23, 30))).toBe('2026-03-03');
  });
});

describe('domingoPascua (Meeus/Jones/Butcher)', () => {
  test.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('PU-03 Pascua de %i es %s', (anio, esperado) => {
    expect(iso(domingoPascua(anio))).toBe(esperado);
  });
});

describe('asuetosNacionales', () => {
  test('PU-04 devuelve 10 asuetos ordenados por fecha', () => {
    const lista = asuetosNacionales(2026);
    expect(lista).toHaveLength(10);
    const fechas = lista.map((a) => a.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(fechas.every((f) => f.startsWith('2026-'))).toBe(true);
  });

  test('PU-05 incluye los 7 asuetos fijos del Codigo de Trabajo', () => {
    const fechas = asuetosNacionales(2026).map((a) => a.fecha);
    for (const f of ['2026-01-01', '2026-05-01', '2026-06-30', '2026-09-15',
                     '2026-10-20', '2026-11-01', '2026-12-25']) {
      expect(fechas).toContain(f);
    }
  });

  test('PU-06 Semana Santa 2026: Jueves 02-04, Viernes 03-04, Sabado 04-04', () => {
    const porNombre = Object.fromEntries(asuetosNacionales(2026).map((a) => [a.nombre, a.fecha]));
    expect(porNombre['Jueves Santo']).toBe('2026-04-02');
    expect(porNombre['Viernes Santo']).toBe('2026-04-03');
    expect(porNombre['Sábado de Gloria']).toBe('2026-04-04');
  });
});

describe('contarDiasHabiles', () => {
  test('PU-07 semana completa lunes a domingo = 5 dias habiles (excluye fin de semana)', async () => {
    // 2026-10-12 es lunes; 2026-10-18 es domingo.
    expect(await contarDiasHabiles('2026-10-12', '2026-10-18')).toBe(5);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['2026-10-12', '2026-10-18']);
  });

  test('PU-08 descuenta el asueto registrado en dias_feriados', async () => {
    // 2026-10-20 (martes) es Dia de la Revolucion.
    pool.query.mockResolvedValue({ rows: [{ fecha: '2026-10-20' }] });
    expect(await contarDiasHabiles('2026-10-19', '2026-10-23')).toBe(4);
  });

  test('PU-09 rango invertido devuelve 0 y no consulta la base', async () => {
    expect(await contarDiasHabiles('2026-10-23', '2026-10-19')).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-10 un solo dia: entre semana cuenta 1, sabado cuenta 0', async () => {
    expect(await contarDiasHabiles('2026-10-14')).toBe(1);        // miercoles, sin fecha fin
    expect(await contarDiasHabiles('2026-10-17', null)).toBe(0);  // sabado
  });

  test('PU-11 acepta un cliente de transaccion en lugar del pool', async () => {
    const cliente = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await contarDiasHabiles('2026-10-12', '2026-10-16', cliente)).toBe(5);
    expect(cliente.query).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('PU-12 acepta objetos Date y cadenas con hora', async () => {
    expect(await contarDiasHabiles(new Date(2026, 9, 12), '2026-10-16T23:00:00Z')).toBe(5);
  });
});

describe('detalleDiasHabiles', () => {
  test('PU-13 clasifica cada dia del rango con su motivo', async () => {
    pool.query.mockResolvedValue({ rows: [{ fecha: '2026-10-20', nombre: 'Día de la Revolución de 1944' }] });
    const detalle = await detalleDiasHabiles('2026-10-17', '2026-10-20');
    expect(detalle).toEqual([
      { fecha: '2026-10-17', dia_semana: 'Sábado',  habil: false, motivo: 'Fin de semana' },
      { fecha: '2026-10-18', dia_semana: 'Domingo', habil: false, motivo: 'Fin de semana' },
      { fecha: '2026-10-19', dia_semana: 'Lunes',   habil: true,  motivo: null },
      { fecha: '2026-10-20', dia_semana: 'Martes',  habil: false, motivo: 'Día de la Revolución de 1944' },
    ]);
  });

  test('PU-14 el total de habiles del detalle coincide con contarDiasHabiles', async () => {
    pool.query.mockResolvedValue({ rows: [{ fecha: '2026-10-20', nombre: 'Asueto' }] });
    const detalle = await detalleDiasHabiles('2026-10-12', '2026-10-25');
    const habiles = await contarDiasHabiles('2026-10-12', '2026-10-25');
    expect(detalle).toHaveLength(14);
    expect(detalle.filter((d) => d.habil)).toHaveLength(habiles);
    expect(habiles).toBe(9);
  });
});

describe('esFechaISO y diasCalendario', () => {
  test('PU-83 acepta solo YYYY-MM-DD estricto con fecha real', () => {
    expect(esFechaISO('2026-10-15')).toBe(true);
    expect(esFechaISO('2024-02-29')).toBe(true);     // bisiesto
    expect(esFechaISO('2026-02-30')).toBe(false);    // no existe
    expect(esFechaISO('2026-13-01')).toBe(false);
    expect(esFechaISO('March 5')).toBe(false);       // Date.parse lo aceptaria
    expect(esFechaISO('2026-10-15T00:00:00Z')).toBe(false);
    expect(esFechaISO('15/10/2026')).toBe(false);
    expect(esFechaISO('')).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
    expect(esFechaISO(new Date())).toBe(false);
  });

  test('PU-84 diasCalendario cuenta la diferencia en dias (0 el mismo dia)', () => {
    expect(diasCalendario('2026-10-01', '2026-10-01')).toBe(0);
    expect(diasCalendario('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasCalendario('2026-10-01', '2027-01-01')).toBe(92);
    expect(diasCalendario('2026-10-02', '2026-10-01')).toBe(-1);
  });
});

describe('tope del rango (MAX_DIAS_RANGO)', () => {
  test('PU-85 el tope es 92 dias y un rango exactamente de 92 dias se cuenta', async () => {
    expect(MAX_DIAS_RANGO).toBe(92);
    // 2026-10-01 al 2027-01-01 son 92 dias de diferencia, 93 dias calendario.
    const detalle = await detalleDiasHabiles('2026-10-01', '2027-01-01');
    expect(detalle).toHaveLength(93);
    expect(await contarDiasHabiles('2026-10-01', '2027-01-01')).toBe(67);
  });

  test('PU-86 un rango mayor al tope lanza RangeError sin consultar la base ni recorrer el rango', async () => {
    await expect(contarDiasHabiles('2026-10-01', '9999-12-31')).rejects.toThrow(RangeError);
    await expect(contarDiasHabiles('2026-10-01', '2027-01-02')).rejects.toThrow(/no puede superar 92 días/);
    await expect(detalleDiasHabiles('2026-10-01', '9999-12-31')).rejects.toThrow(RangeError);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
