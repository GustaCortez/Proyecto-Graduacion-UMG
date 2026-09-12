import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Vacaciones() {
  const [vacaciones, setVacaciones] = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [modal, setModal]           = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm]             = useState({ dias_disponibles:'', dias_usados:'' });

  const cargar = () => api.get('/vacaciones').then(r => setVacaciones(r.data)).catch(() => setVacaciones([]));

  useEffect(() => { cargar(); }, []);

  const filtrados = vacaciones.filter(v =>
    `${v.nombres} ${v.apellidos}`.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.codigo_empleado?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const abrirEditar = (v) => {
    setSeleccionado(v);
    setForm({ dias_disponibles: v.dias_disponibles ?? '', dias_usados: v.dias_usados ?? '' });
    setModal(true);
  };

  const handleGuardar = async e => {
    e.preventDefault();
    try {
      await api.patch(`/vacaciones/${seleccionado.id}/saldo`, {
        dias_disponibles: Number(form.dias_disponibles),
        dias_usados: Number(form.dias_usados),
      });
      toast.success('Saldo actualizado');
      setModal(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar');
    }
  };

  const colorSaldo = (saldo) => {
    if (saldo > 10) return '#22c55e';
    if (saldo > 0)  return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Vacaciones</h1>
          <p style={s.sub}>Saldo de días por empleado — {new Date().getFullYear()}</p>
        </div>
      </div>

      <div style={s.searchBox}>
        <input style={s.searchInput} placeholder="Buscar empleado..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['Código','Empleado','Departamento','Año','Disponibles','Usados','Saldo',''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(v => (
              <tr key={v.id}>
                <td style={s.td}><code style={s.code}>{v.codigo_empleado}</code></td>
                <td style={s.td}>{v.nombres} {v.apellidos}</td>
                <td style={s.td}>{v.departamento || '—'}</td>
                <td style={s.td}>{v.anio}</td>
                <td style={s.td}>{v.dias_disponibles ?? '—'}</td>
                <td style={s.td}>{v.dias_usados ?? '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colorSaldo(v.saldo ?? 0) }}>
                    {v.saldo ?? '—'} días
                  </span>
                </td>
                <td style={s.td}>
                  <button style={s.btnEdit} onClick={() => abrirEditar(v)} title="Editar saldo">
                    <Pencil size={15}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtrados.length && (
          <p style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>No hay registros de vacaciones</p>
        )}
      </div>

      {modal && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth:'400px' }}>
            <h2 style={s.modalTitle}>Editar Saldo de Vacaciones</h2>
            <p style={{ color:'#64748b', marginBottom:'1rem' }}>
              {seleccionado?.nombres} {seleccionado?.apellidos} — {seleccionado?.anio}
            </p>
            <form onSubmit={handleGuardar} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Días disponibles</label>
                <input type="number" min="0" value={form.dias_disponibles}
                  onChange={e => setForm({ ...form, dias_disponibles: e.target.value })}
                  required style={s.input}/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Días usados</label>
                <input type="number" min="0" value={form.dias_usados}
                  onChange={e => setForm({ ...form, dias_usados: e.target.value })}
                  required style={s.input}/>
              </div>
              <p style={{ color:'#64748b', fontSize:'.85rem' }}>
                Saldo resultante: <strong>{(Number(form.dias_disponibles) - Number(form.dias_usados)) || 0} días</strong>
              </p>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" style={s.btnGuardar}>Guardar</button>
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
  searchBox:  { background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:'10px', padding:'.65rem 1rem', marginBottom:'1rem' },
  searchInput:{ border:'none', outline:'none', width:'100%', fontSize:'.95rem' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  code:       { background:'#f1f5f9', padding:'.15rem .5rem', borderRadius:'4px', fontSize:'.82rem' },
  badge:      { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:600 },
  btnEdit:    { background:'#dbeafe', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#2563eb', cursor:'pointer' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxHeight:'90vh', overflowY:'auto' },
  modalTitle: { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'1rem' },
  campo:      { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:      { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  input:      { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'.9rem', outline:'none', width:'100%', boxSizing:'border-box' },
  btnCancelar:{ padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
  btnGuardar: { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
};
