import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Pencil, History, RefreshCw, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { fechaCorta } from '../../utils/fechas';

export default function Vacaciones() {
  const [vacaciones, setVacaciones] = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [modal, setModal]           = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm]             = useState({ dias_disponibles:'', dias_usados:'' });
  const [historial, setHistorial]   = useState(null);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio]             = useState(anioActual);
  const [exportando, setExportando] = useState(false);
  const [enviando, setEnviando]     = useState(false);

  /** Descarga el control anual en Excel con el formato del libro de RRHH. */
  const exportarControl = async () => {
    setExportando(true);
    try {
      const { data } = await api.get('/vacaciones/control-anual', { params: { anio }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VACACIONES ${anio}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('No se pudo generar el control anual');
    } finally {
      setExportando(false);
    }
  };

  const verHistorial = async (v) => {
    try {
      const { data } = await api.get(`/vacaciones/${v.id_empleado}/historial`);
      setHistorial(data);
    } catch {
      toast.error('No se pudo cargar el historial');
    }
  };

  /** Regenera los registros del año (art. 44 b) para cada empleado activo. */
  const generarAnio = async () => {
    if (!window.confirm(
      'Se generarán los registros de vacaciones del año en curso para todos los empleados activos, '
      + 'con los días que marca la Ley de Servicio Municipal según su antigüedad. '
      + 'Los días ya gozados no se modifican. ¿Continuar?')) return;
    try {
      const { data } = await api.post('/vacaciones/generar', {});
      toast.success(`${data.mensaje} ${data.nuevos} nuevo(s) de ${data.total}.`);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar');
    }
  };

  const cargar = () => api.get('/vacaciones', { params: { anio } })
    .then(r => setVacaciones(r.data)).catch(() => setVacaciones([]));

  useEffect(() => { cargar(); }, [anio]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (enviando) return;
    setEnviando(true);
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
    } finally {
      setEnviando(false);
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
        </div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button style={s.btnGenerar} onClick={exportarControl} disabled={exportando}
            title="Descarga el control anual en Excel (libro, folio, acuerdo, salida y entrada)">
            <FileSpreadsheet size={16}/> {exportando ? 'Generando...' : `Exportar control ${anio}`}
          </button>
          <button style={s.btnGenerar} onClick={generarAnio}>
            <RefreshCw size={16}/> Generar año
          </button>
        </div>
      </div>

      <div style={{ ...s.searchBox, display:'flex', gap:'.75rem', alignItems:'center' }}>
        <input style={{ ...s.searchInput, flex:1 }} placeholder="Buscar empleado..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}/>
        <select style={s.selectAnio} value={anio} onChange={e => setAnio(Number(e.target.value))}
          title="Año del periodo de vacaciones">
          {[anioActual - 2, anioActual - 1, anioActual, anioActual + 1].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
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
                  <div style={{ display:'flex', gap:'.4rem' }}>
                    <button style={s.btnEdit} onClick={() => abrirEditar(v)} title="Ajustar saldo manualmente">
                      <Pencil size={15}/>
                    </button>
                    <button style={s.btnHist} onClick={() => verHistorial(v)} title="Ver historial de vacaciones">
                      <History size={15}/>
                    </button>
                  </div>
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
                <button type="submit" style={{ ...s.btnGuardar, opacity: enviando ? 0.7 : 1 }} disabled={enviando}>
                  {enviando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historial && (
        <div style={s.overlay} onClick={() => setHistorial(null)}>
          <div style={{ ...s.modal, maxWidth:'720px' }} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Historial de vacaciones</h2>
            <p style={s.histMeta}>
              {historial.empleado.empleado} · {historial.empleado.codigo_empleado} ·
              ingreso {fechaCorta(historial.empleado.fecha_ingreso)}<br/>
              {historial.total_periodos} período(s) gozado(s), {historial.total_dias_gozados} día(s) hábiles.
            </p>

            {historial.historial.length === 0 ? (
              <p style={{ color:'#94a3b8' }}>Sin períodos registrados.</p>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={s.tbl}>
                  <thead>
                    <tr>{['Año','Desde','Hasta','Hábiles','Descontados','Estado','Revisado por'].map(h => (
                      <th key={h} style={s.th}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {historial.historial.map(h => (
                      <tr key={h.id_solicitud}>
                        <td style={s.td}>{h.anio}</td>
                        <td style={s.td}>{fechaCorta(h.fecha_inicio)}</td>
                        <td style={s.td}>{fechaCorta(h.fecha_fin)}</td>
                        <td style={s.td}>{h.dias_habiles ?? '—'}</td>
                        <td style={s.td}><strong>{h.dias_descontados || 0}</strong></td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background:
                            h.estado === 'Aprobada' ? '#22c55e'
                            : h.estado === 'Rechazada' ? '#ef4444'
                            : h.estado === 'Cancelada' ? '#94a3b8' : '#f59e0b' }}>
                            {h.estado}
                          </span>
                        </td>
                        <td style={{ ...s.td, color:'#64748b' }}>{h.revisado_por || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button style={s.btnCancelar} onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  selectAnio: { border:'1.5px solid #e2e8f0', borderRadius:'8px', padding:'.4rem .6rem', fontSize:'.9rem', background:'#fff' },
  searchBox:  { background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:'10px', padding:'.65rem 1rem', marginBottom:'1rem' },
  searchInput:{ border:'none', outline:'none', width:'100%', fontSize:'.95rem' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'820px' },
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
  btnHist:    { background:'#f1f5f9', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#475569', cursor:'pointer' },
  btnGenerar: { display:'flex', alignItems:'center', gap:'.4rem', padding:'.6rem 1rem', border:'1.5px solid #e2e8f0',
                borderRadius:'8px', background:'#fff', color:'#334155', fontWeight:600, cursor:'pointer' },
  histMeta:   { fontSize:'.85rem', color:'#64748b', marginBottom:'1rem' },
};
