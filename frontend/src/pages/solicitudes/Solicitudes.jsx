import { useEffect, useState } from 'react';
import api from '../../services/api';
import { FilePlus, CheckCircle, XCircle, Paperclip, Download } from 'lucide-react';
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
    id_empleado:'', id_tipo:'', fecha_inicio:'', fecha_fin:'', motivo:''
  });
  const [resolucion, setResolucion]   = useState(null); // { sol, estado, comentario }
  const [documentos, setDocumentos]   = useState(null); // { sol, lista }
  const [guardando, setGuardando]     = useState(false);

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

  /** Abre el cuadro de resolución para que RRHH deje un comentario razonado. */
  const resolver = (sol, estado) => setResolucion({ sol, estado, comentario: '' });

  const confirmarResolucion = async () => {
    const { sol, estado, comentario } = resolucion;
    setGuardando(true);
    try {
      const { data } = await api.patch(`/solicitudes/${sol.id}/estado`, {
        estado, comentario_rrhh: comentario.trim() || null,
      });
      // Si eran vacaciones, el backend informa cuántos días se movieron del saldo.
      toast.success(data.saldo ? `${data.mensaje} ${data.saldo}` : data.mensaje);
      setResolucion(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar estado');
    } finally {
      setGuardando(false);
    }
  };

  const verDocumentos = async (sol) => {
    try {
      const { data } = await api.get(`/solicitudes/${sol.id}/documentos`);
      setDocumentos({ sol, lista: data });
    } catch {
      toast.error('No se pudieron cargar los documentos');
    }
  };

  const abrirDocumento = async (sol, doc) => {
    try {
      const { data } = await api.get(`/solicitudes/${sol.id}/documentos/${doc.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('No se pudo abrir el documento');
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
              {['#','Empleado','Tipo','Desde','Hasta','Días hábiles','Estado','Adjuntos','Acciones'].map(h => (
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
                <td style={s.td}>{sol.fecha_fin ? new Date(sol.fecha_fin).toLocaleDateString('es-GT') : '—'}</td>
                <td style={s.td}>
                  {sol.dias_habiles ?? sol.dias_solicitados ?? '—'}
                  {sol.dias_descontados > 0 && (
                    <span style={s.descontado} title="Descontados del saldo de vacaciones">
                      −{sol.dias_descontados}
                    </span>
                  )}
                </td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                </td>
                <td style={s.td}>
                  <button style={s.btnClip} onClick={() => verDocumentos(sol)}
                    title="Ver documentos de respaldo">
                    <Paperclip size={14}/> {sol.adjuntos ?? 0}
                  </button>
                </td>
                <td style={s.td}>
                  {esRRHH && ['Pendiente','En revision'].includes(sol.estado) && (
                    <div style={{ display:'flex', gap:'.5rem' }}>
                      <button style={s.btnAprobar} onClick={() => resolver(sol, 'Aprobada')} title="Aprobar">
                        <CheckCircle size={16}/>
                      </button>
                      <button style={s.btnRechazar} onClick={() => resolver(sol, 'Rechazada')} title="Rechazar">
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
              <p style={s.pista}>
                Los días hábiles se calculan automáticamente a partir del rango de fechas,
                descontando fines de semana y asuetos.
              </p>
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

      {/* Resolución: aprobar o rechazar con comentario */}
      {resolucion && (
        <div style={s.overlay} onClick={() => setResolucion(null)}>
          <div style={{ ...s.modal, maxWidth:'440px' }} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>
              {resolucion.estado === 'Aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
            </h2>
            <p style={s.resumen}>
              <strong>{resolucion.sol.empleado}</strong> · {resolucion.sol.tipo_solicitud}<br/>
              {new Date(resolucion.sol.fecha_inicio).toLocaleDateString('es-GT')}
              {resolucion.sol.fecha_fin && ` al ${new Date(resolucion.sol.fecha_fin).toLocaleDateString('es-GT')}`}
              {' · '}{resolucion.sol.dias_habiles ?? resolucion.sol.dias_solicitados ?? '—'} día(s) hábiles
            </p>
            <p style={s.motivo}>"{resolucion.sol.motivo}"</p>

            {resolucion.estado === 'Aprobada' && /vacaciones/i.test(resolucion.sol.tipo_solicitud || '') && (
              <p style={s.avisoSaldo}>
                Al aprobar se descontarán los días hábiles del saldo de vacaciones del empleado.
              </p>
            )}

            <div style={s.campo}>
              <label style={s.label}>Comentario para el empleado (opcional)</label>
              <textarea rows={3} style={{ ...s.input, resize:'vertical' }}
                value={resolucion.comentario}
                onChange={e => setResolucion({ ...resolucion, comentario: e.target.value })}
                placeholder="El empleado verá este comentario en su notificación..."/>
            </div>

            <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button style={s.btnCancelar} onClick={() => setResolucion(null)}>Cancelar</button>
              <button disabled={guardando} onClick={confirmarResolucion}
                style={{ ...s.btnGuardar, opacity: guardando ? .6 : 1,
                  background: resolucion.estado === 'Aprobada' ? '#16a34a' : '#dc2626' }}>
                {guardando ? 'Guardando...' : resolucion.estado === 'Aprobada' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documentos de respaldo */}
      {documentos && (
        <div style={s.overlay} onClick={() => setDocumentos(null)}>
          <div style={{ ...s.modal, maxWidth:'440px' }} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Documentos · Solicitud #{documentos.sol.id}</h2>
            <p style={s.resumen}>{documentos.sol.empleado} · {documentos.sol.tipo_solicitud}</p>

            {documentos.lista.length === 0 ? (
              <p style={{ color:'#94a3b8', fontSize:'.88rem' }}>
                El empleado no adjuntó ningún documento.
              </p>
            ) : documentos.lista.map(d => (
              <div key={d.id} style={s.docFila}>
                <Paperclip size={15} color="#64748b" style={{ flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={s.docNombre}>{d.nombre_archivo}</p>
                  <span style={s.docMeta}>{Math.round(d.tamano_bytes / 1024)} KB</span>
                </div>
                <button style={s.btnIcono} onClick={() => abrirDocumento(documentos.sol, d)} title="Abrir">
                  <Download size={14}/>
                </button>
              </div>
            ))}

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button style={s.btnCancelar} onClick={() => setDocumentos(null)}>Cerrar</button>
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
  btnGuardar: { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
  descontado: { marginLeft:'.4rem', fontSize:'.72rem', color:'#0f766e', background:'#ccfbf1',
                padding:'.1rem .4rem', borderRadius:'4px', fontWeight:700 },
  btnClip:    { display:'flex', alignItems:'center', gap:'.25rem', background:'#f1f5f9', border:'none',
                borderRadius:'6px', padding:'.3rem .55rem', color:'#475569', fontSize:'.8rem',
                fontWeight:600, cursor:'pointer' },
  btnIcono:   { background:'#e0f2fe', border:'none', borderRadius:'6px', padding:'5px', display:'flex',
                color:'#0369a1', cursor:'pointer', flexShrink:0 },
  resumen:    { fontSize:'.85rem', color:'#64748b', marginBottom:'.75rem', lineHeight:1.5 },
  motivo:     { fontSize:'.85rem', color:'#334155', fontStyle:'italic', background:'#f8fafc',
                padding:'.6rem .8rem', borderRadius:'8px', marginBottom:'1rem' },
  avisoSaldo: { fontSize:'.8rem', color:'#0f766e', background:'#f0fdfa', border:'1.5px solid #99f6e4',
                borderRadius:'8px', padding:'.6rem .8rem', marginBottom:'1rem' },
  docFila:    { display:'flex', alignItems:'center', gap:'.6rem', padding:'.6rem 0',
                borderBottom:'1px solid #f1f5f9' },
  docNombre:  { fontSize:'.85rem', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis',
                whiteSpace:'nowrap' },
  docMeta:    { fontSize:'.72rem', color:'#94a3b8' },
  pista:      { fontSize:'.78rem', color:'#94a3b8', lineHeight:1.4 },
};