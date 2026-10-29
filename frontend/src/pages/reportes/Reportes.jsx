import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';
import { Users, FileText, Clock, XCircle, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

/** Estados que siguen esperando resolucion de RRHH. */
const ESTADOS_PENDIENTES = ['Pendiente', 'En revision'];

export default function Reportes() {
  const [data, setData]         = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando]   = useState(true);

  useEffect(() => {
    let activo = true;
    Promise.all([api.get('/dashboard'), api.get('/empleados'), api.get('/solicitudes')])
      .then(([d, e, sol]) => {
        if (!activo) return;
        setData(d.data);
        setEmpleados(e.data);
        setSolicitudes(sol.data);
      })
      .catch(() => { if (activo) toast.error('No se pudieron cargar los reportes. Intente de nuevo en unos segundos.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  const totalSolicitudes = solicitudes.length;
  const aprobadas  = solicitudes.filter(s => s.estado === 'Aprobada').length;
  const rechazadas = solicitudes.filter(s => s.estado === 'Rechazada').length;
  // 'En revision' tambien espera resolucion: contar solo 'Pendiente' mostraba 0
  // aunque hubiera solicitudes sin resolver.
  const pendientes = solicitudes.filter(s => ESTADOS_PENDIENTES.includes(s.estado)).length;
  const tasaAprobacion = totalSolicitudes > 0 ? Math.round((aprobadas / totalSolicitudes) * 100) : 0;

  const porContrato = empleados.reduce((acc, e) => {
    acc[e.tipo_contrato] = (acc[e.tipo_contrato] || 0) + 1;
    return acc;
  }, {});

  const porDepartamento = empleados.reduce((acc, e) => {
    if (e.departamento) acc[e.departamento] = (acc[e.departamento] || 0) + 1;
    return acc;
  }, {});

  // Expediente (migracion 007): viene en la misma respuesta de /dashboard.
  const exp = data?.expediente || {};
  const capDep  = exp.capacitacion_por_departamento || [];
  const evalDep = exp.desempeno_por_departamento || [];
  const llamDep = exp.llamadas_por_departamento || [];
  const maxHoras = Math.max(1, ...capDep.map(d => d.horas));
  const maxLlam  = Math.max(1, ...llamDep.map(d => d.llamadas));

  const stats = [
    { label:'Total Empleados',        val: data?.total_empleados?.total || 0,   icon: Users,       color:'#1e3a5f' },
    { label:'Empleados Activos',       val: data?.total_empleados?.activos || 0, icon: Users,       color:'#0d9488' },
    { label:'Total Solicitudes',       val: totalSolicitudes,                    icon: FileText,    color:'#6366f1' },
    { label:'Tasa de Aprobación',      val: `${tasaAprobacion}%`,               icon: TrendingUp,  color:'#22c55e' },
    { label:'Solicitudes Pendientes',  val: pendientes,                          icon: Clock,       color:'#f59e0b' },
    { label:'Solicitudes Rechazadas',  val: rechazadas,                          icon: XCircle,     color:'#ef4444' },
  ];

  // Mientras se espera al servidor no se muestran tarjetas en 0 ni "Sin datos".
  if (cargando) {
    return (
      <div>
        <h1 style={s.titulo}>Reportes</h1>
        <p style={s.sub}>Resumen estadístico del sistema RRHH</p>
        <p style={s.cargando}>Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={s.titulo}>Reportes</h1>
      <p style={s.sub}>Resumen estadístico del sistema RRHH</p>

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

      <h2 style={{ ...s.seccionTitle, fontSize:'1.1rem', margin:'1.5rem 0 1rem' }}>
        Expediente del personal {exp.anio ? `· ${exp.anio}` : ''}
      </h2>

      <div style={s.row}>
        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Horas de capacitación por departamento</h2>
          {capDep.map(d => (
            <div key={d.departamento} style={s.barWrap}>
              <span style={s.barLabel}>{d.departamento}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width:`${Math.round((d.horas/maxHoras)*100)}%`, background:'#0d9488' }}/>
              </div>
              <span style={s.barCount}>{d.horas} h</span>
            </div>
          ))}
          {!capDep.length && <p style={s.empty}>Sin capacitaciones registradas este año</p>}
        </div>

        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Desempeño promedio por departamento</h2>
          {evalDep.map(d => (
            <div key={d.departamento} style={s.barWrap}>
              <span style={s.barLabel}>{d.departamento}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width:`${Math.round((d.promedio/5)*100)}%`,
                  background: d.promedio >= 4.5 ? '#16a34a' : d.promedio >= 3.5 ? '#0d9488' : d.promedio >= 2.5 ? '#f59e0b' : '#ef4444' }}/>
              </div>
              <span style={s.barCount}>{d.promedio.toFixed(2)}</span>
            </div>
          ))}
          {!evalDep.length && <p style={s.empty}>Sin evaluaciones registradas este año</p>}
          {exp.sin_evaluar > 0 && (
            <p style={{ ...s.empty, marginTop:'.75rem' }}>{exp.sin_evaluar} empleado(s) activo(s) sin evaluar este año.</p>
          )}
        </div>
      </div>

      <div style={s.row}>
        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Llamadas de atención por departamento (últimos 12 meses)</h2>
          {llamDep.map(d => (
            <div key={d.departamento} style={s.barWrap}>
              <span style={s.barLabel}>{d.departamento}</span>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width:`${Math.round((d.llamadas/maxLlam)*100)}%`, background:'#f97316' }}/>
              </div>
              <span style={s.barCount}>{d.llamadas}</span>
            </div>
          ))}
          {!llamDep.length && <p style={s.empty}>Sin llamadas de atención en el período</p>}
          {(exp.llamadas_reincidentes || []).length > 0 && (
            <div style={{ marginTop:'1rem' }}>
              <p style={{ fontSize:'.8rem', fontWeight:600, color:'#b91c1c', marginBottom:'.4rem' }}>
                Reincidentes (3 o más llamadas):
              </p>
              {exp.llamadas_reincidentes.map(r => (
                <div key={r.id_empleado} style={{ display:'flex', justifyContent:'space-between', gap:'.5rem', fontSize:'.85rem', padding:'.3rem 0', borderBottom:'1px solid #f1f5f9' }}>
                  <Link to={`/empleados/${r.id_empleado}/expediente`} style={{ color:'#1e3a5f', fontWeight:600 }}>{r.empleado}</Link>
                  <span style={{ color:'#64748b' }}>{r.departamento} · {r.llamadas}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.seccion}>
          <h2 style={s.seccionTitle}>Avisos de baja ante el IGSS pendientes</h2>
          {(exp.bajas_igss_pendientes || []).map(b => (
            <div key={b.id} style={{ display:'flex', justifyContent:'space-between', gap:'.5rem', fontSize:'.85rem', padding:'.4rem 0', borderBottom:'1px solid #f1f5f9' }}>
              <div>
                <Link to={`/empleados/${b.id_empleado}/expediente`} style={{ color:'#1e3a5f', fontWeight:600 }}>{b.empleado}</Link>
                <div style={{ fontSize:'.75rem', color:'#94a3b8' }}>{b.motivo} · baja {b.fecha_baja.split('-').reverse().join('/')}</div>
              </div>
              <span style={{ ...s.estadoBadge, background: b.dias_transcurridos > 10 ? '#dc2626' : '#f59e0b', alignSelf:'center' }}>
                {b.dias_transcurridos} día(s)
              </span>
            </div>
          ))}
          {!(exp.bajas_igss_pendientes || []).length && <p style={s.empty}>Todos los avisos están presentados</p>}
        </div>
      </div>
    </div>
  );
}

const s = {
  titulo:       { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:          { color:'#64748b', marginBottom:'1.5rem' },
  cargando:     { textAlign:'center', color:'#94a3b8', padding:'3rem 1rem' },
  grid:         { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'1rem', marginBottom:'1.5rem' },
  card:         { background:'#fff', borderRadius:'12px', padding:'1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  iconBox:      { borderRadius:'10px', padding:'.75rem', display:'flex', flexShrink:0 },
  cardVal:      { fontSize:'1.6rem', fontWeight:700, color:'#1e293b' },
  cardLabel:    { fontSize:'.78rem', color:'#64748b' },
  row:          { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'1rem', marginBottom:'1rem' },
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
