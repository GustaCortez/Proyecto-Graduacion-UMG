import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Users, CheckCircle, Clock, XCircle, HeartPulse, ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';

/** Estados que siguen esperando resolucion de RRHH. */
const ESTADOS_PENDIENTES = ['Pendiente', 'En revision'];

export default function Dashboard() {
  const { usuario } = useAuth();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const esEmpleado = usuario?.rol === 'empleado';

  useEffect(() => {
    let activo = true;
    api.get('/dashboard')
      .then(r => { if (activo) setData(r.data); })
      .catch(() => { if (activo) toast.error('No se pudo cargar el resumen. Intente de nuevo en unos segundos.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  // COUNT de PostgreSQL llega como texto: sin Number() las sumas concatenarian.
  const resumen = data?.resumen_solicitudes || [];
  const totalDe = (...estados) =>
    resumen
      .filter(s => estados.includes(s.estado))
      .reduce((n, s) => n + Number(s.total || 0), 0);

  const pendientes = totalDe(...ESTADOS_PENDIENTES);
  const aprobadas  = totalDe('Aprobada');
  const rechazadas = totalDe('Rechazada');
  const canceladas = totalDe('Cancelada');
  const totalSolicitudes = pendientes + aprobadas + rechazadas + canceladas;

  // Expediente (migracion 007): avisos IGSS sin presentar y evaluaciones del año.
  const expediente = data?.expediente;
  const igssPendientes = expediente?.bajas_igss_pendientes || [];

  const cardsAdmin = [
    { label: 'Total Empleados',   val: data?.total_empleados?.total   || 0, icon: Users,       color: '#1e3a5f' },
    { label: 'Empleados Activos', val: data?.total_empleados?.activos || 0, icon: Users,       color: '#0d9488' },
    { label: 'Avisos IGSS pendientes', val: igssPendientes.length,          icon: HeartPulse,  color: '#dc2626' },
    { label: 'Sin evaluar este año',   val: expediente?.sin_evaluar || 0,   icon: ClipboardCheck, color: '#6366f1' },
    // "Pendientes" incluye las que estan En revision: siguen esperando respuesta.
    { label: 'Solicitudes Pendientes', val: pendientes, icon: Clock,       color: '#f59e0b' },
    { label: 'Solicitudes Aprobadas',  val: aprobadas,  icon: CheckCircle, color: '#22c55e' },
    { label: 'Solicitudes Rechazadas', val: rechazadas, icon: XCircle,     color: '#ef4444' },
  ];

  const cardsEmpleado = [
    { label: 'Mis Solicitudes Pendientes', val: pendientes, icon: Clock,       color: '#f59e0b' },
    { label: 'Mis Solicitudes Aprobadas',  val: aprobadas,  icon: CheckCircle, color: '#22c55e' },
    { label: 'Mis Solicitudes Rechazadas', val: rechazadas, icon: XCircle,     color: '#ef4444' },
  ];

  const cards = esEmpleado ? cardsEmpleado : cardsAdmin;
  const recientes = data?.solicitudes_recientes || [];

  /**
   * Las tarjetas cuentan el historial completo; la tabla solo lista las ultimas
   * cinco. Sin decirlo, parece que los numeros no cuadran.
   */
  const leyendaTabla = totalSolicitudes === 0
    ? null
    : recientes.length >= totalSolicitudes
      ? `${totalSolicitudes} solicitud(es) en total.`
      : `Mostrando las ${recientes.length} más recientes de ${totalSolicitudes} solicitudes registradas.`;

  const subtitulo = esEmpleado ? 'Resumen de tus trámites' : 'Resumen general del sistema';

  // Mientras se espera al servidor no se muestran tarjetas en 0 ni "No hay solicitudes".
  if (cargando) {
    return (
      <div>
        <h1 style={s.titulo}>Dashboard</h1>
        <p style={s.sub}>{subtitulo}</p>
        <p style={s.cargando}>Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={s.titulo}>Dashboard</h1>
      <p style={s.sub}>{subtitulo}</p>

      <div style={s.grid}>
        {cards.map((c, i) => (
          <div key={i} style={s.card}>
            <div style={{ ...s.iconBox, background: c.color }}>
              <c.icon size={24} color="#fff"/>
            </div>
            <div>
              <p style={s.cardVal}>{c.val}</p>
              <p style={s.cardLabel}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {!esEmpleado && igssPendientes.length > 0 && (
        <div style={{ ...s.tabla, marginBottom: '1.5rem', borderLeft: '4px solid #dc2626' }}>
          <div style={s.tablaCabecera}>
            <div>
              <h2 style={s.tablaTitle}>Avisos de baja ante el IGSS pendientes</h2>
              <p style={s.tablaLeyenda}>
                Empleados dados de baja cuyo aviso todavía no se ha presentado al IGSS.
              </p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead>
                <tr>{['Empleado', 'Fecha de baja', 'Motivo', 'Días transcurridos', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {igssPendientes.map(b => (
                  <tr key={b.id}>
                    <td style={s.td}>{b.empleado}</td>
                    <td style={s.td}>{b.fecha_baja.split('-').reverse().join('/')}</td>
                    <td style={s.td}>{b.motivo}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: b.dias_transcurridos > 10 ? '#dc2626' : '#f59e0b' }}>
                        {b.dias_transcurridos} día(s)
                      </span>
                    </td>
                    <td style={s.td}>
                      <Link to={`/empleados/${b.id_empleado}/expediente`} style={s.verTodas}>Ver expediente</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={s.tabla}>
        <div style={s.tablaCabecera}>
          <div>
            <h2 style={s.tablaTitle}>
              {esEmpleado ? 'Mis Solicitudes Recientes' : 'Solicitudes Recientes'}
            </h2>
            {leyendaTabla && <p style={s.tablaLeyenda}>{leyendaTabla}</p>}
          </div>
          {totalSolicitudes > recientes.length && (
            <Link to={esEmpleado ? '/mis-solicitudes' : '/solicitudes'} style={s.verTodas}>
              Ver todas
            </Link>
          )}
        </div>

        {/* La tabla se desplaza dentro de la tarjeta; la página no se mueve. */}
        <div style={{ overflowX: 'auto' }}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {(esEmpleado
                ? ['Tipo', 'Fecha', 'Estado']
                : ['Empleado', 'Tipo', 'Fecha', 'Estado']
              ).map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recientes.map(sol => (
              <tr key={sol.id}>
                {!esEmpleado && <td style={s.td}>{sol.empleado}</td>}
                <td style={s.td}>{sol.tipo_solicitud}</td>
                <td style={s.td}>{new Date(sol.creado_en).toLocaleDateString('es-GT')}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: colores[sol.estado] }}>{sol.estado}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {!recientes.length && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
            {esEmpleado ? 'Aún no tienes solicitudes' : 'No hay solicitudes aún'}
          </p>
        )}
      </div>
    </div>
  );
}

const colores = { 'Pendiente': '#f59e0b', 'En revision': '#3b82f6', 'Aprobada': '#22c55e', 'Rechazada': '#ef4444', 'Cancelada': '#94a3b8' };

const s = {
  titulo:    { fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f' },
  sub:       { color: '#64748b', marginBottom: '1.5rem' },
  cargando:  { textAlign: 'center', color: '#94a3b8', padding: '3rem 1rem' },
  grid:      { display: 'grid', gap: '1rem', marginBottom: '2rem',
               gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' },
  card:      { background: '#fff', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  iconBox:   { borderRadius: '10px', padding: '.75rem', display: 'flex' },
  cardVal:   { fontSize: '1.75rem', fontWeight: 700, color: '#1e293b' },
  cardLabel: { fontSize: '.8rem', color: '#64748b' },
  tabla:     { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  tablaCabecera: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                   gap: '1rem', marginBottom: '1rem' },
  tablaTitle:{ fontSize: '1rem', fontWeight: 600, color: '#1e3a5f' },
  tablaLeyenda: { fontSize: '.78rem', color: '#94a3b8', marginTop: '.15rem' },
  verTodas:  { fontSize: '.82rem', fontWeight: 600, color: '#2e5090', whiteSpace: 'nowrap' },
  tbl:       { width: '100%', borderCollapse: 'collapse', minWidth:'560px' },
  th:        { textAlign: 'left', padding: '.75rem 1rem', fontSize: '.8rem', color: '#64748b', borderBottom: '2px solid #e2e8f0', fontWeight: 600 },
  td:        { padding: '.75rem 1rem', fontSize: '.9rem', borderBottom: '1px solid #f1f5f9' },
  badge:     { padding: '.25rem .75rem', borderRadius: '99px', fontSize: '.75rem', color: '#fff', fontWeight: 500 },
};
