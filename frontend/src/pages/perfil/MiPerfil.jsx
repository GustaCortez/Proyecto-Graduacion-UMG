import { useEffect, useState, useCallback, useRef } from 'react';
import api, { descargarComoUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Phone, Calendar, Briefcase, Camera, Trash2, Building2, IdCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const colores = { 'Pendiente': '#f59e0b', 'En revision': '#3b82f6', 'Aprobada': '#22c55e', 'Rechazada': '#ef4444', 'Cancelada': '#94a3b8' };

export default function MiPerfil() {
  const { usuario } = useAuth();
  const [perfil, setPerfil]         = useState(null);
  const [vacaciones, setVacaciones] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [fotoUrl, setFotoUrl]       = useState(null);
  const [subiendo, setSubiendo]     = useState(false);
  const archivoRef = useRef(null);
  const urlRef = useRef(null);

  /** La foto está tras una ruta autenticada, así que se baja como blob. */
  const cargarFoto = useCallback(async (idEmpleado) => {
    try {
      const url = await descargarComoUrl(`/empleados/${idEmpleado}/foto`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setFotoUrl(url);
    } catch {
      setFotoUrl(null); // sin foto cargada todavía
    }
  }, []);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/perfil');
      setPerfil(data);

      if (data.id_empleado) {
        api.get(`/vacaciones/${data.id_empleado}`).then((v) => setVacaciones(v.data)).catch(() => {});
        api.get('/solicitudes/mias').then((r) => setSolicitudes(r.data)).catch(() => {});
        if (data.foto_url) cargarFoto(data.id_empleado);
      }
    } catch {
      toast.error('No se pudo cargar el perfil');
    }
  }, [cargarFoto]);

  useEffect(() => {
    cargar();
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [cargar]);

  const subirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    const datos = new FormData();
    datos.append('foto', archivo);
    try {
      await api.post('/auth/foto', datos);
      toast.success('Foto actualizada');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir la foto');
    } finally {
      setSubiendo(false);
      e.target.value = '';
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
    { icon: Calendar,  label: 'Fecha de ingreso', val: perfil.fecha_ingreso || '—' },
    { icon: Calendar,  label: 'Último acceso',  val: perfil.ultimo_acceso ? new Date(perfil.ultimo_acceso).toLocaleString('es-GT') : '—' },
  ];

  const anioActual = new Date().getFullYear();
  const vacActual = vacaciones.find((v) => v.anio === anioActual);
  const inicial = (perfil.nombres || usuario?.nombre || 'U')[0].toUpperCase();

  return (
    <div>
      <h1 style={s.titulo}>Mi Perfil</h1>
      <p style={s.sub}>Información de tu cuenta</p>

      <div style={s.layout}>
        {/* Tarjeta de perfil */}
        <div style={s.card}>
          <div style={s.avatarCaja}>
            {fotoUrl
              ? <img src={fotoUrl} alt="Foto de perfil" style={s.avatarImg} />
              : <div style={s.avatar}>{inicial}</div>}

            {perfil.id_empleado && (
              <div style={s.avatarAcciones}>
                <button style={s.btnFoto} onClick={() => archivoRef.current?.click()} disabled={subiendo}
                  title="Cambiar foto">
                  <Camera size={14} /> {subiendo ? 'Subiendo...' : 'Cambiar'}
                </button>
                {fotoUrl && (
                  <button style={{ ...s.btnFoto, color: '#dc2626' }} onClick={quitarFoto} title="Quitar foto">
                    <Trash2 size={14} />
                  </button>
                )}
                <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }} onChange={subirFoto} />
              </div>
            )}
          </div>

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
          <p style={s.pista}>JPG, PNG o WebP, hasta 3 MB.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Vacaciones */}
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

          {/* Historial de solicitudes */}
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
                        <td style={s.td}>{new Date(sol.fecha_inicio).toLocaleDateString('es-GT')}</td>
                        <td style={s.td}>{sol.fecha_fin ? new Date(sol.fecha_fin).toLocaleDateString('es-GT') : '—'}</td>
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
        </div>
      </div>
    </div>
  );
}

const s = {
  cargando:   { textAlign:'center', padding:'3rem', color:'#64748b' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b', marginBottom:'1.5rem' },
  layout:     { display:'grid', gridTemplateColumns:'minmax(300px, 340px) 1fr', gap:'1.5rem', alignItems:'start' },
  card:       { background:'#fff', borderRadius:'16px', padding:'2rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
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
  pista:      { fontSize:'.72rem', color:'#cbd5e1', marginTop:'1rem' },
};
