import { useEffect, useState } from 'react';
import api from '../../services/api';
import { FilePlus, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function Solicitudes() {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [tipos, setTipos]             = useState([]);
  const [empleados, setEmpleados]     = useState([]);    
  const [modal, setModal]             = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('Pendiente');
  const [form, setForm]               = useState({
    id_empleado:'', id_tipo:'', fecha_inicio:'', fecha_fin:'', dias_solicitados:'', motivo:''
  });

  const cargar = () => api.get('/solicitudes').then(r => setSolicitudes(r.data));

  useEffect(() => {
    cargar();
    api.get('/solicitudes/tipos').then(r => setTipos(r.data));
    api.get('/empleados').then(r => setEmpleados(r.data));
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await api.post('/solicitudes', form);
      toast.success('Solicitud creada exitosamente');
      setModal(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear solicitud');
    }
  };

  const cambiarEstado = async (id, estado) => {
    try {
      await api.patch(`/solicitudes/${id}/estado`, { estado, comentario_rrhh: '' });
      toast.success(`Solicitud ${estado.toLowerCase()}`);
      cargar();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const colores = { 'Pendiente':'#f59e0b','En revision':'#3b82f6','Aprobada':'#22c55e','Rechazada':'#ef4444','Cancelada':'#94a3b8' };
  const esRRHH  = ['admin','rrhh'].includes(usuario?.rol);

  const ESTADOS = ['Pendiente','En revision','Aprobada','Rechazada','Cancelada','Todas'];
  const solicitudesFiltradas = filtroEstado === 'Todas'
    ? solicitudes
    : solicitudes.filter(s => s.estado === filtroEstado);

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Solicitudes</h1>
          <p style={s.sub}>Gestión de trámites del personal</p>
        </div>
        <button style={s.btnAdd} onClick={() => setModal(true)}>
          <FilePlus size={18}/> Nueva Solicitud
        </button>
      </div>

      <div style={s.filtros}>
        {ESTADOS.map(est => (
          <button
            key={est}
            style={{
              ...s.filtroBtn,
              background: filtroEstado === est ? (colores[est] || '#1e3a5f') : '#f1f5f9',
              color: filtroEstado === est ? '#fff' : '#64748b',
              fontWeight: filtroEstado === est ? 700 : 500,
            }}
            onClick={() => setFiltroEstado(est)}
          >
            {est}
            <span style={s.filtroCount}>
              {est === 'Todas' ? solicitudes.length : solicitudes.filter(x => x.estado === est).length}
            </span>
          </button>
        ))}
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['#','Empleado','Tipo','Fecha inicio','Días','Estado','Acciones'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudesFiltradas.map(sol => (
              <tr key={sol.id}>
                <td style={s.td}>{sol.id}</td>
                <td style={s.td}>{sol.empleado}</td>
                <td style={s.td}>{sol.tipo_solicitud}</td>
                <td style={s.td}>{new Date(sol.fecha_inicio).toLocaleDateString('es-GT')}</td>
                <td style={s.td}>{sol.dias_solicitados || '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                </td>
                <td style={s.td}>
                  {esRRHH && sol.estado === 'Pendiente' && (
                    <div style={{ display:'flex', gap:'.5rem' }}>
                      <button style={s.btnAprobar} onClick={() => cambiarEstado(sol.id, 'Aprobada')} title="Aprobar">
                        <CheckCircle size={16}/>
                      </button>
                      <button style={s.btnRechazar} onClick={() => cambiarEstado(sol.id, 'Rechazada')} title="Rechazar">
                        <XCircle size={16}/>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!solicitudesFiltradas.length && (
          <p style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>
            {filtroEstado === 'Todas' ? 'No hay solicitudes registradas' : `No hay solicitudes con estado "${filtroEstado}"`}
          </p>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Nueva Solicitud</h2>
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Empleado</label>
                <select name="id_empleado" value={form.id_empleado} onChange={handleChange} required style={s.input}>
                  <option value="">Seleccionar empleado...</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                  ))}
                </select>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Tipo de solicitud</label>
                <select name="id_tipo" value={form.id_tipo} onChange={handleChange} required style={s.input}>
                  <option value="">Seleccionar tipo...</option>
                  {tipos.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>Fecha inicio</label>
                  <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required style={s.input}/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Fecha fin</label>
                  <input name="fecha_fin" type="date" value={form.fecha_fin} onChange={handleChange} style={s.input}/>
                </div>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Días solicitados</label>
                <input name="dias_solicitados" type="number" min="1" value={form.dias_solicitados} onChange={handleChange} style={s.input}/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Motivo</label>
                <textarea name="motivo" value={form.motivo} onChange={handleChange} required rows={3}
                  style={{ ...s.input, resize:'vertical' }} placeholder="Describe el motivo de la solicitud..."/>
              </div>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" style={s.btnGuardar}>Crear solicitud</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b' },
  btnAdd:     { display:'flex', alignItems:'center', gap:'.5rem', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:'8px', padding:'.75rem 1.25rem', fontWeight:600, fontSize:'.9rem' },
  filtros:    { display:'flex', gap:'.5rem', flexWrap:'wrap', marginBottom:'1rem' },
  filtroBtn:  { display:'flex', alignItems:'center', gap:'.4rem', padding:'.45rem 1rem', borderRadius:'99px', border:'none', cursor:'pointer', fontSize:'.82rem', transition:'all .15s' },
  filtroCount:{ background:'rgba(255,255,255,0.3)', borderRadius:'99px', padding:'1px 7px', fontSize:'.75rem', fontWeight:700 },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  badge:      { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:500 },
  btnAprobar: { background:'#dcfce7', border:'none', borderRadius:'6px', padding:'4px', display:'flex', color:'#16a34a' },
  btnRechazar:{ background:'#fee2e2', border:'none', borderRadius:'6px', padding:'4px', display:'flex', color:'#dc2626' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxWidth:'500px', maxHeight:'90vh', overflowY:'auto' },
  modalTitle: { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'1.5rem' },
  campo:      { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:      { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  input:      { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'.9rem', outline:'none', width:'100%' },
  btnCancelar:{ padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#64748b', fontWeight:600 },
  btnGuardar: { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600 },
};