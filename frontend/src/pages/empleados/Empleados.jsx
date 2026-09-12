import { useEffect, useState } from 'react';
import api from '../../services/api';
import { UserPlus, Search, Pencil, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

const formVacio = {
  nombres:'', apellidos:'', dpi:'',
  fecha_nacimiento:'', genero:'M', telefono:'', correo:'',
  fecha_ingreso:'', tipo_contrato:'Permanente',
  salario_base:'', id_departamento:'', id_puesto:''
};

export default function Empleados() {
  const [empleados, setEmpleados]   = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [catalogos, setCatalogos]   = useState({ departamentos:[], puestos:[] });
  const [modal, setModal]           = useState(null); // 'crear' | 'editar' | 'baja'
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm]             = useState(formVacio);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [proximoCodigo, setProximoCodigo] = useState('');

  const cargar = () => api.get('/empleados').then(r => setEmpleados(r.data));

  useEffect(() => {
    cargar();
    api.get('/empleados/catalogos').then(r => setCatalogos(r.data));
  }, []);

  const filtrados = empleados.filter(e =>
    e.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.codigo_empleado.toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const abrirCrear = () => {
    setForm(formVacio);
    api.get('/empleados/siguiente-codigo')
      .then(r => setProximoCodigo(r.data.codigo))
      .catch(() => setProximoCodigo('EMP-???'));
    setModal('crear');
  };

  const abrirEditar = (emp) => {
    setSeleccionado(emp);
    setForm({
      codigo_empleado: emp.codigo_empleado,
      nombres:         emp.nombres || emp.nombre_completo.split(' ')[0],
      apellidos:       emp.apellidos || emp.nombre_completo.split(' ').slice(1).join(' '),
      dpi:             emp.dpi || '',
      fecha_nacimiento:emp.fecha_nacimiento ? emp.fecha_nacimiento.slice(0,10) : '',
      genero:          emp.genero || 'M',
      telefono:        emp.telefono || '',
      correo:          emp.correo || '',
      fecha_ingreso:   emp.fecha_ingreso ? emp.fecha_ingreso.slice(0,10) : '',
      tipo_contrato:   emp.tipo_contrato,
      salario_base:    emp.salario_base || '',
      id_departamento: emp.id_departamento || '',
      id_puesto:       emp.id_puesto || '',
    });
    setModal('editar');
  };

  const abrirBaja = (emp) => {
    setSeleccionado(emp);
    setMotivoBaja('');
    setModal('baja');
  };

  const cerrar = () => { setModal(null); setSeleccionado(null); };

  const handleCrear = async e => {
    e.preventDefault();
    try {
      await api.post('/empleados', form);
      toast.success('Empleado creado exitosamente');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear empleado');
    }
  };

  const handleEditar = async e => {
    e.preventDefault();
    try {
      await api.put(`/empleados/${seleccionado.id}`, form);
      toast.success('Empleado actualizado');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    }
  };

  const handleBaja = async e => {
    e.preventDefault();
    if (!motivoBaja.trim()) return toast.error('Ingrese el motivo de baja');
    try {
      await api.patch(`/empleados/${seleccionado.id}/baja`, { motivo_baja: motivoBaja });
      toast.success('Empleado dado de baja');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al dar de baja');
    }
  };

  const camposTexto = [
    ['nombres','Nombres','text'],
    ['apellidos','Apellidos','text'],
    ['dpi','DPI','text'],
    ['fecha_nacimiento','Fecha de nacimiento','date'],
    ['telefono','Teléfono','text'],
    ['correo','Correo electrónico','email'],
    ['fecha_ingreso','Fecha de ingreso','date'],
    ['salario_base','Salario base','number'],
  ];

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
              {['Código','Nombre','Departamento','Puesto','Contrato','Estado','Acciones'].map(h => (
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
                <td style={s.td}>{emp.tipo_contrato}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: emp.estado === 'Activo' ? '#22c55e' : '#ef4444' }}>
                    {emp.estado}
                  </span>
                </td>
                <td style={s.td}>
                  <div style={{ display:'flex', gap:'.4rem' }}>
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

      {/* Modal Crear / Editar */}
      {(modal === 'crear' || modal === 'editar') && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>{modal === 'crear' ? 'Nuevo Empleado' : 'Editar Empleado'}</h2>
            <form onSubmit={modal === 'crear' ? handleCrear : handleEditar} style={s.formGrid}>
              {modal === 'crear' && (
                <div style={{ gridColumn:'1/-1', ...s.campo }}>
                  <label style={s.label}>Código de empleado</label>
                  <div style={s.codigoAuto}>
                    <span style={s.codigoBadge}>{proximoCodigo || '...'}</span>
                    <span style={s.codigoInfo}>Asignado automáticamente por el sistema</span>
                  </div>
                </div>
              )}
              {camposTexto.map(([name, label, type]) => (
                <div key={name} style={s.campo}>
                  <label style={s.label}>{label}</label>
                  <input name={name} type={type} value={form[name]}
                    onChange={handleChange} required={modal === 'crear'} style={s.input}/>
                </div>
              ))}

              <div style={s.campo}>
                <label style={s.label}>Género</label>
                <select name="genero" value={form.genero} onChange={handleChange} style={s.input}>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div style={s.campo}>
                <label style={s.label}>Tipo de contrato</label>
                <select name="tipo_contrato" value={form.tipo_contrato} onChange={handleChange} style={s.input}>
                  <option value="Permanente">Permanente</option>
                  <option value="Temporal">Temporal</option>
                  <option value="Contrato">Contrato</option>
                </select>
              </div>

              <div style={s.campo}>
                <label style={s.label}>Departamento</label>
                <select name="id_departamento" value={form.id_departamento} onChange={handleChange} required={modal === 'crear'} style={s.input}>
                  <option value="">Seleccionar...</option>
                  {catalogos.departamentos.map(d => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={s.campo}>
                <label style={s.label}>Puesto</label>
                <select name="id_puesto" value={form.id_puesto} onChange={handleChange} required={modal === 'crear'} style={s.input}>
                  <option value="">Seleccionar...</option>
                  {catalogos.puestos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn:'1/-1', display:'flex', gap:'1rem', justifyContent:'flex-end', marginTop:'.5rem' }}>
                <button type="button" style={s.btnCancelar} onClick={cerrar}>Cancelar</button>
                <button type="submit" style={s.btnGuardar}>
                  {modal === 'crear' ? 'Guardar empleado' : 'Actualizar empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dar de Baja */}
      {modal === 'baja' && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth:'420px' }}>
            <h2 style={{ ...s.modalTitle, color:'#dc2626' }}>Dar de Baja</h2>
            <p style={{ color:'#64748b', marginBottom:'1rem' }}>
              ¿Dar de baja a <strong>{seleccionado?.nombre_completo}</strong>?
              Esta acción marcará al empleado como inactivo.
            </p>
            <form onSubmit={handleBaja} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
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
  tabla:       { background:'#fff', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:         { width:'100%', borderCollapse:'collapse' },
  th:          { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  tr:          { transition:'background .15s' },
  td:          { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  code:        { background:'#f1f5f9', padding:'.15rem .5rem', borderRadius:'4px', fontSize:'.82rem' },
  badge:       { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:500 },
  btnEdit:     { background:'#dbeafe', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#2563eb', cursor:'pointer' },
  btnBaja:     { background:'#fee2e2', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#dc2626', cursor:'pointer' },
  overlay:     { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:       { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxWidth:'700px', maxHeight:'90vh', overflowY:'auto' },
  modalTitle:  { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'1.5rem' },
  formGrid:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' },
  codigoAuto:  { display:'flex', alignItems:'center', gap:'.75rem', background:'#f0fdf4', border:'1.5px solid #bbf7d0', borderRadius:'8px', padding:'.65rem 1rem' },
  codigoBadge: { fontWeight:700, fontSize:'1rem', color:'#15803d', letterSpacing:'.05em' },
  codigoInfo:  { fontSize:'.8rem', color:'#4b5563' },
  campo:       { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:       { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  input:       { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'.9rem', outline:'none', width:'100%', boxSizing:'border-box' },
  btnCancelar: { padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
  btnGuardar:  { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
};
