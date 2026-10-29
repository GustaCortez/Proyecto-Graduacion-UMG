import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, Pencil, UserX, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { fechaHoyISO } from '../../utils/fechas';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ANIOS_REINSTALACION = [2012, 2016, 2017, 2018, 2019, 2022, 2024];


 
const SECCIONES = [
  {
    id: 'personales',
    titulo: 'Datos personales',
    campos: [
      { name: 'nombres',          label: 'Nombres',   tipo: 'text', req: true },
      { name: 'apellidos',        label: 'Apellidos', tipo: 'text', req: true },
      { name: 'dpi',              label: 'DPI',       tipo: 'text', req: true },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'date', req: true },
      { name: 'genero', label: 'Sexo', tipo: 'select', opciones: [
        ['M', 'Masculino'], ['F', 'Femenino'], ['Otro', 'Otro'],
      ] },
      { name: 'estado_civil', label: 'Estado civil', tipo: 'select', vacio: 'Sin indicar',
        opciones: ['Soltero', 'Casado', 'Unido', 'Divorciado', 'Viudo'] },
      { name: 'telefono', label: 'Teléfono', tipo: 'text',  borrable: true },
      { name: 'correo',   label: 'Correo electrónico', tipo: 'email', borrable: true },
      { name: 'nit',  label: 'NIT',  tipo: 'text', borrable: true },
      { name: 'igss', label: 'IGSS', tipo: 'text', borrable: true,
        ayuda: 'Número de afiliación al Instituto Guatemalteco de Seguridad Social.' },
      { name: 'direccion', label: 'Dirección residencial', tipo: 'textarea',
        borrable: true, ancho: 'completo' },
    ],
  },
  {
    id: 'puesto',
    titulo: 'Puesto y contrato',
    campos: [
      { name: 'direccion_municipal', label: 'Dirección', tipo: 'text', borrable: true,
        ayuda: 'Dirección municipal a la que pertenece, p. ej. Dirección de Recursos Humanos.' },
      { name: 'id_departamento', label: 'Dependencia donde labora', tipo: 'catalogo',
        catalogo: 'departamentos', req: true },
      { name: 'id_puesto', label: 'Puesto nominal', tipo: 'catalogo',
        catalogo: 'puestos', req: true },
      { name: 'puesto_funcional', label: 'Puesto funcional', tipo: 'text', borrable: true,
        ayuda: 'Solo si difiere del puesto nominal.' },
      { name: 'renglon', label: 'Renglón', tipo: 'text', borrable: true,
        ayuda: 'Renglón presupuestario: 011, 021, 022, 029, 031, 182...' },
      { name: 'ubicacion_fisica', label: 'Ubicación física / sede', tipo: 'text', borrable: true },
      { name: 'jornada', label: 'Horario / jornada laboral', tipo: 'text', borrable: true },
      { name: 'fecha_ingreso', label: 'Fecha de ingreso', tipo: 'date', req: true },
      { name: 'tipo_contrato', label: 'Tipo de contrato', tipo: 'select',
        opciones: ['Permanente', 'Temporal', 'Contrato'] },
      { name: 'situacion', label: 'Situación', tipo: 'select',
        opciones: ['Activo', 'Pasivo', 'Fallecido'],
        ayuda: 'Pasivo = jubilado. Es distinto del estado de la ficha en el sistema.' },
    ],
  },
  {
    id: 'profesion',
    titulo: 'Profesión',
    campos: [
      { name: 'profesion', label: 'Profesión', tipo: 'text', borrable: true },
      { name: 'colegiado', label: 'Colegiado', tipo: 'text', borrable: true,
        ayuda: 'Número de colegiado activo, si la profesión lo requiere.' },
      { name: 'profesion_observacion', label: 'Observación', tipo: 'textarea',
        borrable: true, ancho: 'completo' },
    ],
  },
  {
    id: 'reinstalaciones',
    titulo: 'Reinstalaciones',
    nota: 'Fechas de reinstalación registradas por RRHH. Deje en blanco los años que no correspondan.',
    campos: ANIOS_REINSTALACION.map((anio) => ({
      name: `reinstalacion_${anio}`, label: `Reinstalación ${anio}`, tipo: 'date', borrable: true,
    })),
  },
  {
    id: 'sueldo',
    titulo: 'Sueldo',
    nota: 'El sueldo base es el vigente. Los doce meses son el detalle del año que se indique arriba.',
    campos: [
      { name: 'salario_base', label: 'Sueldo base', tipo: 'number' },
      { name: 'bonificacion_37_2001', label: 'Bonificación Decreto Ley 37-2001',
        tipo: 'number', borrable: true },
      { name: 'sueldos_anio', label: 'Año del detalle mensual', tipo: 'number',
        borrable: true, paso: '1', ayuda: 'Ejemplo: 2026.' },
      ...MESES.map((mes) => ({
        name: `sueldo_${mes}`,
        label: mes.charAt(0).toUpperCase() + mes.slice(1),
        tipo: 'number', borrable: true,
      })),
    ],
  },
  {
    id: 'expediente',
    titulo: 'Expediente',
    nota: 'De cada documento se registra únicamente la fecha de vencimiento: con ella se sabe si sigue vigente.',
    campos: [
      { name: 'analisis_expediente', label: 'Análisis de expediente', tipo: 'select',
        vacio: 'Sin analizar', opciones: ['Sin faltas', 'Falta leve', 'Falta grave'] },
      { name: 'observacion_expediente', label: 'Observación', tipo: 'textarea',
        borrable: true, ancho: 'completo' },
      { name: 'rtu_vence', label: 'RTU (vence)', tipo: 'date', borrable: true },
      { name: 'boleto_ornato_vence', label: 'Boleto de ornato (vence)', tipo: 'date', borrable: true },
      { name: 'cgc_vence', label: 'Constancia CGC (vence)', tipo: 'date', borrable: true,
        ayuda: 'Constancia transitoria de inexistencia de reclamación de cargos.' },
      { name: 'antecedentes_penales_vence', label: 'Antecedentes penales (vence)',
        tipo: 'date', borrable: true },
      { name: 'antecedentes_policiacos_vence', label: 'Antecedentes policíacos (vence)',
        tipo: 'date', borrable: true },
    ],
  },
];

