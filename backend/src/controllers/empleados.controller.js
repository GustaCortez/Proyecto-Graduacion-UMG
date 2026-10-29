const pool = require('../config/db');
const { asegurarRegistroAnual, explicacion } = require('../utils/vacaciones');
const auditoria = require('../services/auditoria');

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Campos opcionales: el administrador puede dejarlos en blanco para quitarlos.
 * Se guardan como NULL y no como cadena vacia, para que la ficha diga
 * "sin telefono" en lugar de "telefono = cadena vacia".
 */
const vacioANull = (v) => {
  if (v === undefined || v === null) return null;
  const limpio = String(v).trim();
  return limpio === '' ? null : limpio;
};

/**
 * Ficha ampliada (migracion 005): el resto de las columnas del formato que
 * RRHH llevaba en Excel. Se declaran una sola vez porque las usan el alta, la
 * edicion, la consulta y la bitacora; escribirlas cuatro veces a mano era
 * garantia de que alguna se quedara fuera en la siguiente.
 *
 * Todas son opcionales: una ficha antigua sin estos datos sigue siendo valida.
 */
const FICHA = {
  texto: [
    'direccion_municipal', 'puesto_funcional', 'renglon', 'ubicacion_fisica', 'jornada',
    'profesion', 'profesion_observacion', 'colegiado',
    'nit', 'igss', 'observacion_expediente',
  ],
  fecha: [
    'reinstalacion_2012', 'reinstalacion_2016', 'reinstalacion_2017', 'reinstalacion_2018',
    'reinstalacion_2019', 'reinstalacion_2022', 'reinstalacion_2024',
    'rtu_vence', 'boleto_ornato_vence', 'cgc_vence',
    'antecedentes_penales_vence', 'antecedentes_policiacos_vence',
  ],
  numero: [
    'bonificacion_37_2001', 'sueldos_anio',
    'sueldo_enero', 'sueldo_febrero', 'sueldo_marzo', 'sueldo_abril',
    'sueldo_mayo', 'sueldo_junio', 'sueldo_julio', 'sueldo_agosto',
    'sueldo_septiembre', 'sueldo_octubre', 'sueldo_noviembre', 'sueldo_diciembre',
  ],
  // Mismos valores que los CHECK de la migracion 005: si aqui se permite algo
  // que la base rechaza, el usuario recibe un error de Postgres en vez de una
  // explicacion.
  opcion: {
    estado_civil:        ['Soltero', 'Casado', 'Unido', 'Divorciado', 'Viudo'],
    situacion:           ['Activo', 'Pasivo', 'Fallecido'],
    analisis_expediente: ['Sin faltas', 'Falta leve', 'Falta grave'],
  },
};

const CAMPOS_FICHA = [
  ...FICHA.texto, ...FICHA.fecha, ...FICHA.numero, ...Object.keys(FICHA.opcion),
];

/** Las fechas se devuelven como 'YYYY-MM-DD': es lo que espera <input type="date">. */
const SELECT_FECHAS_FICHA = FICHA.fecha
  .map((c) => `TO_CHAR(e.${c}, 'YYYY-MM-DD') AS ${c}`)
  .join(',\n              ');

/**
 * Comprueba los campos de la ficha ampliada. Devuelve el mensaje del primer
 * problema encontrado, o null si todo esta bien.
 */
function validarFicha(body) {
  for (const campo of FICHA.fecha) {
    const v = body[campo];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (isNaN(Date.parse(v))) {
      return `La fecha de "${campo.replace(/_/g, ' ')}" no es válida (use el formato AAAA-MM-DD).`;
    }
  }
  for (const campo of FICHA.numero) {
    const v = body[campo];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (isNaN(v) || Number(v) < 0) {
      return `El valor de "${campo.replace(/_/g, ' ')}" debe ser un número positivo.`;
    }
  }
  if (body.sueldos_anio !== undefined && body.sueldos_anio !== null
      && String(body.sueldos_anio).trim() !== '') {
    const anio = Number(body.sueldos_anio);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return 'El año de los sueldos mensuales debe estar entre 2000 y 2100.';
    }
  }
  for (const [campo, permitidos] of Object.entries(FICHA.opcion)) {
    const v = body[campo];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (!permitidos.includes(v)) {
      return `El campo "${campo.replace(/_/g, ' ')}" debe ser uno de: ${permitidos.join(', ')}.`;
    }
  }
  return null;
}

