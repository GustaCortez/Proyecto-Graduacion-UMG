import { useEffect, useState } from 'react';
import api from '../../services/api';
import { FilePlus, Clock, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const colores = { 'Pendiente': '#f59e0b', 'En revision': '#3b82f6', 'Aprobada': '#22c55e', 'Rechazada': '#ef4444', 'Cancelada': '#94a3b8' };

const formVacio = { id_tipo: '', fecha_inicio: '', fecha_fin: '', dias_solicitados: '', motivo: '' };

export default function MisSolicitudes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [tipos, setTipos]             = useState([]);
  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState(formVacio);

  const cargar = () =>
    api.get('/solicitudes/mias').then(r => setSolicitudes(r.data)).catch(() => {});

  useEffect(() => {
    cargar();
    api.get('/solicitudes/tipos').then(r => setTipos(r.data)).catch(() => {});
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await api.post('/solicitudes', form);
      toast.success('Solicitud enviada');
      setModal(false);
      setForm(formVacio);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear solicitud');
    }
  };

  const pendientes = solicitudes.filter(s => s.estado === 'Pendiente').length;
  const aprobadas  = solicitudes.filter(s => s.estado === 'Aprobada').length;
  const rechazadas = solicitudes.filter(s => s.estado === 'Rechazada').length;

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Mis Solicitudes</h1>
          <p style={s.sub}>Historial de trámites enviados</p>
        </div>
        <button style={s.btnAdd} onClick={() => setModal(true)}>
          <FilePlus size={18}/> Nueva Solicitud
        </button>
      </div>

      {/* Resumen rápido */}
      <div style={s.resumen}>
        <div style={{ ...s.stat, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ ...s.iconBox, background: '#fef3c7' }}>
            <Clock size={22} color="#f59e0b"/>
          </div>
          <div>
            <p style={{ ...s.statNum, color: '#92400e' }}>{pendientes}</p>
            <p style={s.statLabel}>Pendientes</p>
          </div>
        </div>
        <div style={{ ...s.stat, borderLeft: '4px solid #22c55e' }}>
          <div style={{ ...s.iconBox, background: '#dcfce7' }}>
            <CheckCircle size={22} color="#22c55e"/>
          </div>
          <div>
            <p style={{ ...s.statNum, color: '#15803d' }}>{aprobadas}</p>
            <p style={s.statLabel}>Aprobadas</p>
          </div>
        </div>
        <div style={{ ...s.stat, borderLeft: '4px solid #ef4444' }}>
          <div style={{ ...s.iconBox, background: '#fee2e2' }}>
            <XCircle size={22} color="#ef4444"/>
          </div>
          <div>
            <p style={{ ...s.statNum, color: '#b91c1c' }}>{rechazadas}</p>
            <p style={s.statLabel}>Rechazadas</p>
          </div>
        </div>
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['#', 'Tipo', 'Fecha inicio', 'Días', 'Estado', 'Motivo', 'Comentario RRHH'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map(sol => (
              <tr key={sol.id}>
                <td style={s.td}>{sol.id}</td>
                <td style={s.td}>{sol.tipo_solicitud}</td>
                <td style={s.td}>{new Date(sol.fecha_inicio).toLocaleDateString('es-GT')}</td>
                <td style={s.td}>{sol.dias_solicitados || '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                </td>
                <td style={{ ...s.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sol.motivo}
                </td>
                <td style={s.td}>{sol.comentario_rrhh || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!solicitudes.length && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No tienes solicitudes registradas</p>
        )}
      </div>

      {/* Modal nueva solicitud */}
      {modal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Nueva Solicitud</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Tipo de solicitud</label>
                <select name="id_tipo" value={form.id_tipo} onChange={handleChange} required style={s.input}>
                  <option value="">Seleccionar tipo...</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>Fecha inicio</label>
                  <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required style={s.input}/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Fecha fin (opcional)</label>
                  <input name="fecha_fin" type="date" value={form.fecha_fin} onChange={handleChange} style={s.input}/>
                </div>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Días solicitados</label>
                <input name="dias_solicitados" type="number" min="1" value={form.dias_solicitados} onChange={handleChange} style={s.input}/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Motivo / Descripción</label>
                <textarea name="motivo" value={form.motivo} onChange={handleChange} required rows={3}
                  style={{ ...s.input, resize: 'vertical' }} placeholder="Mínimo 10 caracteres..."/>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => { setModal(false); setForm(formVacio); }}>
                  Cancelar
                </button>
                <button type="submit" style={s.btnGuardar}>Enviar solicitud</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  titulo:     { fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f' },
  sub:        { color: '#64748b' },
  btnAdd:     { display: 'flex', alignItems: 'center', gap: '.5rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '.75rem 1.25rem', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer' },
  resumen:    { display: 'flex', gap: '1rem', marginBottom: '1.25rem' },
  stat:       { background: '#fff', borderRadius: '12px', padding: '1.1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)', flex: 1 },
  iconBox:    { width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statNum:    { fontSize: '1.8rem', fontWeight: 700, margin: 0, lineHeight: 1 },
  statLabel:  { fontSize: '.82rem', color: '#64748b', margin: '4px 0 0' },
  tabla:      { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width: '100%', borderCollapse: 'collapse' },
  th:         { textAlign: 'left', padding: '.75rem 1rem', fontSize: '.8rem', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600 },
  td:         { padding: '.75rem 1rem', fontSize: '.9rem', borderBottom: '1px solid #f1f5f9' },
  badge:      { padding: '.25rem .75rem', borderRadius: '99px', fontSize: '.75rem', color: '#fff', fontWeight: 500 },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:      { background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '1.5rem' },
  campo:      { display: 'flex', flexDirection: 'column', gap: '.35rem' },
  label:      { fontSize: '.82rem', fontWeight: 600, color: '#374151' },
  input:      { padding: '.65rem .875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btnCancelar:{ padding: '.7rem 1.5rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' },
  btnGuardar: { padding: '.7rem 1.5rem', border: 'none', borderRadius: '8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, cursor: 'pointer' },
};
