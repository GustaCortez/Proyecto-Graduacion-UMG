import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Users, FileText, CheckCircle, Clock, XCircle, TrendingUp } from 'lucide-react';

export default function Reportes() {
  const [data, setData]         = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).catch(console.error);
    api.get('/empleados').then(r => setEmpleados(r.data)).catch(console.error);
    api.get('/solicitudes').then(r => setSolicitudes(r.data)).catch(console.error);
  }, []);

  const getTotal = estado => data?.resumen_solicitudes?.find(s => s.estado === estado)?.total || 0;

  const totalSolicitudes = solicitudes.length;
  const aprobadas  = solicitudes.filter(s => s.estado === 'Aprobada').length;
  const rechazadas = solicitudes.filter(s => s.estado === 'Rechazada').length;
  const pendientes = solicitudes.filter(s => s.estado === 'Pendiente').length;
  const tasaAprobacion = totalSolicitudes > 0 ? Math.round((aprobadas / totalSolicitudes) * 100) : 0;

  const porContrato = empleados.reduce((acc, e) => {
    acc[e.tipo_contrato] = (acc[e.tipo_contrato] || 0) + 1;
    return acc;
  }, {});

  const porDepartamento = empleados.reduce((acc, e) => {
    if (e.departamento) acc[e.departamento] = (acc[e.departamento] || 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label:'Total Empleados',        val: data?.total_empleados?.total || 0,   icon: Users,       color:'#1e3a5f' },
    { label:'Empleados Activos',       val: data?.total_empleados?.activos || 0, icon: Users,       color:'#0d9488' },
    { label:'Total Solicitudes',       val: totalSolicitudes,                    icon: FileText,    color:'#6366f1' },
    { label:'Tasa de Aprobación',      val: `${tasaAprobacion}%`,               icon: TrendingUp,  color:'#22c55e' },
    { label:'Solicitudes Pendientes',  val: pendientes,                          icon: Clock,       color:'#f59e0b' },
    { label:'Solicitudes Rechazadas',  val: rechazadas,                          icon: XCircle,     color:'#ef4444' },
  ];

  return (
    <div>
      <h1 style={s.titulo}>Reportes</h1>
      <p style={s.sub}>Resumen estadístico del sistema RRHH</p>

      {/* KPIs */}
      <div style={s.grid}>
        {stats.map((c, i) => (
          <div key={i} style={s.card}>
            <div style={{ ...s.iconBox, background: c.color }}>
              <c.icon size={22} color="#fff"/>
            </div>
            <div>
              <p style={s.cardVal}>{c.val}</p>
              <p style={s.cardLabel}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={s.row}>
        {/* Empleados por contrato */}
        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Empleados por tipo de contrato</h2>
          {Object.entries(porContrato).map(([tipo, count]) => (
            <div key={tipo} style={s.barWrap}>
              <span style={s.barLabel}>{tipo}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width:`${Math.round((count/(empleados.length||1))*100)}%`, background:'#1e3a5f' }}/>
              </div>
              <span style={s.barCount}>{count}</span>
            </div>
          ))}
          {!Object.keys(porContrato).length && <p style={s.empty}>Sin datos</p>}
        </div>

        {/* Empleados por departamento */}
        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Empleados por departamento</h2>
          {Object.entries(porDepartamento).sort(([,a],[,b]) => b-a).slice(0,8).map(([dep, count]) => (
            <div key={dep} style={s.barWrap}>
              <span style={s.barLabel}>{dep}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width:`${Math.round((count/(empleados.length||1))*100)}%`, background:'#0d9488' }}/>
              </div>
              <span style={s.barCount}>{count}</span>
            </div>
          ))}
          {!Object.keys(porDepartamento).length && <p style={s.empty}>Sin datos</p>}
        </div>
      </div>

      {/* Estado de solicitudes */}
      <div style={s.seccion}>
        <h2 style={s.seccionTitle}>Solicitudes por estado</h2>
        <div style={s.estadosGrid}>
          {[
            { estado:'Pendiente',   color:'#f59e0b' },
            { estado:'En revision', color:'#3b82f6' },
            { estado:'Aprobada',    color:'#22c55e' },
            { estado:'Rechazada',   color:'#ef4444' },
            { estado:'Cancelada',   color:'#94a3b8' },
          ].map(({ estado, color }) => {
            const total = solicitudes.filter(s => s.estado === estado).length;
            return (
              <div key={estado} style={{ ...s.estadoCard, borderLeft:`4px solid ${color}` }}>
                <span style={{ ...s.estadoBadge, background: color }}>{estado}</span>
                <p style={s.estadoNum}>{total}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s = {
  titulo:       { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:          { color:'#64748b', marginBottom:'1.5rem' },
  grid:         { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'1rem', marginBottom:'1.5rem' },
  card:         { background:'#fff', borderRadius:'12px', padding:'1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  iconBox:      { borderRadius:'10px', padding:'.75rem', display:'flex', flexShrink:0 },
  cardVal:      { fontSize:'1.6rem', fontWeight:700, color:'#1e293b' },
  cardLabel:    { fontSize:'.78rem', color:'#64748b' },
  row:          { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' },
  seccion:      { background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)', marginBottom:'1rem' },
  seccionTitle: { fontSize:'1rem', fontWeight:600, color:'#1e3a5f', marginBottom:'1rem' },
  barWrap:      { display:'flex', alignItems:'center', gap:'.75rem', marginBottom:'.6rem' },
  barLabel:     { fontSize:'.82rem', color:'#374151', minWidth:'120px' },
  barTrack:     { flex:1, background:'#f1f5f9', borderRadius:'99px', height:'10px', overflow:'hidden' },
  barFill:      { height:'10px', borderRadius:'99px', transition:'width .3s' },
  barCount:     { fontSize:'.82rem', fontWeight:600, color:'#374151', minWidth:'24px', textAlign:'right' },
  empty:        { color:'#94a3b8', fontSize:'.9rem' },
  estadosGrid:  { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'1rem' },
  estadoCard:   { background:'#f8fafc', borderRadius:'10px', padding:'1rem', display:'flex', flexDirection:'column', gap:'.5rem' },
  estadoBadge:  { fontSize:'.72rem', fontWeight:600, color:'#fff', padding:'.2rem .6rem', borderRadius:'99px', alignSelf:'flex-start' },
  estadoNum:    { fontSize:'1.75rem', fontWeight:700, color:'#1e293b', margin:0 },
};