/** Campos cuyo vencimiento se avisa en rojo cuando ya pasó. */
const VENCIMIENTOS = ['rtu_vence', 'boleto_ornato_vence', 'cgc_vence',
                      'antecedentes_penales_vence', 'antecedentes_policiacos_vence'];

const TODOS_LOS_CAMPOS = SECCIONES.flatMap((s) => s.campos);

/** Formulario vacío: cada campo arranca en '' salvo los que tienen un valor por omisión. */
const POR_OMISION = {
  genero: 'M', tipo_contrato: 'Permanente', situacion: 'Activo', estado: 'Activo',
};
const formVacio = {
  ...Object.fromEntries(TODOS_LOS_CAMPOS.map((c) => [c.name, ''])),
  ...POR_OMISION,
};

const hoy = fechaHoyISO;

export default function Empleados() {
  const [empleados, setEmpleados]   = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [catalogos, setCatalogos]   = useState({ departamentos:[], puestos:[] });
  const [modal, setModal]           = useState(null); // 'crear' | 'editar' | 'baja'
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm]             = useState(formVacio);
  const [seccion, setSeccion]       = useState(SECCIONES[0].id);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [tipoBaja, setTipoBaja]     = useState('Renuncia');
  const navigate = useNavigate();
  const [proximoCodigo, setProximoCodigo] = useState('');
  // Conflicto de correo devuelto por el servidor: se muestra junto al campo,
  // no solo como aviso pasajero, porque hay que corregirlo antes de guardar.
  const [errorCorreo, setErrorCorreo] = useState(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [enviando, setEnviando]     = useState(false);

  const cargar = () => api.get('/empleados')
    .then(r => setEmpleados(r.data))
    .catch(() => toast.error('No se pudo cargar el listado de empleados.'));

  // Sin esto, un fallo al montar dejaba los desplegables vacios para siempre
  // y sin aviso; por eso tambien se reintenta al abrir el formulario.
  const cargarCatalogos = () => api.get('/empleados/catalogos')
    .then(r => setCatalogos(r.data))
    .catch(() => toast.error('No se pudieron cargar departamentos y puestos.'));

  useEffect(() => {
    cargar();
    cargarCatalogos();
  }, []);

  const filtrados = empleados.filter(e =>
    e.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.codigo_empleado.toLowerCase().includes(busqueda.toLowerCase())
  );

  const cerrar = () => { setModal(null); setSeleccionado(null); setErrorCorreo(null); };

  const handleChange = e => {
    if (e.target.name === 'correo') setErrorCorreo(null);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const limpiarCampo = (name) => {
    if (name === 'correo') setErrorCorreo(null);
    setForm({ ...form, [name]: '' });
  };

  /** Deja el aviso junto al campo cuando el correo ya pertenece a otra persona. */
  const manejarError = (err, mensajePorDefecto) => {
    const datos = err.response?.data;
    if (datos?.codigo === 'CORREO_EN_USO') {
      setErrorCorreo(datos.error);
      setSeccion('personales');
      toast.error('Ese correo ya está asignado a otra persona.');
      return;
    }
    if (datos?.codigo === 'DPI_EN_USO') {
      setSeccion('personales');
      toast.error(datos.error, { duration: 6000 });
      return;
    }
    toast.error(datos?.error || mensajePorDefecto);
  };

  const abrirCrear = () => {
    setErrorCorreo(null);
    setForm(formVacio);
    setSeccion(SECCIONES[0].id);
    if (!catalogos.departamentos.length || !catalogos.puestos.length) cargarCatalogos();
    api.get('/empleados/siguiente-codigo')
      .then(r => setProximoCodigo(r.data.codigo))
      .catch(() => setProximoCodigo('EMP-???'));
    setModal('crear');
  };

  /**
   * El listado solo trae un resumen (nombre completo, nombres de departamento
   * y puesto). Armar el formulario con esa fila dejaba vacios el DPI, la fecha
   * de nacimiento, el departamento y el puesto, y partia mal el nombre. Por eso
   * la ficha completa se pide al servidor cada vez que se abre la edicion.
   */
  const abrirEditar = async (emp) => {
    setErrorCorreo(null);
    if (!catalogos.departamentos.length || !catalogos.puestos.length) cargarCatalogos();
    setSeleccionado(emp);
    setForm(formVacio);
    setSeccion(SECCIONES[0].id);
    setCargandoFicha(true);
    setModal('editar');
    try {
      const { data } = await api.get(`/empleados/${emp.id}`);
      setSeleccionado(data);
      // Un solo recorrido sobre la definición de campos: así un dato nuevo se
      // carga en el formulario con solo agregarlo a SECCIONES.
      const cargado = Object.fromEntries(
        TODOS_LOS_CAMPOS.map((c) => [c.name, data[c.name] ?? POR_OMISION[c.name] ?? ''])
      );
      setForm({
        ...cargado,
        codigo_empleado: data.codigo_empleado,
        estado: data.estado || 'Activo',
      });
    } catch {
      toast.error('No se pudo cargar la ficha del empleado.');
      cerrar();
    } finally {
      setCargandoFicha(false);
    }
  };

  const abrirBaja = (emp) => {
    setSeleccionado(emp);
    setMotivoBaja('');
    setModal('baja');
  };

  /**
   * El navegador no avisa de un campo obligatorio que está en una sección
   * oculta: el formulario simplemente no se envía y parece que el botón no
   * responde. Por eso se comprueban aquí y se salta a la sección del primero
   * que falte.
   */
  const faltaAlgunObligatorio = () => {
    for (const s of SECCIONES) {
      const falta = s.campos.find(c => c.req && String(form[c.name] ?? '').trim() === '');
      if (falta) {
        setSeccion(s.id);
        toast.error(`Falta completar "${falta.label}" en ${s.titulo}.`);
        return true;
      }
    }
    return false;
  };

  const handleCrear = async e => {
    e.preventDefault();
    if (enviando || faltaAlgunObligatorio()) return;
    setEnviando(true);
    try {
      await api.post('/empleados', form);
      toast.success('Empleado creado exitosamente');
      cerrar();
      cargar();
    } catch (err) {
      manejarError(err, 'Error al crear empleado');
    } finally {
      setEnviando(false);
    }
  };

  const handleEditar = async e => {
    e.preventDefault();
    if (enviando || faltaAlgunObligatorio()) return;
    setEnviando(true);
    try {
      await api.put(`/empleados/${seleccionado.id}`, form);
      toast.success('Empleado actualizado');
      cerrar();
      cargar();
    } catch (err) {
      manejarError(err, 'Error al actualizar');
    } finally {
      setEnviando(false);
    }
  };

  const handleBaja = async e => {
    e.preventDefault();
    if (!motivoBaja.trim()) return toast.error('Ingrese el motivo de baja');
    try {
      const { data } = await api.patch(`/empleados/${seleccionado.id}/baja`, { motivo_baja: motivoBaja, tipo_baja: tipoBaja });
      toast.success(data.mensaje || 'Empleado dado de baja');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al dar de baja');
    }
  };

  const renderCampo = (c) => {
    const conflicto = c.name === 'correo' && errorCorreo;
    const vencido = VENCIMIENTOS.includes(c.name) && form[c.name] && form[c.name] < hoy();
    const comunes = {
      name: c.name,
      value: form[c.name] ?? '',
      onChange: handleChange,
      disabled: cargandoFicha,
      style: { ...s.input, ...(conflicto ? s.inputError : {}) },
    };

    return (
      <div key={c.name} style={{ ...s.campo, ...(c.ancho === 'completo' ? { gridColumn:'1/-1' } : {}) }}>
        <label style={s.label}>
          {c.label}
          {c.req && <span style={s.obligatorio} title="Obligatorio"> *</span>}
          {modal === 'editar' && c.borrable && String(form[c.name] ?? '') !== '' && (
            <button type="button" style={s.btnQuitar} onClick={() => limpiarCampo(c.name)}>
              Quitar
            </button>
          )}
        </label>

        {c.tipo === 'textarea' ? (
          <textarea {...comunes} rows={2} placeholder="Opcional"
            style={{ ...comunes.style, resize:'vertical', fontFamily:'inherit' }}/>
        ) : c.tipo === 'select' ? (
          <select {...comunes}>
            {c.vacio && <option value="">{c.vacio}</option>}
            {c.opciones.map((o) => {
              const [valor, texto] = Array.isArray(o) ? o : [o, o];
              return <option key={valor} value={valor}>{texto}</option>;
            })}
          </select>
        ) : c.tipo === 'catalogo' ? (
          <select {...comunes} required={c.req}>
            <option value="">Seleccionar...</option>
            {catalogos[c.catalogo].map(x => (
              <option key={x.id} value={x.id}>{x.nombre}</option>
            ))}
          </select>
        ) : (
          <input {...comunes} type={c.tipo}
            step={c.tipo === 'number' ? (c.paso || '0.01') : undefined}
            min={c.tipo === 'number' ? '0' : undefined}
            aria-invalid={conflicto ? 'true' : undefined}/>
        )}

        {conflicto && <span style={s.mensajeError}>{errorCorreo}</span>}
        {vencido && <span style={s.mensajeAviso}>Vencido. Solicite la renovación del documento.</span>}
        {c.ayuda && !conflicto && <span style={s.ayudaCampo}>{c.ayuda}</span>}
      </div>
    );
  };

  const seccionActual = SECCIONES.find(x => x.id === seccion) || SECCIONES[0];

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Empleados</h1>
          <p style={s.sub}>Gestión del personal municipal</p>
        </div>
        <button style={s.btnAdd} onClick={abrirCrear}>
          <UserPlus size={18}/> Nuevo Empleado
        </button>
      </div>

      <div style={s.searchBox}>
        <Search size={18} color="#94a3b8"/>
        <input style={s.searchInput} placeholder="Buscar por nombre o código..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['Código','Nombre','Dependencia','Puesto','Renglón','Contrato','Estado','Acciones'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(emp => (
              <tr key={emp.id} style={s.tr}>
                <td style={s.td}><code style={s.code}>{emp.codigo_empleado}</code></td>
                <td style={s.td}>{emp.nombre_completo}</td>
                <td style={s.td}>{emp.departamento}</td>
                <td style={s.td}>{emp.puesto}</td>
                <td style={s.td}>{emp.renglon || '—'}</td>
                <td style={s.td}>{emp.tipo_contrato}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: emp.estado === 'Activo' ? '#22c55e' : '#ef4444' }}>
                    {emp.estado}
                  </span>
                  {emp.situacion && emp.situacion !== 'Activo' && (
                    <span style={{ ...s.badge, background:'#64748b', marginLeft:'.35rem' }}>
                      {emp.situacion}
                    </span>
                  )}
                </td>
                <td style={s.td}>
                  <div style={{ display:'flex', gap:'.4rem' }}>
                    <button style={s.btnExp} onClick={() => navigate(`/empleados/${emp.id}/expediente`)}
                      title="Expediente: capacitaciones, evaluaciones, llamadas de atención y baja IGSS">
                      <FolderOpen size={15}/>
                    </button>
                    <button style={s.btnEdit} onClick={() => abrirEditar(emp)} title="Editar">
                      <Pencil size={15}/>
                    </button>
                    {emp.estado === 'Activo' && (
                      <button style={s.btnBaja} onClick={() => abrirBaja(emp)} title="Dar de baja">
                        <UserX size={15}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && (
          <p style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>No hay empleados registrados</p>
        )}
      </div>

      {(modal === 'crear' || modal === 'editar') && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>{modal === 'crear' ? 'Nuevo Empleado' : 'Editar Empleado'}</h2>
            <p style={s.ayudaModal}>
              {modal === 'editar' && cargandoFicha
                ? 'Cargando la ficha completa del empleado...'
                : 'Los campos marcados con * son obligatorios; el resto puede quedar en blanco '
                  + 'y completarse después. Recorra las secciones para llenar toda la ficha.'}
            </p>

            <div style={s.tabs}>
              {SECCIONES.map(x => (
                <button key={x.id} type="button"
                  onClick={() => setSeccion(x.id)}
                  style={{ ...s.tab, ...(x.id === seccion ? s.tabActiva : {}) }}>
                  {x.titulo}
                </button>
              ))}
            </div>

            <form onSubmit={modal === 'crear' ? handleCrear : handleEditar}>
              {modal === 'crear' && seccion === SECCIONES[0].id && (
                <div style={{ ...s.campo, marginBottom:'1rem' }}>
                  <label style={s.label}>Código de empleado</label>
                  <div style={s.codigoAuto}>
                    <span style={s.codigoBadge}>{proximoCodigo || '...'}</span>
                    <span style={s.codigoInfo}>Asignado automáticamente por el sistema</span>
                  </div>
                </div>
              )}

              {seccionActual.nota && <p style={s.notaSeccion}>{seccionActual.nota}</p>}

              <div style={s.formGrid}>
                {seccionActual.campos.map(renderCampo)}
              </div>

              <div style={s.pie}>
                <button type="button" style={s.btnCancelar} onClick={cerrar}>Cancelar</button>
                <button type="submit" style={{ ...s.btnGuardar, opacity: enviando ? 0.7 : 1 }}
                  disabled={cargandoFicha || enviando}>
                  {enviando ? 'Guardando...' : (modal === 'crear' ? 'Guardar empleado' : 'Actualizar empleado')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'baja' && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth:'420px' }}>
            <h2 style={{ ...s.modalTitle, color:'#dc2626' }}>Dar de Baja</h2>
            <p style={{ color:'#64748b', marginBottom:'1rem' }}>
              ¿Dar de baja a <strong>{seleccionado?.nombre_completo}</strong>?
              Esta acción marcará al empleado como inactivo y abrirá el aviso de baja
              ante el IGSS en su expediente.
            </p>
            <form onSubmit={handleBaja} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Tipo de baja</label>
                <select value={tipoBaja} onChange={e => setTipoBaja(e.target.value)} style={s.input}>
                  {['Renuncia','Despido','Fin de contrato','Jubilación','Fallecimiento','Otro'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Motivo de baja</label>
                <textarea value={motivoBaja} onChange={e => setMotivoBaja(e.target.value)}
                  rows={3} required style={{ ...s.input, resize:'vertical' }}
                  placeholder="Describe el motivo..."/>
              </div>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={cerrar}>Cancelar</button>
                <button type="submit" style={{ ...s.btnGuardar, background:'#dc2626' }}>Confirmar Baja</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:      { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' },
  titulo:      { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:         { color:'#64748b' },
  btnAdd:      { display:'flex', alignItems:'center', gap:'.5rem', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:'8px', padding:'.75rem 1.25rem', fontWeight:600, fontSize:'.9rem', cursor:'pointer' },
  searchBox:   { display:'flex', alignItems:'center', gap:'.75rem', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:'10px', padding:'.65rem 1rem', marginBottom:'1rem' },
  searchInput: { border:'none', outline:'none', flex:1, fontSize:'.95rem' },
  tabla:       { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:         { width:'100%', borderCollapse:'collapse', minWidth:'860px' },
  th:          { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  tr:          { transition:'background .15s' },
  td:          { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  code:        { background:'#f1f5f9', padding:'.15rem .5rem', borderRadius:'4px', fontSize:'.82rem' },
  badge:       { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:500, whiteSpace:'nowrap' },
  btnExp:      { background:'#ccfbf1', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#0f766e', cursor:'pointer' },
  btnEdit:     { background:'#dbeafe', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#2563eb', cursor:'pointer' },
  btnBaja:     { background:'#fee2e2', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#dc2626', cursor:'pointer' },
  overlay:     { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:       { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxWidth:'760px', maxHeight:'90vh', overflowY:'auto' },
  modalTitle:  { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'.75rem' },
  tabs:        { display:'flex', flexWrap:'wrap', gap:'.35rem', borderBottom:'2px solid #e2e8f0', marginBottom:'1.25rem' },
  tab:         { background:'transparent', border:'none', borderBottom:'3px solid transparent', padding:'.55rem .85rem', fontSize:'.85rem', fontWeight:600, color:'#64748b', cursor:'pointer', marginBottom:'-2px' },
  tabActiva:   { color:'#1e3a5f', borderBottomColor:'#1e3a5f' },
  formGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'1rem' },
  pie:         { display:'flex', gap:'1rem', justifyContent:'flex-end', marginTop:'1.5rem', paddingTop:'1rem', borderTop:'1px solid #f1f5f9' },
  codigoAuto:  { display:'flex', alignItems:'center', gap:'.75rem', background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:'8px', padding:'.65rem 1rem' },
  codigoBadge: { fontWeight:700, fontSize:'1rem', color:'#15803d', letterSpacing:'.05em' },
  codigoInfo:  { fontSize:'.8rem', color:'#4b5563' },
  campo:       { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:       { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  obligatorio: { color:'#dc2626' },
  input:       { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'.9rem', outline:'none', width:'100%', boxSizing:'border-box' },
  inputError:  { borderColor:'#ef4444', background:'#fef2f2' },
  mensajeError:{ fontSize:'.78rem', color:'#b91c1c', lineHeight:1.4, marginTop:'.15rem' },
  mensajeAviso:{ fontSize:'.78rem', color:'#b45309', lineHeight:1.4, marginTop:'.15rem', fontWeight:600 },
  ayudaCampo:  { fontSize:'.75rem', color:'#94a3b8', lineHeight:1.4 },
  ayudaModal:  { fontSize:'.82rem', color:'#64748b', lineHeight:1.5, marginBottom:'1rem' },
  notaSeccion: { fontSize:'.8rem', color:'#64748b', lineHeight:1.5, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'.6rem .8rem', marginBottom:'1rem' },
  btnQuitar:   { marginLeft:'.5rem', background:'transparent', border:'none', color:'#b91c1c',
                 fontSize:'.72rem', fontWeight:600, padding:0, textDecoration:'underline', cursor:'pointer' },
  btnCancelar: { padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
  btnGuardar:  { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
};
