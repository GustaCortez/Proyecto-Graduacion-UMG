const pool = require('../config/db');
const { asegurarRegistroAnual, explicacion } = require('../utils/vacaciones');
const auditoria = require('../services/auditoria');

// Obtener todos los empleados activos
const getEmpleados = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.codigo_empleado,
              e.nombres || ' ' || e.apellidos AS nombre_completo,
              e.correo, e.telefono, e.fecha_ingreso,
              e.tipo_contrato, e.salario_base, e.estado,
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

// Obtener un empleado por ID
const getEmpleadoById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT e.*, d.nombre AS departamento, p.nombre AS puesto
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

// Crear nuevo empleado
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
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ error: 'El formato del correo no es válido.' });
  }

  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    const result = await cli.query(
      `INSERT INTO empleados
        (codigo_empleado, nombres, apellidos, dpi, fecha_nacimiento,
         genero, telefono, correo, direccion, fecha_ingreso,
         tipo_contrato, salario_base, id_departamento, id_puesto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [codigo_empleado, nombres, apellidos, dpi, fecha_nacimiento,
       genero, telefono, correo, direccion, fecha_ingreso,
       tipo_contrato, salario_base, id_departamento, id_puesto]
    );
    const empleado = result.rows[0];

    // Registro de vacaciones del año en curso, con los días que marca la
    // Ley de Servicio Municipal según la antigüedad que tendrá el empleado.
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
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El código de empleado o DPI ya existe.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Error al crear empleado.' });
  } finally {
    cli.release();
  }
};

// Actualizar empleado
const actualizarEmpleado = async (req, res) => {
  const { id } = req.params;
  const {
    nombres, apellidos, telefono, correo,
    direccion, tipo_contrato, salario_base,
    id_departamento, id_puesto, estado
  } = req.body;

  if (!nombres || !apellidos || !id_departamento || !id_puesto) {
    return res.status(400).json({ error: 'Los campos nombres, apellidos, id_departamento e id_puesto son requeridos.' });
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ error: 'El formato del correo no es válido.' });
  }
  if (salario_base !== undefined && (isNaN(salario_base) || Number(salario_base) < 0)) {
    return res.status(400).json({ error: 'El salario_base debe ser un número positivo.' });
  }

  try {
    const result = await pool.query(
      `UPDATE empleados SET
        nombres=$1, apellidos=$2, telefono=$3, correo=$4,
        direccion=$5, tipo_contrato=$6, salario_base=$7,
        id_departamento=$8, id_puesto=$9, estado=$10
       WHERE id=$11 RETURNING *`,
      [nombres, apellidos, telefono, correo,
       direccion, tipo_contrato, salario_base,
       id_departamento, id_puesto, estado, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.ACTUALIZAR,
      tabla: 'empleados',
      registro_id: Number(id),
      detalle: {
        nombres, apellidos, telefono, correo, direccion,
        tipo_contrato, salario_base, id_departamento, id_puesto, estado,
      },
    });

    res.json({ mensaje: 'Empleado actualizado.', empleado: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al actualizar empleado.' });
  }
};

// Dar de baja a un empleado
const bajaEmpleado = async (req, res) => {
  const { id } = req.params;
  const { motivo_baja } = req.body;

  if (!motivo_baja || motivo_baja.trim().length < 5) {
    return res.status(400).json({ error: 'Indique el motivo de la baja (al menos 5 caracteres).' });
  }

  try {
    const result = await pool.query(
      `UPDATE empleados SET estado='Inactivo', fecha_baja=NOW(), motivo_baja=$1
        WHERE id=$2
       RETURNING id, codigo_empleado, nombres, apellidos`,
      [motivo_baja, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    await auditoria.registrar(req, {
      accion: auditoria.ACCIONES.BAJA_EMPLEADO,
      tabla: 'empleados',
      registro_id: Number(id),
      detalle: { empleado: result.rows[0], motivo_baja },
    });

    res.json({ mensaje: 'Empleado dado de baja correctamente.', empleado: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error al dar de baja al empleado.' });
  }
};

// Obtener catálogos (departamentos y puestos)
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