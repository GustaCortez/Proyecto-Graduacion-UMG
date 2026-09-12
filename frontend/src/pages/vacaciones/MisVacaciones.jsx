import { useEffect, useState } from 'react';
import api from '../../services/api';
import { AlertCircle } from 'lucide-react';

/**
 * Vista del empleado sobre sus propias vacaciones: saldo del año, historial
 * de períodos gozados y la base legal del cálculo.
 */
export default function MisVacaciones() {
  const [saldo, setSaldo]         = useState(null);
  const [historial, setHistorial] = useState(null);
  const [anios, setAnios]         = useState([]);
  const [error, setError]         = useState(null);
  const [cargando, setCargando]   = useState(true);

  useEffect(() => {
    api.get('/vacaciones/mi-saldo')
      .then(async (r) => {
        setSaldo(r.data);
        const [hist, todos] = await Promise.all([
          api.get(`/vacaciones/${r.data.id_empleado}/historial`),
          api.get(`/vacaciones/${r.data.id_empleado}`),
        ]);
        setHistorial(hist.data);
        setAnios(todos.data);
      })
      .catch((e) => setError(e.response?.data?.error || 'No se pudo cargar la información.'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <p style={s.cargando}>Cargando vacaciones...</p>;
  if (error)    return <div style={s.aviso}><AlertCircle size={18} /> {error}</div>;

  const colorEstado = (e) => ({
    Aprobada: '#22c55e', Rechazada: '#ef4444', Cancelada: '#94a3b8',
    Pendiente: '#f59e0b', 'En revision': '#3b82f6',
  }[e] || '#64748b');

  const sinDerecho = saldo.dias_asignados === 0;

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Mis Vacaciones</h1>
          <p style={s.sub}>Saldo y períodos gozados — {saldo.anio}</p>
        </div>
      </div>

      {/* Tarjetas de saldo */}
      <div style={s.tarjetas}>
        <div style={{ ...s.tarjeta, borderTop: '3px solid #0d9488' }}>
          <span style={s.tarjetaNum}>{saldo.dias_asignados}</span>
          <span style={s.tarjetaTxt}>Días asignados</span>
        </div>
        <div style={{ ...s.tarjeta, borderTop: '3px solid #f59e0b' }}>
          <span style={{ ...s.tarjetaNum, color: '#b45309' }}>{saldo.dias_tomados}</span>
          <span style={s.tarjetaTxt}>Días gozados</span>
        </div>
        <div style={{ ...s.tarjeta, borderTop: '3px solid #1e3a5f' }}>
          <span style={{ ...s.tarjetaNum, color: saldo.saldo > 0 ? '#1e3a5f' : '#ef4444' }}>
            {saldo.saldo}
          </span>
          <span style={s.tarjetaTxt}>Saldo disponible</span>
        </div>
      </div>

      {/* Explicación legal del cálculo */}
      <div style={{ ...s.legal, background: sinDerecho ? '#fef3c7' : '#f0fdfa',
                    borderColor: sinDerecho ? '#fcd34d' : '#99f6e4' }}>
        <AlertCircle size={16} color={sinDerecho ? '#b45309' : '#0d9488'} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={s.legalTxt}>{saldo.explicacion}</p>
          {saldo.derecho_desde && !saldo.derecho_vigente && (
            <p style={s.legalNota}>
              Podrá tomarlas a partir del {saldo.derecho_desde}.
            </p>
          )}
        </div>
      </div>

      {/* Historial de períodos */}
      <h2 style={s.subtitulo}>Historial de vacaciones</h2>
      {historial?.historial?.length === 0 ? (
        <p style={s.vacio}>Todavía no tiene períodos de vacaciones registrados.</p>
      ) : (
        <div style={s.tabla}>
          <table style={s.tbl}>
            <thead>
              <tr>
                {['Año', 'Desde', 'Hasta', 'Días hábiles', 'Descontados', 'Estado', 'Revisado por'].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.historial.map((h) => (
                <tr key={h.id_solicitud}>
                  <td style={s.td}>{h.anio}</td>
                  <td style={s.td}>{h.fecha_inicio}</td>
                  <td style={s.td}>{h.fecha_fin}</td>
                  <td style={s.td}>{h.dias_habiles ?? '—'}</td>
                  <td style={s.td}><strong>{h.dias_descontados || 0}</strong></td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: colorEstado(h.estado) }}>{h.estado}</span>
                  </td>
                  <td style={{ ...s.td, color: '#64748b' }}>{h.revisado_por || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historial && (
        <p style={s.resumen}>
          {historial.total_periodos} período(s) gozado(s), {historial.total_dias_gozados} día(s) hábiles en total.
        </p>
      )}

      {/* Saldos por año */}
      {anios.length > 1 && (
        <>
          <h2 style={s.subtitulo}>Saldos por año</h2>
          <div style={s.tabla}>
            <table style={s.tbl}>
              <thead>
                <tr>{['Año', 'Asignados', 'Usados', 'Saldo'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {anios.map((a) => (
                  <tr key={a.id}>
                    <td style={s.td}>{a.anio}</td>
                    <td style={s.td}>{a.dias_disponibles}</td>
                    <td style={s.td}>{a.dias_usados}</td>
                    <td style={s.td}><strong>{a.saldo}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={s.nota}>
            Las vacaciones no son acumulables de año en año. {saldo.base_legal}
          </p>
        </>
      )}
    </div>
  );
}

const s = {
  cargando:   { color:'#64748b' },
  header:     { marginBottom:'1.5rem' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b' },
  subtitulo:  { fontSize:'1.05rem', fontWeight:700, color:'#1e3a5f', margin:'1.75rem 0 .75rem' },
  tarjetas:   { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'1rem' },
  tarjeta:    { background:'#fff', borderRadius:'12px', padding:'1.25rem', display:'flex',
                flexDirection:'column', gap:'.35rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tarjetaNum: { fontSize:'2rem', fontWeight:700, color:'#1e3a5f', lineHeight:1 },
  tarjetaTxt: { fontSize:'.85rem', color:'#334155', fontWeight:700 },
  legal:      { display:'flex', gap:'.6rem', border:'1.5px solid', borderRadius:'10px',
                padding:'.85rem 1rem', marginTop:'1rem' },
  legalTxt:   { fontSize:'.85rem', color:'#334155', lineHeight:1.5 },
  legalNota:  { fontSize:'.8rem', color:'#b45309', marginTop:'.35rem', fontWeight:600 },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'640px' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b',
                background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600, whiteSpace:'nowrap' },
  td:         { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' },
  badge:      { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:600 },
  vacio:      { color:'#94a3b8', background:'#fff', padding:'1.5rem', borderRadius:'12px', textAlign:'center' },
  resumen:    { fontSize:'.85rem', color:'#64748b', marginTop:'.75rem' },
  nota:       { fontSize:'.78rem', color:'#94a3b8', marginTop:'.6rem', fontStyle:'italic' },
  aviso:      { display:'flex', alignItems:'center', gap:'.5rem', background:'#fef2f2', border:'1.5px solid #fecaca',
                color:'#b91c1c', padding:'1rem', borderRadius:'10px' },
};
