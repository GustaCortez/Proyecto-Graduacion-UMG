import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, CalendarDays, Power } from 'lucide-react';

/**
 * Administración de asuetos.
 *
 * Importa porque las vacaciones se miden en DÍAS HÁBILES: un día marcado aquí
 * no se descuenta del saldo del empleado. La feria titular del municipio se
 * agrega como asueto de tipo Municipal.
 */
export default function Asuetos() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio]         = useState(anioActual);
  const [feriados, setFeriados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ fecha: '', nombre: '', tipo: 'Municipal' });

  const cargar = useCallback(() => {
    setCargando(true);
    api.get(`/feriados?anio=${anio}`)
      .then((r) => setFeriados(r.data.feriados))
      .catch(() => setFeriados([]))
      .finally(() => setCargando(false));
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.post('/feriados', form);
      toast.success('Asueto registrado');
      setModal(false);
      setForm({ fecha: '', nombre: '', tipo: 'Municipal' });
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar');
    }
  };

  const alternar = async (f) => {
    try {
      const { data } = await api.patch(`/feriados/${f.id}/estado`);
      toast.success(data.mensaje);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar el estado');
    }
  };

  const eliminar = async (f) => {
    if (!window.confirm(`¿Eliminar el asueto "${f.nombre}" del ${f.fecha}?`)) return;
    try {
      await api.delete(`/feriados/${f.id}`);
      toast.success('Asueto eliminado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const generarNacionales = async () => {
    try {
      const { data } = await api.post('/feriados/nacionales', { anio });
      toast.success(data.mensaje);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar');
    }
  };

  const anios = [];
  for (let a = anioActual - 2; a <= anioActual + 3; a++) anios.push(a);

  const diaSemana = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][
      new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Asuetos</h1>
          <p style={s.sub}>Días que no se descuentan del saldo de vacaciones</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button style={s.btnSec} onClick={generarNacionales}>
            <CalendarDays size={16} /> Cargar nacionales {anio}
          </button>
          <button style={s.btnPri} onClick={() => setModal(true)}>
            <Plus size={16} /> Nuevo asueto
          </button>
        </div>
      </div>

      <div style={s.filtros}>
        <label style={s.label}>Año</label>
        <select style={s.select} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={s.contador}>{feriados.length} asueto(s)</span>
      </div>

      {cargando ? <p style={s.cargando}>Cargando...</p> : (
        <div style={s.tabla}>
          <table style={s.tbl}>
            <thead>
              <tr>{['Fecha','Día','Nombre','Tipo','Estado',''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {feriados.length === 0 && (
                <tr><td style={s.td} colSpan={6}>
                  No hay asuetos registrados para {anio}. Use "Cargar nacionales".
                </td></tr>
              )}
              {feriados.map((f) => (
                <tr key={f.id} style={{ opacity: f.activo ? 1 : 0.5 }}>
                  <td style={s.td}><span style={s.code}>{f.fecha}</span></td>
                  <td style={{ ...s.td, color: '#64748b' }}>{diaSemana(f.fecha)}</td>
                  <td style={s.td}>{f.nombre}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: f.tipo === 'Nacional' ? '#1e3a5f' : '#0d9488' }}>
                      {f.tipo}
                    </span>
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: f.activo ? '#22c55e' : '#94a3b8' }}>
                      {f.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ ...s.td, display: 'flex', gap: '.4rem' }}>
                    <button style={s.btnIcono} onClick={() => alternar(f)} title={f.activo ? 'Desactivar' : 'Activar'}>
                      <Power size={15} />
                    </button>
                    <button style={{ ...s.btnIcono, background: '#fee2e2', color: '#dc2626' }}
                      onClick={() => eliminar(f)} title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={s.overlay} onClick={() => setModal(false)}>
          <form style={s.modal} onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
            <h2 style={s.modalTitle}>Nuevo asueto</h2>
            <div style={s.campo}>
              <label style={s.label}>Fecha</label>
              <input style={s.input} type="date" required value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div style={{ ...s.campo, marginTop: '.85rem' }}>
              <label style={s.label}>Nombre</label>
              <input style={s.input} required minLength={3} placeholder="Ej. Feria titular de Jalapa"
                value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div style={{ ...s.campo, marginTop: '.85rem' }}>
              <label style={s.label}>Tipo</label>
              <select style={s.input} value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="Municipal">Municipal</option>
                <option value="Nacional">Nacional</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" style={s.btnCancelar} onClick={() => setModal(false)}>Cancelar</button>
              <button type="submit" style={s.btnGuardar}>Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                marginBottom:'1.25rem', gap:'1rem', flexWrap:'wrap' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b' },
  filtros:    { display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'1rem' },
  contador:   { fontSize:'.82rem', color:'#64748b', marginLeft:'auto' },
  cargando:   { color:'#64748b' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'640px' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b',
                background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.7rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  code:       { background:'#f1f5f9', padding:'.15rem .5rem', borderRadius:'4px', fontSize:'.82rem' },
  badge:      { padding:'.2rem .65rem', borderRadius:'99px', fontSize:'.72rem', color:'#fff', fontWeight:600 },
  btnIcono:   { background:'#e0f2fe', border:'none', borderRadius:'6px', padding:'5px',
                display:'flex', color:'#0369a1', cursor:'pointer' },
  btnPri:     { display:'flex', alignItems:'center', gap:'.4rem', padding:'.6rem 1rem', border:'none',
                borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
  btnSec:     { display:'flex', alignItems:'center', gap:'.4rem', padding:'.6rem 1rem',
                border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#334155',
                fontWeight:600, cursor:'pointer' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex',
                alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxWidth:'420px' },
  modalTitle: { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'1rem' },
  campo:      { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:      { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  input:      { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                fontSize:'.9rem', outline:'none', width:'100%', boxSizing:'border-box' },
  select:     { padding:'.5rem .75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                fontSize:'.9rem', outline:'none' },
  btnCancelar:{ padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
  btnGuardar: { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f',
                color:'#fff', fontWeight:600, cursor:'pointer' },
};
