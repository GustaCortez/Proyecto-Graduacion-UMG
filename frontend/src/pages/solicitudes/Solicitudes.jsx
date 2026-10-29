import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import { FilePlus, CheckCircle, XCircle, Paperclip, Download, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { fechaCorta } from '../../utils/fechas';

export default function Solicitudes() {
  const { usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [tipos, setTipos]             = useState([]);
  const [empleados, setEmpleados]     = useState([]);    
  const [modal, setModal]             = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('Pendiente');
  /**
   * Id que llega al pulsar una notificación. El filtro arranca en "Pendiente",
   * así que una solicitud ya resuelta quedaría fuera de la lista justo después
   * de que el aviso prometiera llevar hasta ella.
   */
  const destacada = useLocation().state?.destacar ?? null;
  const [form, setForm]               = useState({
    id_empleado:'', id_tipo:'', fecha_inicio:'', fecha_fin:'', motivo:''
  });
  const [resolucion, setResolucion]   = useState(null); // { sol, estado, comentario }
  const [documentos, setDocumentos]   = useState(null); // { sol, lista }
  const [acta, setActa]               = useState(null); // { sol, libro, folio, numero_acuerdo }
  const [guardando, setGuardando]     = useState(false);
  const [enviando, setEnviando]       = useState(false);

  const cargar = () =>
    api.get('/solicitudes')
      .then(r => setSolicitudes(r.data))
      .catch(() => { setSolicitudes([]); toast.error('No se pudieron cargar las solicitudes'); });

  useEffect(() => {
    cargar();
    api.get('/solicitudes/tipos')
      .then(r => setTipos(r.data))
      .catch(() => { setTipos([]); toast.error('No se pudieron cargar los tipos de solicitud'); });
    api.get('/empleados')
      .then(r => setEmpleados(r.data))
      .catch(() => { setEmpleados([]); toast.error('No se pudieron cargar los empleados'); });
  }, []);

  /**
   * Los trámites de documento (constancias, carnet) no son ausencias: el
   * trabajador sigue asistiendo, así que llevan una sola fecha y cero días.
   */
  const tipoElegido = tipos.find(t => String(t.id) === String(form.id_tipo));
  const esAusencia = tipoElegido ? tipoElegido.es_ausencia !== false : true;

  /**
   * Cambiar el tipo empieza una solicitud distinta: se limpian fechas y motivo,
   * porque pertenecen al trámite anterior. El empleado elegido SI se conserva:
   * es lo primero que selecciona RRHH y no depende del tipo.
   */
  const handleChange = e => {
    const { name, value } = e.target;

    if (name === 'id_tipo') {
      if (String(value) === String(form.id_tipo)) return;  // misma opción: nada que limpiar
      setForm({ id_empleado: form.id_empleado, id_tipo: value,
                fecha_inicio: '', fecha_fin: '', motivo: '' });
      return;
    }

    setForm({ ...form, [name]: value });
  };

  /**
   * Cerrar debe dejar el formulario vacío: al reabrirlo no deben quedar los
   * datos de la solicitud anterior.
   */
  const cerrarModal = () => {
    setModal(false);
    setForm({ id_empleado: '', id_tipo: '', fecha_inicio: '', fecha_fin: '', motivo: '' });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await api.post('/solicitudes', form);
      toast.success('Solicitud creada exitosamente');
      cerrarModal();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear solicitud');
    } finally {
      setEnviando(false);
    }
  };

  const resolver = (sol, estado) =>
    setResolucion({ sol, estado, comentario: '', libro: '', folio: '', numero_acuerdo: '' });
  const esVacaciones = (sol) => /vacaciones/i.test(sol?.tipo_solicitud || '');

  /** Corrige libro, folio y acuerdo de una vacacion ya aprobada. */
  const abrirActa = (sol) =>
    setActa({ sol, libro: sol.libro || '', folio: sol.folio || '', numero_acuerdo: sol.numero_acuerdo || '' });

  const guardarActa = async () => {
    const { sol, libro, folio, numero_acuerdo } = acta;
    setGuardando(true);
    try {
      const { data } = await api.patch(`/solicitudes/${sol.id}/acta`, {
        libro: libro.trim() || null, folio: folio.trim() || null, numero_acuerdo: numero_acuerdo.trim() || null,
      });
      toast.success(`${data.mensaje} Acuerdo No. ${data.solicitud.numero_acuerdo}.`);
      setActa(null);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el acta');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarResolucion = async () => {
    const { sol, estado, comentario, libro, folio, numero_acuerdo } = resolucion;
    setGuardando(true);
    try {
      const cuerpo = { estado, comentario_rrhh: comentario.trim() || null };
      if (estado === 'Aprobada' && esVacaciones(sol)) {
        Object.assign(cuerpo, {
          libro: libro.trim() || null,
          folio: folio.trim() || null,
          numero_acuerdo: numero_acuerdo.trim() || null,
        });
      }
      const { data } = await api.patch(`/solicitudes/${sol.id}/estado`, cuerpo);
      toast.success([data.mensaje, data.saldo, data.acuerdo && `${data.acuerdo}.`].filter(Boolean).join(' '),
        { duration: data.acuerdo ? 7000 : 4000 });
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

  useEffect(() => {
    if (destacada) setFiltroEstado('Todas');
  }, [destacada]);

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
              <tr key={sol.id}
                style={sol.id === destacada ? s.filaDestacada : undefined}>
                <td style={s.td}>{sol.id}</td>
                <td style={s.td}>{sol.empleado}</td>
                <td style={s.td}>{sol.tipo_solicitud}</td>
                <td style={s.td}>{fechaCorta(sol.fecha_inicio)}</td>
                <td style={s.td}>{fechaCorta(sol.fecha_fin)}</td>
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
                  {sol.numero_acuerdo && (
                    <div style={s.acuerdo} title={`Libro ${sol.libro || '—'} · Folio ${sol.folio || '—'}`}>
                      Acuerdo {sol.numero_acuerdo}
                    </div>
                  )}
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
                  {esRRHH && sol.estado === 'Aprobada' && esVacaciones(sol) && (
                    <button style={s.btnActa} onClick={() => abrirActa(sol)}
                      title="Libro, folio y número de acuerdo">
                      <BookOpen size={16}/>
                    </button>
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
              {esAusencia ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'1rem' }}>
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
                </>
              ) : (
                <>
                  <div style={s.campo}>
                    <label style={s.label}>Fecha de solicitud</label>
                    <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required style={s.input}/>
                  </div>
                  <p style={s.pista}>
                    Este trámite no descuenta días: es un documento que extiende Recursos Humanos.
                  </p>
                </>
              )}
              <div style={s.campo}>
                <label style={s.label}>Motivo</label>
                <textarea name="motivo" value={form.motivo} onChange={handleChange} required rows={3}
                  style={{ ...s.input, resize:'vertical' }} placeholder="Describe el motivo de la solicitud..."/>
              </div>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={cerrarModal}>Cancelar</button>
                <button type="submit" style={{ ...s.btnGuardar, opacity: enviando ? 0.7 : 1 }} disabled={enviando}>
                  {enviando ? 'Guardando...' : 'Crear solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolucion && (
        <div style={s.overlay} onClick={() => setResolucion(null)}>
          <div style={{ ...s.modal, maxWidth:'440px' }} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>
              {resolucion.estado === 'Aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
            </h2>
            <p style={s.resumen}>
              <strong>{resolucion.sol.empleado}</strong> · {resolucion.sol.tipo_solicitud}<br/>
              {fechaCorta(resolucion.sol.fecha_inicio)}
              {resolucion.sol.fecha_fin && ` al ${fechaCorta(resolucion.sol.fecha_fin)}`}
              {/* Sin fecha fin es un tramite de documento: no tiene dias que mostrar. */}
              {resolucion.sol.fecha_fin &&
                ` · ${resolucion.sol.dias_habiles ?? resolucion.sol.dias_solicitados ?? '—'} día(s) hábiles`}
            </p>
            <p style={s.motivo}>"{resolucion.sol.motivo}"</p>

            {resolucion.estado === 'Aprobada' && esVacaciones(resolucion.sol) && (
              <>
                <p style={s.avisoSaldo}>
                  Al aprobar se descontarán los días hábiles del saldo de vacaciones del empleado.
                </p>
                <div style={s.filaActa}>
                  <div style={s.campo}>
                    <label style={s.label}>Libro</label>
                    <input style={s.input} maxLength={10} value={resolucion.libro}
                      onChange={e => setResolucion({ ...resolucion, libro: e.target.value })}/>
                  </div>
                  <div style={s.campo}>
                    <label style={s.label}>Folio</label>
                    <input style={s.input} maxLength={10} value={resolucion.folio}
                      onChange={e => setResolucion({ ...resolucion, folio: e.target.value })}/>
                  </div>
                  <div style={{ ...s.campo, flex: 1.4 }}>
                    <label style={s.label}>No. de acuerdo</label>
                    <input style={s.input} maxLength={20} value={resolucion.numero_acuerdo}
                      placeholder="Automático (01-2026)"
                      onChange={e => setResolucion({ ...resolucion, numero_acuerdo: e.target.value })}/>
                  </div>
                </div>
                <p style={s.ayudaActa}>
                  Datos del acta municipal que autoriza las vacaciones. Si deja el acuerdo vacío,
                  el sistema asigna el siguiente correlativo del año.
                </p>
              </>
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

      {acta && (
        <div style={s.overlay} onClick={() => setActa(null)}>
          <div style={{ ...s.modal, maxWidth:'440px' }} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Acta de vacaciones</h2>
            <p style={s.resumen}>
              <strong>{acta.sol.empleado}</strong><br/>
              {fechaCorta(acta.sol.fecha_inicio)}
              {acta.sol.fecha_fin && ` al ${fechaCorta(acta.sol.fecha_fin)}`}
            </p>
            <div style={s.filaActa}>
              <div style={s.campo}>
                <label style={s.label}>Libro</label>
                <input style={s.input} maxLength={10} value={acta.libro}
                  onChange={e => setActa({ ...acta, libro: e.target.value })}/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Folio</label>
                <input style={s.input} maxLength={10} value={acta.folio}
                  onChange={e => setActa({ ...acta, folio: e.target.value })}/>
              </div>
              <div style={{ ...s.campo, flex: 1.4 }}>
                <label style={s.label}>No. de acuerdo</label>
                <input style={s.input} maxLength={20} value={acta.numero_acuerdo}
                  placeholder="Automático si queda vacío"
                  onChange={e => setActa({ ...acta, numero_acuerdo: e.target.value })}/>
              </div>
            </div>
            <p style={s.ayudaActa}>Los cambios quedan registrados en la auditoría.</p>
            <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button style={s.btnCancelar} onClick={() => setActa(null)}>Cancelar</button>
              <button disabled={guardando} onClick={guardarActa}
                style={{ ...s.btnGuardar, opacity: guardando ? .6 : 1 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'900px' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  badge:      { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:500 },
  filaDestacada: { background:'#fffbeb', boxShadow:'inset 3px 0 0 #f59e0b' },
  btnAprobar: { background:'#dcfce7', border:'none', borderRadius:'6px', padding:'4px', display:'flex', color:'#16a34a' },
  btnActa:    { background:'#eef2ff', border:'none', borderRadius:'6px', padding:'4px', display:'flex', color:'#4338ca', cursor:'pointer' },
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
  filaActa:   { display:'flex', gap:'.75rem', marginBottom:'.5rem' },
  ayudaActa:  { fontSize:'.75rem', color:'#64748b', margin:'0 0 1rem' },
  acuerdo:    { fontSize:'.72rem', color:'#475569', marginTop:'.25rem', whiteSpace:'nowrap' },
  avisoSaldo: { fontSize:'.8rem', color:'#0f766e', background:'#f0fdfa', border:'1.5px solid #99f6e4',
                borderRadius:'8px', padding:'.6rem .8rem', marginBottom:'1rem' },
  docFila:    { display:'flex', alignItems:'center', gap:'.6rem', padding:'.6rem 0',
                borderBottom:'1px solid #f1f5f9' },
  docNombre:  { fontSize:'.85rem', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis',
                whiteSpace:'nowrap' },
  docMeta:    { fontSize:'.72rem', color:'#94a3b8' },
  pista:      { fontSize:'.78rem', color:'#94a3b8', lineHeight:1.4 },
};