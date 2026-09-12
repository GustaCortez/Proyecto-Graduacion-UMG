import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Phone, MapPin, Calendar, Briefcase } from 'lucide-react';

export default function MiPerfil() {
  const { usuario } = useAuth();
  const [perfil, setPerfil]       = useState(null);
  const [vacaciones, setVacaciones] = useState([]);

  useEffect(() => {
    api.get('/auth/perfil').then(r => {
      setPerfil(r.data);
      // Solo los usuarios ligados a un empleado tienen vacaciones
      if (r.data.id_empleado) {
        api.get(`/vacaciones/${r.data.id_empleado}`)
          .then(v => setVacaciones(v.data))
          .catch(() => {});
      }
    }).catch(console.error);
  }, []);

  if (!perfil) return <div style={s.cargando}>Cargando perfil...</div>;

  const info = [
    { icon: User,     label:'Usuario',       val: perfil.username },
    { icon: Mail,     label:'Correo',        val: perfil.correo || '—' },
    { icon: Phone,    label:'Teléfono',      val: perfil.telefono || '—' },
    { icon: Calendar, label:'Último acceso', val: perfil.ultimo_acceso ? new Date(perfil.ultimo_acceso).toLocaleString('es-GT') : '—' },
    { icon: Briefcase,label:'Rol',           val: usuario?.rol },
  ];

  const vacActual = vacaciones.find(v => v.anio === new Date().getFullYear());

  return (
    <div>
      <h1 style={s.titulo}>Mi Perfil</h1>
      <p style={s.sub}>Información de tu cuenta</p>

      <div style={s.layout}>
        {/* Card perfil */}
        <div style={s.card}>
          <div style={s.avatar}>
            {(perfil.nombres || usuario?.nombre || 'U')[0].toUpperCase()}
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
                <Icon size={16} color="#64748b"/>
                <div>
                  <p style={s.infoLabel}>{label}</p>
                  <p style={s.infoVal}>{val}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vacaciones */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Mis Vacaciones {new Date().getFullYear()}</h2>
          {vacActual ? (
            <div style={s.vacGrid}>
              <div style={s.vacItem}>
                <p style={s.vacNum}>{vacActual.dias_disponibles ?? '—'}</p>
                <p style={s.vacLabel}>Días disponibles</p>
              </div>
              <div style={s.vacItem}>
                <p style={{ ...s.vacNum, color:'#f59e0b' }}>{vacActual.dias_usados ?? '—'}</p>
                <p style={s.vacLabel}>Días usados</p>
              </div>
              <div style={s.vacItem}>
                <p style={{ ...s.vacNum, color: (vacActual.saldo ?? 0) > 0 ? '#22c55e' : '#ef4444' }}>
                  {vacActual.saldo ?? '—'}
                </p>
                <p style={s.vacLabel}>Saldo restante</p>
              </div>
            </div>
          ) : (
            <p style={{ color:'#94a3b8' }}>No hay registro de vacaciones para este año.</p>
          )}

          {vacaciones.length > 1 && (
            <>
              <h3 style={{ ...s.cardTitle, fontSize:'.9rem', marginTop:'1.5rem' }}>Historial</h3>
              <table style={s.tbl}>
                <thead>
                  <tr>
                    {['Año','Disponibles','Usados','Saldo'].map(h => <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {vacaciones.map(v => (
                    <tr key={v.id}>
                      <td style={s.td}>{v.anio}</td>
                      <td style={s.td}>{v.dias_disponibles ?? '—'}</td>
                      <td style={s.td}>{v.dias_usados ?? '—'}</td>
                      <td style={s.td}>{v.saldo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  cargando:   { textAlign:'center', padding:'3rem', color:'#64748b' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b', marginBottom:'1.5rem' },
  layout:     { display:'grid', gridTemplateColumns:'340px 1fr', gap:'1.5rem', alignItems:'start' },
  card:       { background:'#fff', borderRadius:'16px', padding:'2rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  avatar:     { width:'72px', height:'72px', borderRadius:'50%', background:'#1e3a5f', color:'#fff', fontSize:'2rem', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' },
  nombre:     { fontSize:'1.2rem', fontWeight:700, color:'#1e293b', marginBottom:'.5rem' },
  rolBadge:   { fontSize:'.75rem', fontWeight:600, color:'#fff', padding:'.25rem .75rem', borderRadius:'99px' },
  infoList:   { display:'flex', flexDirection:'column', gap:'.75rem', marginTop:'1.5rem' },
  infoItem:   { display:'flex', alignItems:'flex-start', gap:'.75rem' },
  infoLabel:  { fontSize:'.75rem', color:'#94a3b8', margin:0 },
  infoVal:    { fontSize:'.9rem', color:'#1e293b', fontWeight:500, margin:0 },
  cardTitle:  { fontSize:'1rem', fontWeight:600, color:'#1e3a5f', marginBottom:'1.25rem' },
  vacGrid:    { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem', marginBottom:'1rem' },
  vacItem:    { background:'#f8fafc', borderRadius:'12px', padding:'1.25rem', textAlign:'center' },
  vacNum:     { fontSize:'2rem', fontWeight:700, color:'#1e3a5f', margin:0 },
  vacLabel:   { fontSize:'.78rem', color:'#64748b', margin:0 },
  tbl:        { width:'100%', borderCollapse:'collapse' },
  th:         { textAlign:'left', padding:'.5rem .75rem', fontSize:'.78rem', color:'#64748b', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.5rem .75rem', fontSize:'.85rem', borderBottom:'1px solid #f1f5f9', color:'#374151' },
};
