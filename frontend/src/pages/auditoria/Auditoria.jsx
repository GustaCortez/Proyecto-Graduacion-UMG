import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { ShieldCheck, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

/**
 * Rastro de auditoría: qué hizo cada usuario, cuándo, sobre qué registro y
 * desde qué IP. Es la evidencia que respalda las operaciones sensibles,
 * especialmente las de nómina y las aprobaciones de solicitudes.
 */
const COLOR_ACCION = {
  LOGIN: '#22c55e', LOGOUT: '#94a3b8', LOGIN_FALLIDO: '#ef4444',
  TOKEN_RENOVADO: '#3b82f6', TOKEN_REUSADO: '#dc2626',
  CREAR: '#0d9488', ACTUALIZAR: '#f59e0b', ELIMINAR: '#ef4444',
  APROBAR: '#16a34a', RECHAZAR: '#f97316', CANCELAR: '#94a3b8',
  BAJA_EMPLEADO: '#b91c1c', RESET_PASSWORD: '#7c3aed',
  CAMBIO_ESTADO: '#6366f1', AJUSTE_VACACIONES: '#0891b2',
  NOMINA_CREADA: '#065f46', SUBIR_DOCUMENTO: '#0369a1',
};

const LIMITE = 25;

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal]         = useState(0);
  const [pagina, setPagina]       = useState(1);
  const [acciones, setAcciones]   = useState([]);
  const [filtros, setFiltros]     = useState({ accion: '', tabla: '', desde: '', hasta: '' });
  const [cargando, setCargando]   = useState(true);
  const [detalle, setDetalle]     = useState(null);

  useEffect(() => {
    api.get('/auditoria/acciones').then((r) => setAcciones(r.data)).catch(() => setAcciones([]));
  }, []);

  const cargar = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams({ pagina, limite: LIMITE });
    Object.entries(filtros).forEach(([k, v]) => { if (v) params.append(k, v); });

    api.get(`/auditoria?${params}`)
      .then((r) => { setRegistros(r.data.registros); setTotal(r.data.total); })
      .catch(() => { setRegistros([]); setTotal(0); })
      .finally(() => setCargando(false));
  }, [pagina, filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarFiltro = (campo, valor) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: valor }));
  };

  const paginas = Math.max(1, Math.ceil(total / LIMITE));
  const fecha = (f) => new Date(f).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}><ShieldCheck size={22} style={{ verticalAlign: '-4px' }} /> Auditoría</h1>
          <p style={s.sub}>Registro de acciones realizadas en el sistema</p>
        </div>
        <span style={s.total}>{total} registro(s)</span>
      </div>

      <div style={s.filtros}>
        <select style={s.select} value={filtros.accion} onChange={(e) => cambiarFiltro('accion', e.target.value)}>
          <option value="">Todas las acciones</option>
          {acciones.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={s.select} value={filtros.tabla} onChange={(e) => cambiarFiltro('tabla', e.target.value)}>
          <option value="">Todas las tablas</option>
          {['usuarios','empleados','solicitudes','vacaciones','notas_pago','documentos_adjuntos',
            'dias_feriados','refresh_tokens'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={s.label}>Desde</label>
        <input style={s.select} type="date" value={filtros.desde}
          onChange={(e) => cambiarFiltro('desde', e.target.value)} />
        <label style={s.label}>Hasta</label>
        <input style={s.select} type="date" value={filtros.hasta}
          onChange={(e) => cambiarFiltro('hasta', e.target.value)} />
      </div>

      {cargando ? <p style={s.cargando}>Cargando...</p> : (
        <div style={s.tabla}>
          <table style={s.tbl}>
            <thead>
              <tr>{['Fecha','Responsable','Rol','Acción','Tabla','Registro','IP',''].map((h) => (
                <th key={h} style={s.th}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {registros.length === 0 && (
                <tr><td style={s.td} colSpan={8}>No hay registros que coincidan con el filtro.</td></tr>
              )}
              {registros.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#64748b' }}>{fecha(r.creado_en)}</td>
                  <td style={s.td}>{r.responsable || '—'}</td>
                  <td style={{ ...s.td, color: '#64748b' }}>{r.rol || '—'}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: COLOR_ACCION[r.accion] || '#64748b' }}>
                      {r.accion}
                    </span>
                  </td>
                  <td style={{ ...s.td, color: '#64748b' }}>{r.tabla || '—'}</td>
                  <td style={s.td}>{r.registro_id ?? '—'}</td>
                  <td style={{ ...s.td, color: '#94a3b8', fontSize: '.8rem' }}>{r.ip || '—'}</td>
                  <td style={s.td}>
                    {r.detalle && (
                      <button style={s.btnIcono} onClick={() => setDetalle(r)} title="Ver detalle">
                        <Eye size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={s.paginador}>
        <button style={s.btnPag} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          <ChevronLeft size={16} /> Anterior
        </button>
        <span style={s.pagTxt}>Página {pagina} de {paginas}</span>
        <button style={s.btnPag} disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
          Siguiente <ChevronRight size={16} />
        </button>
      </div>

      {detalle && (
        <div style={s.overlay} onClick={() => setDetalle(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={s.modalTitle}>{detalle.accion}</h2>
            <p style={s.modalSub}>
              {detalle.responsable} ({detalle.rol}) · {fecha(detalle.creado_en)} · IP {detalle.ip || '—'}
            </p>
            <pre style={s.pre}>{JSON.stringify(detalle.detalle, null, 2)}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={s.btnCerrar} onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
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
  total:      { fontSize:'.85rem', color:'#64748b' },
  filtros:    { display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'1rem', flexWrap:'wrap' },
  label:      { fontSize:'.8rem', fontWeight:600, color:'#374151' },
  select:     { padding:'.5rem .7rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                fontSize:'.85rem', outline:'none', background:'#fff' },
  cargando:   { color:'#64748b' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'860px' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b',
                background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600, whiteSpace:'nowrap' },
  td:         { padding:'.65rem 1rem', fontSize:'.88rem', borderBottom:'1px solid #f1f5f9' },
  badge:      { padding:'.2rem .6rem', borderRadius:'99px', fontSize:'.7rem', color:'#fff',
                fontWeight:700, whiteSpace:'nowrap' },
  btnIcono:   { background:'#e0f2fe', border:'none', borderRadius:'6px', padding:'5px',
                display:'flex', color:'#0369a1', cursor:'pointer' },
  paginador:  { display:'flex', alignItems:'center', justifyContent:'center', gap:'1rem', marginTop:'1rem' },
  btnPag:     { display:'flex', alignItems:'center', gap:'.25rem', padding:'.5rem .9rem',
                border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff',
                color:'#334155', fontWeight:600, cursor:'pointer' },
  pagTxt:     { fontSize:'.85rem', color:'#64748b' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex',
                alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'1.75rem', width:'100%',
                maxWidth:'560px', maxHeight:'85vh', overflowY:'auto' },
  modalTitle: { fontSize:'1.2rem', fontWeight:700, color:'#1e3a5f' },
  modalSub:   { fontSize:'.82rem', color:'#64748b', margin:'.35rem 0 1rem' },
  pre:        { background:'#0f172a', color:'#e2e8f0', padding:'1rem', borderRadius:'10px',
                fontSize:'.78rem', overflowX:'auto', lineHeight:1.5 },
  btnCerrar:  { padding:'.6rem 1.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
};