/** Valores de la ficha ampliada en el mismo orden que CAMPOS_FICHA. */
function valoresFicha(body) {
  return CAMPOS_FICHA.map((campo) => {
    const v = body[campo];
    if (v === undefined || v === null || String(v).trim() === '') {
      // La situacion no admite quedar en blanco: una ficha sin clase no se
      // puede contar ni en activos ni en pasivos. Se asume Activo.
      return campo === 'situacion' ? 'Activo' : null;
    }
    return FICHA.numero.includes(campo) ? Number(v) : String(v).trim();
  });
}

/** Fecha a 'YYYY-MM-DD' para comparar sin que la hora ni la zona estorben. */
const aFecha = (valor) => {
  if (!valor) return null;
  const d = new Date(valor);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * El correo identifica a la persona dentro de la Municipalidad, asi que no
 * puede repetirse: si dos expedientes comparten correo no se sabe a quien
 * corresponde una notificacion ni una constancia. Se normaliza a minusculas y
 * sin espacios para que "Juan@Muni.gob.gt" y "juan@muni.gob.gt" sean el mismo.
 */
const normalizarCorreo = (correo) => {
  if (correo === undefined || correo === null) return null;
  const limpio = String(correo).trim().toLowerCase();
  return limpio === '' ? null : limpio;
};

/**
 * Devuelve el empleado que ya tiene ese correo, o null si esta libre.
 * `idExcluir` evita que un empleado choque consigo mismo al editarse.
 */
async function empleadoConCorreo(correo, idExcluir = null, cliente = pool) {
  if (!correo) return null;
  const { rows } = await cliente.query(
    `SELECT id, codigo_empleado, estado,
            nombres || ' ' || apellidos AS nombre_completo
       FROM empleados
      WHERE LOWER(TRIM(correo)) = $1
        AND ($2::int IS NULL OR id <> $2::int)
      LIMIT 1`,
    [correo, idExcluir]);
  return rows[0] || null;
}

/** Mensaje unico para las dos pantallas: dice de quien es y que hacer. */
function mensajeCorreoEnUso(correo, ocupante) {
  const baja = ocupante.estado !== 'Activo' ? ' (actualmente dado de baja)' : '';
  return {
    error: `El correo ${correo} ya está asignado a ${ocupante.nombre_completo} `
         + `${ocupante.codigo_empleado ? `(${ocupante.codigo_empleado})` : ''}${baja}. `
         + 'Cada persona debe tener un correo distinto: indique otro correo para este registro.',
    codigo: 'CORREO_EN_USO',
    correo,
    ocupado_por: {
      id: ocupante.id,
      nombre: ocupante.nombre_completo,
      codigo_empleado: ocupante.codigo_empleado,
      estado: ocupante.estado,
    },
  };
}

const getEmpleados = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.codigo_empleado,
              e.nombres || ' ' || e.apellidos AS nombre_completo,
              e.correo, e.telefono, e.fecha_ingreso,
              e.tipo_contrato, e.salario_base, e.estado,
              e.renglon, e.situacion,
              (e.foto_url IS NOT NULL) AS tiene_foto,
              d.nombre AS departamento,
              p.nombre AS puesto
       FROM empleados e
       JOIN departamentos d ON e.id_departamento = d.id
       JOIN puestos       p ON e.id_puesto       = p.id
       ORDER BY e.apellidos ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al obtener empleados.' });
  }
};

