import { useEffect, useState, useCallback, useRef } from 'react';
import api, { descargarComoUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Phone, Calendar, Briefcase, Camera, Trash2, Building2, IdCard, Check, X,
         GraduationCap, ClipboardCheck, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useEsMovil } from '../../hooks/useMedia';
import { fechaCorta } from '../../utils/fechas';

const colores = { 'Pendiente': '#f59e0b', 'En revision': '#3b82f6', 'Aprobada': '#22c55e', 'Rechazada': '#ef4444', 'Cancelada': '#94a3b8' };

// Mismos limites que aplica el servidor (upload.middleware): se comprueban aqui
// para avisar antes de subir, no despues de esperar la carga.
const MAX_FOTO_MB = 3;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

export default function MiPerfil() {
  const { usuario } = useAuth();
  const esMovil = useEsMovil();
  const [perfil, setPerfil]         = useState(null);
  const [vacaciones, setVacaciones] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [expediente, setExpediente]   = useState(null);
  const [fotoUrl, setFotoUrl]       = useState(null);
  const [subiendo, setSubiendo]     = useState(false);
  // Foto elegida pero todavia NO guardada: { archivo, vistaPrevia }.
  const [pendiente, setPendiente]   = useState(null);
  const archivoRef = useRef(null);
  const urlRef = useRef(null);
  const vistaPreviaRef = useRef(null);

  // La foto está tras una ruta autenticada: se baja como blob.
  const cargarFoto = useCallback(async (idEmpleado) => {
    try {
      const url = await descargarComoUrl(`/empleados/${idEmpleado}/foto`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setFotoUrl(url);
    } catch {
      setFotoUrl(null);
    }
  }, []);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/perfil');
      setPerfil(data);

      if (data.id_empleado) {
        api.get(`/vacaciones/${data.id_empleado}`).then((v) => setVacaciones(v.data)).catch(() => {});
        api.get('/solicitudes/mias').then((r) => setSolicitudes(r.data)).catch(() => {});
        api.get('/expediente/mio').then((r) => setExpediente(r.data)).catch(() => {});
        if (data.foto_url) cargarFoto(data.id_empleado);
      }
    } catch {
      toast.error('No se pudo cargar el perfil');
    }
  }, [cargarFoto]);

  useEffect(() => {
    cargar();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (vistaPreviaRef.current) URL.revokeObjectURL(vistaPreviaRef.current);
    };
  }, [cargar]);

  /** Libera la URL temporal de la vista previa. */
  const limpiarVistaPrevia = () => {
    if (vistaPreviaRef.current) {
      URL.revokeObjectURL(vistaPreviaRef.current);
      vistaPreviaRef.current = null;
    }
  };

  /**
   * Elegir el archivo ya no lo sube: muestra como va a quedar la foto y deja
   * que la persona confirme con Guardar. Antes bastaba con abrir el explorador
   * y hacer doble clic para que la foto quedara cambiada, sin vuelta atras.
   */
  const elegirFoto = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';                      // permite reelegir el mismo archivo
    if (!archivo) return;

    if (!TIPOS_FOTO.includes(archivo.type)) {
      return toast.error('Formato no admitido. Use JPG, PNG o WEBP.');
    }
    if (archivo.size > MAX_FOTO_MB * 1024 * 1024) {
      return toast.error(`La imagen supera el límite de ${MAX_FOTO_MB} MB.`);
    }

    limpiarVistaPrevia();
    const vistaPrevia = URL.createObjectURL(archivo);
    vistaPreviaRef.current = vistaPrevia;
    setPendiente({ archivo, vistaPrevia });
  };

  const descartarFoto = () => {
    limpiarVistaPrevia();
    setPendiente(null);
  };

  const guardarFoto = async () => {
    if (!pendiente) return;
    setSubiendo(true);
    const datos = new FormData();
    datos.append('foto', pendiente.archivo);
    try {
      await api.post('/auth/foto', datos);
      toast.success('Foto actualizada');
      descartarFoto();
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir la foto');
    } finally {
      setSubiendo(false);
    }
  };

  const quitarFoto = async () => {
    if (!window.confirm('¿Quitar su foto de perfil?')) return;
    try {
      await api.delete('/auth/foto');
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
      setFotoUrl(null);
      toast.success('Foto eliminada');
      cargar();
    } catch {
      toast.error('Error al eliminar la foto');
    }
  };

  if (!perfil) return <div style={s.cargando}>Cargando perfil...</div>;

  const info = [
    { icon: User,      label: 'Usuario',        val: perfil.username },
    { icon: IdCard,    label: 'Código',         val: perfil.codigo_empleado || '—' },
    { icon: Mail,      label: 'Correo',         val: perfil.correo || '—' },
    { icon: Phone,     label: 'Teléfono',       val: perfil.telefono || '—' },
    { icon: Building2, label: 'Departamento',   val: perfil.departamento || '—' },
    { icon: Briefcase, label: 'Puesto',         val: perfil.puesto || '—' },
    { icon: Calendar,  label: 'Fecha de ingreso', val: fechaCorta(perfil.fecha_ingreso) },
    { icon: Calendar,  label: 'Último acceso',  val: perfil.ultimo_acceso ? new Date(perfil.ultimo_acceso).toLocaleString('es-GT') : '—' },
  ];

  const anioActual = new Date().getFullYear();
  const vacActual = vacaciones.find((v) => v.anio === anioActual);
  const inicial = (perfil.nombres || usuario?.nombre || 'U')[0].toUpperCase();

  return (
    <div>
      <h1 style={s.titulo}>Mi Perfil</h1>
      <p style={s.sub}>Información de tu cuenta</p>

      {/* En telefono las dos columnas no caben: la ficha va sobre el detalle. */}
      <div style={{ ...s.layout, gridTemplateColumns: esMovil ? '1fr' : 'minmax(300px, 340px) 1fr' }}>
        <div style={s.card}>
          <div style={s.avatarCaja}>
            {/* Con una foto elegida se muestra esa, para ver como va a quedar. */}
            {pendiente
              ? <img src={pendiente.vistaPrevia} alt="Vista previa de la nueva foto"
                     style={{ ...s.avatarImg, borderColor: '#0d9488' }} />
              : fotoUrl
                ? <img src={fotoUrl} alt="Foto de perfil" style={s.avatarImg} />
                : <div style={s.avatar}>{inicial}</div>}

            {perfil.id_empleado && (
              <div style={s.avatarAcciones}>
                {pendiente ? (
                  <>
                    <button style={s.btnGuardarFoto} onClick={guardarFoto} disabled={subiendo}>
                      <Check size={14} /> {subiendo ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button style={s.btnFoto} onClick={descartarFoto} disabled={subiendo}>
                      <X size={14} /> Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button style={s.btnFoto} onClick={() => archivoRef.current?.click()}
                      title="Cambiar foto">
                      <Camera size={14} /> Cambiar
                    </button>
                    {fotoUrl && (
                      <button style={{ ...s.btnFoto, color: '#dc2626' }} onClick={quitarFoto} title="Quitar foto">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
                <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }} onChange={elegirFoto} />
              </div>
            )}
          </div>

          {pendiente && (
            <p style={s.avisoPendiente}>
              {pendiente.archivo.name} · sin guardar. Pulse <strong>Guardar</strong> para aplicar el cambio.
            </p>
          )}

          <h2 style={s.nombre}>
            {perfil.nombres ? `${perfil.nombres} ${perfil.apellidos}` : usuario?.nombre}
          </h2>
          <span style={{ ...s.rolBadge, background: usuario?.rol === 'admin' ? '#1e3a5f' : '#6366f1' }}>
            {usuario?.rol}
          </span>

          <div style={s.infoList}>
            {info.map(({ icon: Icon, label, val }) => (
              <div key={label} style={s.infoItem}>
                <Icon size={16} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={s.infoLabel}>{label}</p>
                  <p style={s.infoVal}>{val}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={s.card}>
            <div style={s.cardHeader}>
              <h2 style={s.cardTitle}>Mis Vacaciones {anioActual}</h2>
              <Link to="/mis-vacaciones" style={s.enlace}>Ver detalle</Link>
            </div>
            {vacActual ? (
              <div style={s.vacGrid}>
                <div style={s.vacItem}>
                  <p style={s.vacNum}>{vacActual.dias_disponibles ?? '—'}</p>
                  <p style={s.vacLabel}>Días asignados</p>
                </div>
                <div style={s.vacItem}>
                  <p style={{ ...s.vacNum, color: '#f59e0b' }}>{vacActual.dias_usados ?? '—'}</p>
                  <p style={s.vacLabel}>Días gozados</p>
                </div>
                <div style={s.vacItem}>
                  <p style={{ ...s.vacNum, color: (vacActual.saldo ?? 0) > 0 ? '#22c55e' : '#ef4444' }}>
                    {vacActual.saldo ?? '—'}
                  </p>
                  <p style={s.vacLabel}>Saldo restante</p>
                </div>
              </div>
            ) : (
              <p style={{ color: '#94a3b8' }}>No hay registro de vacaciones para este año.</p>
            )}
            {vacActual && !vacActual.derecho_vigente && vacActual.derecho_desde && (
              <p style={s.nota}>Podrá tomarlas a partir del {vacActual.derecho_desde}.</p>
            )}
          </div>

          <div style={s.card}>
            <div style={s.cardHeader}>
              <h2 style={s.cardTitle}>Historial de solicitudes</h2>
              <Link to="/mis-solicitudes" style={s.enlace}>Ver todas</Link>
            </div>

            {solicitudes.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>Todavía no ha enviado solicitudes.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tbl}>
                  <thead>
                    <tr>{['#', 'Tipo', 'Desde', 'Hasta', 'Días', 'Estado'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {solicitudes.slice(0, 8).map((sol) => (
                      <tr key={sol.id}>
                        <td style={s.td}>{sol.id}</td>
                        <td style={s.td}>{sol.tipo_solicitud}</td>
                        <td style={s.td}>{fechaCorta(sol.fecha_inicio)}</td>
                        <td style={s.td}>{fechaCorta(sol.fecha_fin)}</td>
                        <td style={s.td}>{sol.dias_habiles ?? sol.dias_solicitados ?? '—'}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {solicitudes.length > 8 && (
                  <p style={s.nota}>Mostrando las 8 más recientes de {solicitudes.length}.</p>
                )}
              </div>
            )}
          </div>

          {expediente && <MiExpediente exp={expediente} />}
        </div>
      </div>
    </div>
  );
}

const fecha = fechaCorta;
const COLOR_RESULTADO = {
  'Excelente': '#16a34a', 'Muy bueno': '#0d9488', 'Satisfactorio': '#f59e0b', 'Necesita mejorar': '#ef4444',
};
const COLOR_LLAMADA = { Verbal: '#f59e0b', Escrita: '#f97316', Grave: '#dc2626' };

/**
 * Lo que RRHH registra en el expediente, en solo lectura: el empleado tiene
 * derecho a ver sus capacitaciones, sus evaluaciones y sus llamadas de atención.
 */
function MiExpediente({ exp }) {
  const bloques = [
    {
      icon: GraduationCap, color: '#0d9488', titulo: 'Capacitaciones',
      resumen: `${exp.resumen.capacitaciones} registrada(s) · ${Number(exp.resumen.horas_capacitacion || 0)} horas`,
      vacio: 'Todavía no tiene capacitaciones registradas.',
      filas: exp.capacitaciones.map((c) => ({
        id: c.id, principal: c.nombre,
        secundario: [c.institucion, `${c.tipo} · ${c.modalidad}`, fecha(c.fecha_inicio)].filter(Boolean).join(' · '),
        etiqueta: c.horas != null ? `${Number(c.horas)} h` : null, color: '#0d9488',
      })),
    },
    {
      icon: ClipboardCheck, color: '#6366f1', titulo: 'Evaluaciones de desempeño',
      resumen: exp.resumen.ultima_evaluacion
        ? `Última: ${exp.resumen.ultima_evaluacion.resultado} (${exp.resumen.ultima_evaluacion.promedio.toFixed(2)} / 5)`
        : 'Sin evaluación registrada',
      vacio: 'Todavía no ha sido evaluado.',
      filas: exp.evaluaciones.map((e) => ({
        id: e.id, principal: e.periodo,
        secundario: `${fecha(e.fecha)} · evaluó ${e.evaluador}${e.fortalezas ? ` · Fortalezas: ${e.fortalezas}` : ''}`,
        etiqueta: `${Number(e.promedio).toFixed(2)} · ${e.resultado}`, color: COLOR_RESULTADO[e.resultado],
      })),
    },
    {
      icon: TriangleAlert, color: '#f97316', titulo: 'Llamadas de atención',
      resumen: `${exp.resumen.llamadas_12_meses} en los últimos 12 meses · ${exp.resumen.llamadas_total} en total`,
      vacio: 'No tiene llamadas de atención.',
      filas: exp.llamadas.map((l) => ({
        id: l.id, principal: l.motivo,
        secundario: [fecha(l.fecha), l.emitida_por && `emitida por ${l.emitida_por}`, l.sancion && `Sanción: ${l.sancion}`].filter(Boolean).join(' · '),
        etiqueta: l.tipo, color: COLOR_LLAMADA[l.tipo],
      })),
    },
  ];

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h2 style={s.cardTitle}>Mi expediente</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {bloques.map((b) => (
          <div key={b.titulo}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
              <b.icon size={16} color={b.color} />
              <strong style={{ fontSize: '.9rem', color: '#1e293b' }}>{b.titulo}</strong>
              <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>· {b.resumen}</span>
            </div>
            {b.filas.length === 0 ? (
              <p style={{ fontSize: '.82rem', color: '#94a3b8', margin: 0 }}>{b.vacio}</p>
            ) : b.filas.slice(0, 5).map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', padding: '.45rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '.85rem', color: '#1e293b', margin: 0, fontWeight: 500 }}>{f.principal}</p>
                  <p style={{ fontSize: '.75rem', color: '#64748b', margin: 0 }}>{f.secundario}</p>
                </div>
                {f.etiqueta && (
                  <span style={{ ...s.badge, background: f.color || '#64748b', alignSelf: 'center', whiteSpace: 'nowrap' }}>{f.etiqueta}</span>
                )}
              </div>
            ))}
            {b.filas.length > 5 && <p style={s.nota}>Mostrando 5 de {b.filas.length}.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  cargando:   { textAlign:'center', padding:'3rem', color:'#64748b' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b', marginBottom:'1.5rem' },
  layout:     { display:'grid', gap:'1.5rem', alignItems:'start' },
  card:       { background:'#fff', borderRadius:'16px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  cardHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', gap:'1rem' },
  avatarCaja: { display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1rem' },
  avatar:     { width:'72px', height:'72px', borderRadius:'50%', background:'#1e3a5f', color:'#fff',
                fontSize:'2rem', fontWeight:700, display:'flex', alignItems:'center',
                justifyContent:'center', flexShrink:0 },
  avatarImg:  { width:'72px', height:'72px', borderRadius:'50%', objectFit:'cover',
                border:'3px solid #e2e8f0', flexShrink:0 },
  avatarAcciones: { display:'flex', flexDirection:'column', gap:'.4rem' },
  btnFoto:    { display:'flex', alignItems:'center', gap:'.3rem', background:'#f1f5f9', border:'none',
                borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.78rem', color:'#334155',
                fontWeight:600, cursor:'pointer' },
  nombre:     { fontSize:'1.2rem', fontWeight:700, color:'#1e293b', marginBottom:'.5rem' },
  rolBadge:   { fontSize:'.75rem', fontWeight:600, color:'#fff', padding:'.25rem .75rem', borderRadius:'99px' },
  infoList:   { display:'flex', flexDirection:'column', gap:'.75rem', marginTop:'1.5rem' },
  infoItem:   { display:'flex', alignItems:'flex-start', gap:'.75rem' },
  infoLabel:  { fontSize:'.75rem', color:'#94a3b8', margin:0 },
  infoVal:    { fontSize:'.9rem', color:'#1e293b', fontWeight:500, margin:0 },
  cardTitle:  { fontSize:'1rem', fontWeight:600, color:'#1e3a5f' },
  enlace:     { fontSize:'.8rem', color:'#0d9488', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' },
  vacGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:'1rem' },
  vacItem:    { background:'#f8fafc', borderRadius:'12px', padding:'1.25rem', textAlign:'center' },
  vacNum:     { fontSize:'2rem', fontWeight:700, color:'#1e3a5f', margin:0 },
  vacLabel:   { fontSize:'.78rem', color:'#64748b', margin:0 },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'520px' },
  th:         { textAlign:'left', padding:'.5rem .75rem', fontSize:'.78rem', color:'#64748b',
                borderBottom:'2px solid #e2e8f0', fontWeight:600, whiteSpace:'nowrap' },
  td:         { padding:'.5rem .75rem', fontSize:'.85rem', borderBottom:'1px solid #f1f5f9',
                color:'#374151', whiteSpace:'nowrap' },
  badge:      { padding:'.2rem .65rem', borderRadius:'99px', fontSize:'.72rem', color:'#fff', fontWeight:600 },
  nota:       { fontSize:'.78rem', color:'#94a3b8', marginTop:'.6rem' },
  btnGuardarFoto: { display:'flex', alignItems:'center', gap:'.3rem', background:'#0d9488', border:'none',
                borderRadius:'6px', padding:'.35rem .6rem', fontSize:'.78rem', color:'#fff',
                fontWeight:600, cursor:'pointer' },
  avisoPendiente: { fontSize:'.75rem', color:'#0f766e', background:'#f0fdfa', border:'1px solid #99f6e4',
                borderRadius:'8px', padding:'.4rem .6rem', marginBottom:'.25rem', lineHeight:1.4,
                wordBreak:'break-all' },
};
