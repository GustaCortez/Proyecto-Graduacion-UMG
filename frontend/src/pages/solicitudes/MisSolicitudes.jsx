import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { FilePlus, Paperclip, Upload, Trash2, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const colores = { 'Pendiente': '#f59e0b', 'En revision': '#3b82f6', 'Aprobada': '#22c55e', 'Rechazada': '#ef4444', 'Cancelada': '#94a3b8' };
const ESTADOS_EDITABLES = ['Pendiente', 'En revision'];

const formVacio = { id_tipo: '', fecha_inicio: '', fecha_fin: '', motivo: '' };

const kb = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export default function MisSolicitudes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [tipos, setTipos]             = useState([]);
  const [modal, setModal]             = useState(false);
  const [form, setForm]               = useState(formVacio);
  const [saldo, setSaldo]             = useState(null);
  const [calculo, setCalculo]         = useState(null);
  const [enviando, setEnviando]       = useState(false);
  const [adjuntos, setAdjuntos]       = useState(null); // { solicitud, documentos }

  const cargar = useCallback(() =>
    api.get('/solicitudes/mias').then((r) => setSolicitudes(r.data)).catch(() => {}), []);

  useEffect(() => {
    cargar();
    api.get('/solicitudes/tipos').then((r) => setTipos(r.data)).catch(() => {});
    api.get('/vacaciones/mi-saldo').then((r) => setSaldo(r.data)).catch(() => setSaldo(null));
  }, [cargar]);

  const tipoElegido = tipos.find((t) => String(t.id) === String(form.id_tipo));
  const esVacaciones = /vacaciones/i.test(tipoElegido?.nombre || '');

  // Previsualiza los días hábiles del rango elegido, para que el empleado vea
  // exactamente cuánto le van a descontar antes de enviar.
  useEffect(() => {
    if (!form.fecha_inicio) { setCalculo(null); return; }
    const fin = form.fecha_fin || form.fecha_inicio;
    if (fin < form.fecha_inicio) { setCalculo(null); return; }

    let vigente = true;
    const t = setTimeout(() => {
      api.get(`/solicitudes/dias-habiles?fecha_inicio=${form.fecha_inicio}&fecha_fin=${fin}`)
        .then((r) => { if (vigente) setCalculo(r.data); })
        .catch(() => { if (vigente) setCalculo(null); });
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [form.fecha_inicio, form.fecha_fin]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const { data } = await api.post('/solicitudes', form);
      toast.success(`Solicitud enviada (${data.solicitud.dias_habiles} días hábiles)`);
      setModal(false);
      setForm(formVacio);
      setCalculo(null);
      cargar();
      api.get('/vacaciones/mi-saldo').then((r) => setSaldo(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear solicitud');
    } finally {
      setEnviando(false);
    }
  };

  const abrirAdjuntos = async (sol) => {
    try {
      const { data } = await api.get(`/solicitudes/${sol.id}/documentos`);
      setAdjuntos({ solicitud: sol, documentos: data });
    } catch {
      toast.error('No se pudieron cargar los documentos');
    }
  };

  const subirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const datos = new FormData();
    datos.append('documento', archivo);
    try {
      await api.post(`/solicitudes/${adjuntos.solicitud.id}/documentos`, datos);
      toast.success('Documento adjuntado');
      abrirAdjuntos(adjuntos.solicitud);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir el documento');
    } finally {
      e.target.value = '';
    }
  };

  const descargar = async (doc) => {
    try {
      const { data } = await api.get(
        `/solicitudes/${adjuntos.solicitud.id}/documentos/${doc.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('No se pudo abrir el documento');
    }
  };

  const eliminarDoc = async (doc) => {
    if (!window.confirm(`¿Eliminar "${doc.nombre_archivo}"?`)) return;
    try {
      await api.delete(`/solicitudes/${adjuntos.solicitud.id}/documentos/${doc.id}`);
      toast.success('Documento eliminado');
      abrirAdjuntos(adjuntos.solicitud);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const pendientes = solicitudes.filter((x) => x.estado === 'Pendiente').length;
  const aprobadas  = solicitudes.filter((x) => x.estado === 'Aprobada').length;
  const rechazadas = solicitudes.filter((x) => x.estado === 'Rechazada').length;

  const excedeSaldo = esVacaciones && saldo && calculo && calculo.dias_habiles > saldo.saldo;
  const sinDerecho  = esVacaciones && saldo && saldo.dias_asignados === 0;

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Mis Solicitudes</h1>
          <p style={s.sub}>Historial de trámites enviados</p>
        </div>
        <button style={s.btnAdd} onClick={() => setModal(true)}>
          <FilePlus size={18} /> Nueva Solicitud
        </button>
      </div>

      <div style={s.resumen}>
        <div style={{ ...s.stat, borderLeft: '4px solid #f59e0b' }}>
          <p style={{ ...s.statNum, color: '#92400e' }}>{pendientes}</p>
          <p style={s.statLabel}>Pendientes</p>
        </div>
        <div style={{ ...s.stat, borderLeft: '4px solid #22c55e' }}>
          <p style={{ ...s.statNum, color: '#15803d' }}>{aprobadas}</p>
          <p style={s.statLabel}>Aprobadas</p>
        </div>
        <div style={{ ...s.stat, borderLeft: '4px solid #ef4444' }}>
          <p style={{ ...s.statNum, color: '#b91c1c' }}>{rechazadas}</p>
          <p style={s.statLabel}>Rechazadas</p>
        </div>
        {saldo && (
          <div style={{ ...s.stat, borderLeft: '4px solid #0d9488' }}>
            <p style={{ ...s.statNum, color: '#0f766e' }}>{saldo.saldo}</p>
            <p style={s.statLabel}>Días de vacaciones</p>
          </div>
        )}
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['#', 'Tipo', 'Desde', 'Hasta', 'Días hábiles', 'Estado', 'Motivo', 'Comentario RRHH', 'Adjuntos'].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((sol) => (
              <tr key={sol.id}>
                <td style={s.td}>{sol.id}</td>
                <td style={s.td}>{sol.tipo_solicitud}</td>
                <td style={s.td}>{new Date(sol.fecha_inicio).toLocaleDateString('es-GT')}</td>
                <td style={s.td}>{sol.fecha_fin ? new Date(sol.fecha_fin).toLocaleDateString('es-GT') : '—'}</td>
                <td style={s.td}>
                  {sol.dias_habiles ?? sol.dias_solicitados ?? '—'}
                  {sol.dias_descontados > 0 && (
                    <span style={s.descontado} title="Días descontados del saldo de vacaciones">
                      −{sol.dias_descontados}
                    </span>
                  )}
                </td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                </td>
                <td style={{ ...s.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sol.motivo}
                </td>
                <td style={{ ...s.td, maxWidth: '180px' }}>{sol.comentario_rrhh || '—'}</td>
                <td style={s.td}>
                  <button style={s.btnClip} onClick={() => abrirAdjuntos(sol)} title="Ver o adjuntar documentos">
                    <Paperclip size={14} /> {sol.adjuntos ?? 0}
                  </button>
                </td>
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
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                {tipoElegido?.requiere_doc && (
                  <span style={s.pista}>Este trámite requiere documento de respaldo; podrá adjuntarlo al enviarlo.</span>
                )}
              </div>

              {esVacaciones && saldo && (
                <div style={{ ...s.saldoCaja, background: sinDerecho ? '#fef3c7' : '#f0fdfa',
                              borderColor: sinDerecho ? '#fcd34d' : '#99f6e4' }}>
                  <strong style={s.saldoNum}>{saldo.saldo}</strong>
                  <span style={s.saldoTxt}>
                    día(s) hábiles disponibles de {saldo.dias_asignados} asignados en {saldo.anio}.
                    {sinDerecho && ' ' + saldo.explicacion}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>Fecha inicio</label>
                  <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required style={s.input} />
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Fecha fin (opcional)</label>
                  <input name="fecha_fin" type="date" value={form.fecha_fin} onChange={handleChange}
                    min={form.fecha_inicio || undefined} style={s.input} />
                </div>
              </div>

              {calculo && (
                <div style={{ ...s.calculo, borderColor: excedeSaldo ? '#fca5a5' : '#e2e8f0',
                              background: excedeSaldo ? '#fef2f2' : '#f8fafc' }}>
                  <p style={s.calculoTitulo}>
                    {calculo.dias_calendario} día(s) de calendario ·{' '}
                    <strong>{calculo.dias_habiles} hábiles</strong>
                    {esVacaciones && saldo && !excedeSaldo && !sinDerecho &&
                      ` · saldo quedaría en ${saldo.saldo - calculo.dias_habiles}`}
                  </p>
                  {calculo.detalle.some((d) => !d.habil) && (
                    <p style={s.calculoNota}>
                      No se cuentan:{' '}
                      {calculo.detalle.filter((d) => !d.habil)
                        .map((d) => `${d.fecha} (${d.motivo})`).join(', ')}
                    </p>
                  )}
                  {excedeSaldo && (
                    <p style={s.calculoError}>
                      Excede su saldo disponible ({saldo.saldo} días). Ajuste las fechas.
                    </p>
                  )}
                </div>
              )}

              <div style={s.campo}>
                <label style={s.label}>Motivo / Descripción</label>
                <textarea name="motivo" value={form.motivo} onChange={handleChange} required rows={3} minLength={10}
                  style={{ ...s.input, resize: 'vertical' }} placeholder="Mínimo 10 caracteres..." />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" style={s.btnCancelar}
                  onClick={() => { setModal(false); setForm(formVacio); setCalculo(null); }}>
                  Cancelar
                </button>
                <button type="submit" style={{ ...s.btnGuardar, opacity: (excedeSaldo || sinDerecho || enviando) ? 0.5 : 1 }}
                  disabled={excedeSaldo || sinDerecho || enviando}>
                  {enviando ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal documentos adjuntos */}
      {adjuntos && (
        <div style={s.overlay} onClick={() => setAdjuntos(null)}>
          <div style={{ ...s.modal, maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={s.modalTitle}>
              Documentos · Solicitud #{adjuntos.solicitud.id}
            </h2>

            {adjuntos.documentos.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: '.88rem' }}>No hay documentos adjuntos.</p>
            )}

            {adjuntos.documentos.map((d) => (
              <div key={d.id} style={s.docFila}>
                <Paperclip size={15} color="#64748b" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.docNombre}>{d.nombre_archivo}</p>
                  <span style={s.docMeta}>{kb(d.tamano_bytes)}</span>
                </div>
                <button style={s.btnIcono} onClick={() => descargar(d)} title="Abrir">
                  <Download size={14} />
                </button>
                {ESTADOS_EDITABLES.includes(adjuntos.solicitud.estado) && (
                  <button style={{ ...s.btnIcono, background: '#fee2e2', color: '#dc2626' }}
                    onClick={() => eliminarDoc(d)} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            {ESTADOS_EDITABLES.includes(adjuntos.solicitud.estado) ? (
              <label style={s.btnSubir}>
                <Upload size={16} /> Adjuntar documento
                <input type="file" style={{ display: 'none' }} onChange={subirArchivo}
                  accept=".pdf,.jpg,.jpeg,.png,.webp" />
              </label>
            ) : (
              <p style={s.pista}>
                La solicitud ya fue resuelta, no se pueden modificar los documentos.
              </p>
            )}
            <p style={s.pista}>Se aceptan PDF e imágenes, hasta 10 MB.</p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button style={s.btnCancelar} onClick={() => setAdjuntos(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' },
  titulo:     { fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f' },
  sub:        { color: '#64748b' },
  btnAdd:     { display: 'flex', alignItems: 'center', gap: '.5rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '.75rem 1.25rem', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer' },
  resumen:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' },
  stat:       { background: '#fff', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  statNum:    { fontSize: '1.8rem', fontWeight: 700, margin: 0, lineHeight: 1 },
  statLabel:  { fontSize: '.85rem', color: '#334155', fontWeight: 700, margin: '6px 0 0' },
  tabla:      { background: '#fff', borderRadius: '12px', overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width: '100%', borderCollapse: 'collapse', minWidth: '900px' },
  th:         { textAlign: 'left', padding: '.75rem 1rem', fontSize: '.8rem', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' },
  td:         { padding: '.75rem 1rem', fontSize: '.9rem', borderBottom: '1px solid #f1f5f9' },
  badge:      { padding: '.25rem .75rem', borderRadius: '99px', fontSize: '.75rem', color: '#fff', fontWeight: 500 },
  descontado: { marginLeft: '.4rem', fontSize: '.72rem', color: '#0f766e', background: '#ccfbf1', padding: '.1rem .4rem', borderRadius: '4px', fontWeight: 700 },
  btnClip:    { display: 'flex', alignItems: 'center', gap: '.25rem', background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '.3rem .55rem', color: '#475569', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:      { background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '1.25rem' },
  campo:      { display: 'flex', flexDirection: 'column', gap: '.35rem' },
  label:      { fontSize: '.82rem', fontWeight: 600, color: '#374151' },
  input:      { padding: '.65rem .875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  pista:      { fontSize: '.75rem', color: '#94a3b8', marginTop: '.35rem' },
  saldoCaja:  { display: 'flex', alignItems: 'baseline', gap: '.5rem', border: '1.5px solid', borderRadius: '10px', padding: '.75rem 1rem' },
  saldoNum:   { fontSize: '1.5rem', color: '#0f766e', lineHeight: 1 },
  saldoTxt:   { fontSize: '.8rem', color: '#334155', lineHeight: 1.4 },
  calculo:    { border: '1.5px solid', borderRadius: '10px', padding: '.75rem 1rem' },
  calculoTitulo: { fontSize: '.85rem', color: '#1e293b' },
  calculoNota:{ fontSize: '.75rem', color: '#64748b', marginTop: '.35rem', lineHeight: 1.4 },
  calculoError:{ fontSize: '.8rem', color: '#b91c1c', marginTop: '.35rem', fontWeight: 600 },
  docFila:    { display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem 0', borderBottom: '1px solid #f1f5f9' },
  docNombre:  { fontSize: '.85rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docMeta:    { fontSize: '.72rem', color: '#94a3b8' },
  btnIcono:   { background: '#e0f2fe', border: 'none', borderRadius: '6px', padding: '5px', display: 'flex', color: '#0369a1', cursor: 'pointer', flexShrink: 0 },
  btnSubir:   { display: 'inline-flex', alignItems: 'center', gap: '.4rem', marginTop: '1rem', padding: '.6rem 1rem', border: '1.5px dashed #94a3b8', borderRadius: '8px', color: '#334155', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' },
  btnCancelar:{ padding: '.7rem 1.5rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' },
  btnGuardar: { padding: '.7rem 1.5rem', border: 'none', borderRadius: '8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, cursor: 'pointer' },
};