const getEmpleadoById = async (req, res) => {
  const { id } = req.params;
  try {
    // Las fechas van como 'YYYY-MM-DD' y no como timestamp: es lo que espera un
    // <input type="date">, y ademas evita que la zona horaria reste un dia.
    const result = await pool.query(
      `SELECT e.*,
              TO_CHAR(e.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
              TO_CHAR(e.fecha_ingreso,    'YYYY-MM-DD') AS fecha_ingreso,
              TO_CHAR(e.fecha_baja,       'YYYY-MM-DD') AS fecha_baja,
              ${SELECT_FECHAS_FICHA},
              d.nombre AS departamento, p.nombre AS puesto
       FROM empleados e
       JOIN departamentos d ON e.id_departamento = d.id
       JOIN puestos       p ON e.id_puesto       = p.id
       WHERE e.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener empleado.' });
  }
};

const generarSiguienteCodigo = async () => {
  const result = await pool.query(`
    SELECT MAX(CAST(SUBSTRING(codigo_empleado FROM 5) AS INTEGER)) AS max_num
    FROM empleados
    WHERE codigo_empleado ~ '^EMP-[0-9]+$'
  `);
  const next = (result.rows[0].max_num || 0) + 1;
  return `EMP-${String(next).padStart(3, '0')}`;
};

const getSiguienteCodigo = async (req, res) => {
  try {
    const codigo = await generarSiguienteCodigo();
    res.json({ codigo });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar código.' });
  }
};

const crearEmpleado = async (req, res) => {
  const {
    nombres, apellidos, dpi,
    fecha_nacimiento, genero, telefono, correo,
    direccion, fecha_ingreso, tipo_contrato,
    salario_base, id_departamento, id_puesto
  } = req.body;

  const requeridos = { nombres, apellidos, dpi, fecha_nacimiento, genero, fecha_ingreso, id_departamento, id_puesto };
  const faltantes = Object.entries(requeridos).filter(([, v]) => v === undefined || v === null || v === '').map(([k]) => k);
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `Campos requeridos faltantes: ${faltantes.join(', ')}.` });
  }

  const codigo_empleado = await generarSiguienteCodigo();
  if (!['M', 'F', 'Otro'].includes(genero)) {
    return res.status(400).json({ error: 'El campo genero debe ser M, F u Otro.' });
  }
  if (!['Permanente', 'Temporal', 'Contrato'].includes(tipo_contrato)) {
    return res.status(400).json({ error: 'El tipo_contrato debe ser Permanente, Temporal o Contrato.' });
  }
  if (salario_base !== undefined && (isNaN(salario_base) || Number(salario_base) < 0)) {
    return res.status(400).json({ error: 'El salario_base debe ser un número positivo.' });
  }
  const correoNormalizado = normalizarCorreo(correo);
  if (correoNormalizado && !FORMATO_CORREO.test(correoNormalizado)) {
    return res.status(400).json({ error: 'El formato del correo no es válido.' });
  }
  const problemaFicha = validarFicha(req.body);
  if (problemaFicha) {
    return res.status(400).json({ error: problemaFicha });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    // Dentro de la transaccion: el indice unico es la garantia final, pero esto
    // da el mensaje util que nombra a quien ya tiene el correo.
    const ocupante = await empleadoConCorreo(correoNormalizado, null, cli);
    if (ocupante) {
      await cli.query('ROLLBACK');
      return res.status(409).json(mensajeCorreoEnUso(correoNormalizado, ocupante));
    }

    // Los 14 campos basicos van primero; los de la ficha ampliada se agregan
    // despues en el orden de CAMPOS_FICHA, a partir de $15.
    const BASICOS = 14;
    const marcadoresFicha = CAMPOS_FICHA.map((_, i) => `$${BASICOS + i + 1}`).join(',');
    const result = await cli.query(
      `INSERT INTO empleados
        (codigo_empleado, nombres, apellidos, dpi, fecha_nacimiento,
         genero, telefono, correo, direccion, fecha_ingreso,
         tipo_contrato, salario_base, id_departamento, id_puesto,
         ${CAMPOS_FICHA.join(', ')})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,${marcadoresFicha})
       RETURNING *`,
      [codigo_empleado, nombres, apellidos, dpi, fecha_nacimiento,
       genero, vacioANull(telefono), correoNormalizado, vacioANull(direccion), fecha_ingreso,
       tipo_contrato, vacioANull(salario_base) === null ? 0 : Number(salario_base),
       id_departamento, id_puesto,
       ...valoresFicha(req.body)]
    );
    const empleado = result.rows[0];

    // Dias segun la Ley de Servicio Municipal (art. 44 b) y la antiguedad.
    const anio = new Date().getFullYear();
    const vacaciones = await asegurarRegistroAnual(cli, empleado.id, anio);

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.CREAR,
      tabla: 'empleados',
      registro_id: empleado.id,
      detalle: {
        codigo_empleado, nombres, apellidos, fecha_ingreso,
        id_departamento, id_puesto,
        vacaciones_generadas: { anio, dias_asignados: vacaciones.dias_asignados },
      },
    }, cli);

    await cli.query('COMMIT');

    res.status(201).json({
      mensaje: 'Empleado creado exitosamente.',
      empleado,
      vacaciones: {
        anio,
        dias_asignados: vacaciones.dias_asignados,
        derecho_desde: vacaciones.derecho_desde,
        explicacion: explicacion(fecha_ingreso, anio),
      },
    });
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    // Red de seguridad: si dos altas simultaneas pasan la comprobacion previa,
    // el indice unico las detiene aqui.
    if (err.code === '23505') {
      if (String(err.constraint || '').includes('correo')) {
        const ocupante = await empleadoConCorreo(correoNormalizado);
        return res.status(409).json(ocupante
          ? mensajeCorreoEnUso(correoNormalizado, ocupante)
          : { error: `El correo ${correoNormalizado} ya está registrado con otra persona. Indique otro.`,
              codigo: 'CORREO_EN_USO' });
      }
      return res.status(400).json({ error: 'El código de empleado o DPI ya existe.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear empleado.' });
  } finally {
    cli.release();
  }
};

const actualizarEmpleado = async (req, res) => {
  const { id } = req.params;
  const {
    nombres, apellidos, dpi, fecha_nacimiento, genero,
    telefono, correo, direccion, tipo_contrato, salario_base,
    id_departamento, id_puesto, estado
  } = req.body;

  // La base declara NOT NULL estos campos: vaciarlos no es una opcion, hay que
  // corregirlos. Los que si admiten quedar vacios se listan mas abajo.
  const obligatorios = {
    nombres, apellidos, dpi, fecha_nacimiento, genero,
    tipo_contrato, id_departamento, id_puesto,
  };
  const faltantes = Object.entries(obligatorios)
    .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
    .map(([k]) => k.replace(/_/g, ' '));
  if (faltantes.length > 0) {
    return res.status(400).json({
      error: `Estos datos no pueden quedar vacíos: ${faltantes.join(', ')}.`,
      codigo: 'CAMPOS_REQUERIDOS',
      campos: faltantes,
    });
  }

  if (!['M', 'F', 'Otro'].includes(genero)) {
    return res.status(400).json({ error: 'El campo género debe ser M, F u Otro.' });
  }
  if (!['Permanente', 'Temporal', 'Contrato'].includes(tipo_contrato)) {
    return res.status(400).json({ error: 'El tipo de contrato debe ser Permanente, Temporal o Contrato.' });
  }
  if (isNaN(Date.parse(fecha_nacimiento))) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida (YYYY-MM-DD).' });
  }
  if (estado !== undefined && !['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ error: 'El estado debe ser Activo o Inactivo.' });
  }

  const correoNormalizado = normalizarCorreo(correo);
  if (correoNormalizado && !FORMATO_CORREO.test(correoNormalizado)) {
    return res.status(400).json({ error: 'El formato del correo no es válido.' });
  }
  if (salario_base !== undefined && salario_base !== null && salario_base !== ''
      && (isNaN(salario_base) || Number(salario_base) < 0)) {
    return res.status(400).json({ error: 'El salario base debe ser un número positivo.' });
  }
  const problemaFicha = validarFicha(req.body);
  if (problemaFicha) {
    return res.status(400).json({ error: problemaFicha });
  }

  try {
    const previo = await pool.query('SELECT * FROM empleados WHERE id = $1', [id]);
    if (previo.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }
    const antes = previo.rows[0];

    // Se excluye al propio empleado: guardar su ficha sin cambiar el correo no
    // debe chocar consigo mismo.
    const ocupante = await empleadoConCorreo(correoNormalizado, Number(id));
    if (ocupante) {
      return res.status(409).json(mensajeCorreoEnUso(correoNormalizado, ocupante));
    }

    // Los campos de la ficha ampliada se asignan a partir de $14, y el id queda
    // al final; asi la lista de columnas la define CAMPOS_FICHA y no hay que
    // renumerar marcadores a mano cada vez que se agregue un dato.
    const BASICOS = 13;
    const asignacionesFicha = CAMPOS_FICHA
      .map((campo, i) => `${campo}=$${BASICOS + i + 1}`)
      .join(', ');
    const result = await pool.query(
      `UPDATE empleados SET
        nombres=$1, apellidos=$2, dpi=$3, fecha_nacimiento=$4, genero=$5,
        telefono=$6, correo=$7, direccion=$8, tipo_contrato=$9, salario_base=$10,
        id_departamento=$11, id_puesto=$12, estado=COALESCE($13, estado),
        ${asignacionesFicha},
        actualizado_en=NOW()
       WHERE id=$${BASICOS + CAMPOS_FICHA.length + 1} RETURNING *`,
      [String(nombres).trim(), String(apellidos).trim(), String(dpi).trim(),
       fecha_nacimiento, genero,
       vacioANull(telefono), correoNormalizado, vacioANull(direccion),
       tipo_contrato, vacioANull(salario_base) === null ? 0 : Number(salario_base),
       id_departamento, id_puesto, estado || null,
       ...valoresFicha(req.body), id]
    );
    const despues = result.rows[0];

    // Solo se registran los campos que de verdad cambiaron: una bitacora que
    // repite la ficha entera no deja ver que se modifico ni que se borro.
    const CAMPOS = ['nombres', 'apellidos', 'dpi', 'fecha_nacimiento', 'genero',
                    'telefono', 'correo', 'direccion', 'tipo_contrato',
                    'salario_base', 'id_departamento', 'id_puesto', 'estado',
                    ...CAMPOS_FICHA];
    const cambios = {};
    const vaciados = [];
    for (const campo of CAMPOS) {
      const a = antes[campo] instanceof Date ? aFecha(antes[campo]) : antes[campo];
      const d = despues[campo] instanceof Date ? aFecha(despues[campo]) : despues[campo];
      if (String(a ?? '') === String(d ?? '')) continue;
      cambios[campo] = { antes: a, despues: d };
      if ((d === null || d === '') && a !== null && a !== '') vaciados.push(campo);
    }

    if (Object.keys(cambios).length > 0) {
      await auditoria.registrar(req, {
        accion: auditoria.ACCIONES.ACTUALIZAR,
        tabla: 'empleados',
        registro_id: Number(id),
        detalle: {
          empleado: `${despues.nombres} ${despues.apellidos}`,
          codigo_empleado: despues.codigo_empleado,
          cambios,
          // Se separa lo borrado: es lo que mas interesa poder rastrear despues.
          campos_vaciados: vaciados.length ? vaciados : undefined,
        },
      });
    }

    res.json({
      mensaje: Object.keys(cambios).length === 0
        ? 'No hubo cambios que guardar.'
        : 'Empleado actualizado.',
      empleado: despues,
      cambios: Object.keys(cambios),
    });
  } catch (err) {
    // Red de seguridad ante dos ediciones simultaneas al mismo correo.
    if (err.code === '23505' && String(err.constraint || '').includes('correo')) {
      const ocupante = await empleadoConCorreo(correoNormalizado, Number(id));
      return res.status(409).json(ocupante
        ? mensajeCorreoEnUso(correoNormalizado, ocupante)
        : { error: `El correo ${correoNormalizado} ya está registrado con otra persona. Indique otro.`,
            codigo: 'CORREO_EN_USO' });
    }
    // El DPI tambien es unico: identifica legalmente a la persona.
    if (err.code === '23505' && String(err.constraint || '').includes('dpi')) {
      const { rows } = await pool.query(
        `SELECT codigo_empleado, nombres || ' ' || apellidos AS nombre_completo
           FROM empleados WHERE dpi = $1 AND id <> $2 LIMIT 1`, [String(dpi).trim(), id]);
      const otro = rows[0];
      return res.status(409).json({
        error: otro
          ? `El DPI ${dpi} ya está registrado con ${otro.nombre_completo} (${otro.codigo_empleado}). `
            + 'Cada persona debe tener un DPI distinto: verifique el número.'
          : `El DPI ${dpi} ya está registrado con otra persona. Verifique el número.`,
        codigo: 'DPI_EN_USO',
      });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar empleado.' });
  }
};

/** Mismos valores que el CHECK de bajas_igss.motivo (migracion 007). */
const TIPOS_BAJA = ['Renuncia', 'Despido', 'Fin de contrato', 'Jubilación', 'Fallecimiento', 'Otro'];

/**
 * Dar de baja marca al empleado inactivo y, en la misma transaccion, abre el
 * aviso de baja ante el IGSS en estado Pendiente: RRHH lo cierra desde el
 * expediente cuando presenta el formulario. Asi ninguna baja se queda sin
 * reportar por olvido.
 */
const bajaEmpleado = async (req, res) => {
  const { id } = req.params;
  const { motivo_baja, tipo_baja } = req.body;

  if (!motivo_baja || motivo_baja.trim().length < 5) {
    return res.status(400).json({ error: 'Indique el motivo de la baja (al menos 5 caracteres).' });
  }
  const tipo = TIPOS_BAJA.includes(tipo_baja) ? tipo_baja : 'Otro';

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const result = await cliente.query(
      `UPDATE empleados SET estado='Inactivo', fecha_baja=NOW(), motivo_baja=$1
        WHERE id=$2 AND estado='Activo'
       RETURNING id, codigo_empleado, nombres, apellidos, igss`,
      [motivo_baja, id]
    );
    if (result.rows.length === 0) {
      await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Empleado no encontrado o ya estaba inactivo.' });
    }
    const emp = result.rows[0];

    const aviso = await cliente.query(
      `INSERT INTO bajas_igss (id_empleado, fecha_baja, motivo, numero_afiliacion, observaciones, registrado_por)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
       RETURNING id`,
      [emp.id, tipo, emp.igss, motivo_baja, req.usuario.id]
    );

    // Quien ya no trabaja aqui no debe poder entrar: se desactiva su cuenta y
    // se cierran sus sesiones abiertas, en la misma transaccion que la baja.
    const cuentas = await cliente.query(
      `UPDATE usuarios SET activo = FALSE
        WHERE id_empleado = $1 AND activo = TRUE
       RETURNING id, username`,
      [emp.id]
    );
    let sesionesCerradas = 0;
    for (const cuenta of cuentas.rows) {
      const { rowCount } = await cliente.query(
        `UPDATE refresh_tokens SET revocado_en = NOW()
          WHERE id_usuario = $1 AND revocado_en IS NULL`,
        [cuenta.id]
      );
      sesionesCerradas += rowCount || 0;
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.BAJA_EMPLEADO,
      tabla: 'empleados',
      registro_id: Number(id),
      detalle: {
        id_empleado: emp.id, empleado: emp, motivo_baja, tipo_baja: tipo, aviso_igss: aviso.rows[0].id,
        usuarios_desactivados: cuentas.rows.map((u) => u.username),
        sesiones_cerradas: sesionesCerradas,
      },
    }, cliente);
    await cliente.query('COMMIT');

    res.json({
      mensaje: 'Empleado dado de baja. Se abrió el aviso de baja ante el IGSS en su expediente.',
      empleado: emp,
      aviso_igss: aviso.rows[0].id,
    });
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    res.status(500).json({ error: 'Error al dar de baja al empleado.' });
  } finally {
    cliente.release();
  }
};

const getCatalogos = async (req, res) => {
  try {
    const departamentos = await pool.query(
      'SELECT id, nombre FROM departamentos WHERE activo=TRUE ORDER BY nombre'
    );
    const puestos = await pool.query(
      'SELECT id, nombre FROM puestos WHERE activo=TRUE ORDER BY nombre'
    );
    res.json({
      departamentos: departamentos.rows,
      puestos:       puestos.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener catálogos.' });
  }
};

module.exports = {
  getEmpleados, getEmpleadoById,
  crearEmpleado, actualizarEmpleado,
  bajaEmpleado, getCatalogos, getSiguienteCodigo
};