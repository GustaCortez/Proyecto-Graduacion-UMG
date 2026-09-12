import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Users, FileText, CheckCircle, Clock } from 'lucide-react';

export default function Dashboard() {
  const { usuario } = useAuth();
  const [data, setData] = useState(null);
  const esEmpleado = usuario?.rol === 'empleado';

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).catch(console.error);
  }, []);

  const getTotal = (estado) =>
    data?.resumen_solicitudes?.find(s => s.estado === estado)?.total || 0;

  const cardsAdmin = [
    { label: 'Total Empleados',       val: data?.total_empleados?.total   || 0, icon: Users,       color: '#1e3a5f' },
    { label: 'Empleados Activos',     val: data?.total_empleados?.activos || 0, icon: Users,       color: '#0d9488' },
    { label: 'Solicitudes Pendientes',val: getTotal('Pendiente'),               icon: Clock,       color: '#f59e0b' },
    { label: 'Solicitudes Aprobadas', val: getTotal('Aprobada'),                icon: CheckCircle, color: '#22c55e' },
  ];

  const cardsEmpleado = [
    { label: 'Mis Solicitudes Pendientes', val: getTotal('Pendiente'), icon: Clock,       color: '#f59e0b' },
    { label: 'Mis Solicitudes Aprobadas',  val: getTotal('Aprobada'),  icon: CheckCircle, color: '#22c55e' },
  ];

  const cards = esEmpleado ? cardsEmpleado : cardsAdmin;

  return (
    <div>
      <h1 style={s.titulo}>Dashboard</h1>
      <p style={s.sub}>
        {esEmpleado ? 'Resumen de tus trámites' : 'Resumen general del sistema'}
      </p>

      {/* Tarjetas */}
      <div style={{ ...s.grid, gridTemplateColumns: esEmpleado ? 'repeat(auto-fit,minmax(220px,1fr))' : 'repeat(auto-fit,minmax(200px,1fr))' }}>
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

      {/* Solicitudes recientes */}
      <div style={s.tabla}>
        <h2 style={s.tablaTitle}>
          {esEmpleado ? 'Mis Solicitudes Recientes' : 'Solicitudes Recientes'}
        </h2>
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
            {data?.solicitudes_recientes?.map(sol => (
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
        {!data?.solicitudes_recientes?.length && (
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
  grid:      { display: 'grid', gap: '1rem', marginBottom: '2rem' },
  card:      { background: '#fff', borderRadius: '12px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  iconBox:   { borderRadius: '10px', padding: '.75rem', display: 'flex' },
  cardVal:   { fontSize: '1.75rem', fontWeight: 700, color: '#1e293b' },
  cardLabel: { fontSize: '.8rem', color: '#64748b' },
  tabla:     { background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  tablaTitle:{ fontSize: '1rem', fontWeight: 600, color: '#1e3a5f', marginBottom: '1rem' },
  tbl:       { width: '100%', borderCollapse: 'collapse' },
  th:        { textAlign: 'left', padding: '.75rem 1rem', fontSize: '.8rem', color: '#64748b', borderBottom: '2px solid #e2e8f0', fontWeight: 600 },
  td:        { padding: '.75rem 1rem', fontSize: '.9rem', borderBottom: '1px solid #f1f5f9' },
  badge:     { padding: '.25rem .75rem', borderRadius: '99px', fontSize: '.75rem', color: '#fff', fontWeight: 500 },
};
