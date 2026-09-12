import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { ChevronLeft, ChevronRight, Eye, ArrowRight, ChevronDown } from 'lucide-react';

/**
 * Rastro de auditoría: qué hizo cada usuario, cuándo, sobre qué registro y
 * desde qué IP.
 *
 * El detalle se guarda como JSON, pero quien consulta esta pantalla es personal
 * de RRHH, no un programador. Por eso se traduce a texto: cada acción tiene un
 * nombre legible, cada campo una etiqueta en español y los cambios de estado se
 * muestran como "antes -> después". El JSON original queda disponible en una
 * sección plegable, por si hace falta revisarlo tal cual quedó guardado.
 */

const ACCIONES = {
  LOGIN:             { etiqueta: 'Inicio de sesión',     color: '#22c55e' },
  LOGOUT:            { etiqueta: 'Cierre de sesión',     color: '#94a3b8' },
  LOGIN_FALLIDO:     { etiqueta: 'Intento fallido',      color: '#ef4444' },
  TOKEN_RENOVADO:    { etiqueta: 'Sesión renovada',      color: '#3b82f6' },
  TOKEN_REUSADO:     { etiqueta: 'Alerta de seguridad',  color: '#dc2626' },
  CREAR:             { etiqueta: 'Creación',             color: '#0d9488' },
  ACTUALIZAR:        { etiqueta: 'Actualización',        color: '#f59e0b' },
  ELIMINAR:          { etiqueta: 'Eliminación',          color: '#ef4444' },
  APROBAR:           { etiqueta: 'Aprobación',           color: '#16a34a' },
  RECHAZAR:          { etiqueta: 'Rechazo',              color: '#f97316' },
  CANCELAR:          { etiqueta: 'Cancelación',          color: '#94a3b8' },
  BAJA_EMPLEADO:     { etiqueta: 'Baja de empleado',     color: '#b91c1c' },
  RESET_PASSWORD:    { etiqueta: 'Cambio de contraseña', color: '#7c3aed' },
  CAMBIO_ESTADO:     { etiqueta: 'Cambio de estado',     color: '#6366f1' },
  AJUSTE_VACACIONES: { etiqueta: 'Ajuste de vacaciones', color: '#0891b2' },
  NOMINA_CREADA:     { etiqueta: 'Nómina registrada',    color: '#065f46' },
  SUBIR_DOCUMENTO:   { etiqueta: 'Documento adjuntado',  color: '#0369a1' },
};

const accionDe = (a) => ACCIONES[a] || { etiqueta: a, color: '#64748b' };

const TABLAS = {
  usuarios: 'Usuarios', empleados: 'Empleados', solicitudes: 'Solicitudes',
  vacaciones: 'Vacaciones', notas_pago: 'Nómina', documentos_adjuntos: 'Documentos',
  dias_feriados: 'Asuetos', refresh_tokens: 'Sesiones',
};

const ETIQUETAS = {
  tipo: 'Tipo de solicitud', tipo_solicitud: 'Tipo de solicitud',
  id_empleado: 'Empleado', empleado: 'Empleado', id_solicitud: 'Solicitud',
  dias_descontados: 'Días descontados', dias_habiles: 'Días hábiles',
  dias_asignados: 'Días asignados', dias_tomados: 'Días gozados',
  comentario: 'Comentario', motivo: 'Motivo', motivo_baja: 'Motivo de la baja',
  username: 'Usuario', rol: 'Rol', alcance: 'Alcance',
  sesiones_cerradas: 'Sesiones cerradas', anterior: 'Sesión anterior',
  fecha_inicio: 'Desde', fecha_fin: 'Hasta', fecha: 'Fecha',
  fecha_ingreso: 'Fecha de ingreso', codigo_empleado: 'Código',
  nombres: 'Nombres', apellidos: 'Apellidos', nombre: 'Nombre',
  bytes: 'Tamaño', mime: 'Tipo de archivo', campo: 'Campo modificado',
  anio: 'Año', empleados: 'Empleados', nuevos: 'Nuevos', generados: 'Generados',
  activo: 'Activo', telefono: 'Teléfono', correo: 'Correo',
  direccion: 'Dirección', salario_base: 'Salario base', estado: 'Estado',
  id_departamento: 'Departamento', id_puesto: 'Puesto',
  tipo_contrato: 'Tipo de contrato', vacaciones_generadas: 'Vacaciones generadas',
  antes: 'Antes', despues: 'Después',
};

const etiquetaDe = (k) => ETIQUETAS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const CAMPOS_APARTE = ['estado_anterior', 'estado_nuevo', 'id_empleado'];

const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Convierte un valor suelto del JSON en algo legible. */
function valorLegible(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (clave === 'bytes' && typeof valor === 'number') return kb(valor);
  if (clave === 'salario_base') return `Q${valor}`;
  return String(valor);
}

/** Traduce la IP de loopback, que al usuario no le dice nada. */
const ipLegible = (ip) =>
  ip === '::1' || ip === '127.0.0.1' ? 'Este equipo (local)' : ip || '—';

/** Frase que resume la acción, armada con lo que traiga el detalle. */
function resumen(r) {
  const d = r.detalle || {};
  const quien = r.responsable || 'Un usuario';
  const empleado = r.empleado_afectado || d.empleado;
  const nombreEmpleado = typeof empleado === 'object' && empleado
    ? `${empleado.nombres} ${empleado.apellidos}` : empleado;

  switch (r.accion) {
    case 'LOGIN':
      return `${quien} inició sesión en el sistema.`;
    case 'LOGIN_FALLIDO':
      return `Intento de inicio de sesión fallido con el usuario "${d.username}". Motivo: ${d.motivo}.`;
    case 'LOGOUT':
      return `${quien} cerró ${d.alcance === 'todas las sesiones'
        ? `todas sus sesiones (${d.cerradas}).` : 'su sesión.'}`;
    case 'TOKEN_RENOVADO':
      return `La sesión de ${quien} se renovó automáticamente.`;
    case 'TOKEN_REUSADO':
      return `Se detectó el reúso de una sesión ya revocada de ${quien}. `
           + `Por seguridad se cerraron ${d.sesiones_cerradas ?? 'todas las'} sesión(es).`;
    case 'APROBAR':
    case 'RECHAZAR':
    case 'CANCELAR': {
      const verbo = { APROBAR: 'aprobó', RECHAZAR: 'rechazó', CANCELAR: 'canceló' }[r.accion];
      let frase = `${quien} ${verbo} la solicitud #${r.registro_id}`;
      if (d.tipo) frase += ` de ${String(d.tipo).toLowerCase()}`;
      if (nombreEmpleado) frase += ` de ${nombreEmpleado}`;
      frase += '.';
      if (d.dias_descontados > 0) frase += ` Se descontaron ${d.dias_descontados} días hábiles del saldo.`;
      return frase;
    }
    case 'CREAR':
      if (r.tabla === 'solicitudes') {
        return `${quien} registró la solicitud #${r.registro_id}`
             + `${d.tipo ? ` de ${String(d.tipo).toLowerCase()}` : ''}`
             + `${nombreEmpleado ? ` para ${nombreEmpleado}` : ''}.`;
      }
      if (r.tabla === 'empleados') {
        return `${quien} dio de alta al empleado ${d.nombres || ''} ${d.apellidos || ''}`.trim() + '.';
      }
      if (r.tabla === 'dias_feriados') {
        if (d.nombre) return `${quien} registró el asueto "${d.nombre}".`;
        return d.generados > 0
          ? `${quien} cargó ${d.generados} asueto(s) nacional(es) para ${d.anio}.`
          : `${quien} revisó los asuetos de ${d.anio}; no había ninguno nuevo que cargar.`;
      }
      if (r.tabla === 'vacaciones') {
        return `${quien} generó los registros de vacaciones de ${d.anio} `
             + `(${d.nuevos} nuevos de ${d.empleados} empleados).`;
      }
      return `${quien} creó un registro en ${TABLAS[r.tabla] || r.tabla}.`;
    case 'ACTUALIZAR':
      if (d.campo === 'foto_url') return `${quien} actualizó su foto de perfil.`;
      return `${quien} actualizó el registro #${r.registro_id} de ${TABLAS[r.tabla] || r.tabla}.`;
    case 'BAJA_EMPLEADO':
      return `${quien} dio de baja a ${nombreEmpleado || `el empleado #${r.registro_id}`}.`;
    case 'AJUSTE_VACACIONES':
      return `${quien} ajustó manualmente el saldo de vacaciones de ${d.anio}.`;
    case 'SUBIR_DOCUMENTO':
      return `${quien} adjuntó el documento "${d.nombre}" a la solicitud #${d.id_solicitud}.`;
    case 'ELIMINAR':
      return `${quien} eliminó "${d.nombre || `el registro #${r.registro_id}`}" `
           + `de ${TABLAS[r.tabla] || r.tabla}.`;
    case 'CAMBIO_ESTADO':
      return `${quien} cambió el estado de un registro en ${TABLAS[r.tabla] || r.tabla}.`;
    default:
      return `${quien} realizó la acción ${accionDe(r.accion).etiqueta.toLowerCase()}.`;
  }
}

const LIMITE = 25;

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal]         = useState(0);
  const [pagina, setPagina]       = useState(1);
  const [acciones, setAcciones]   = useState([]);
  const [filtros, setFiltros]     = useState({ accion: '', tabla: '', desde: '', hasta: '' });
  const [cargando, setCargando]   = useState(true);
  const [detalle, setDetalle]     = useState(null);
  const [verJson, setVerJson]     = useState(false);

  useEffect(() => {
    api.get('/auditoria/acciones').then((r) => setAcciones(r.data)).catch(() => setAcciones([]));
  }, []);

  const cargar = useCallback(() => {
    setCargando(true);
    const params = new URLSearchParams({ pagina, limite: LIMITE });
    Object.entries(filtros).forEach(([k, v]) => { if (v) params.append(k, v); });

    api.get(`/auditoria?${params}`)
      .then((r) => { setRegistros(r.data.registros); setTotal(r.data.total); })
      .catch(() => { setRegistros([]); setTotal(0); })
      .finally(() => setCargando(false));
  }, [pagina, filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarFiltro = (campo, valor) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: valor }));
  };

  const abrir = (r) => { setDetalle(r); setVerJson(false); };

  const paginas = Math.max(1, Math.ceil(total / LIMITE));
  const fecha = (f) => new Date(f).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

  /** Campos del detalle que se muestran como lista, ya traducidos. */
  const camposDe = (d) => Object.entries(d || {})
    .filter(([k]) => !CAMPOS_APARTE.includes(k))
    .filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Auditoría</h1>
          <p style={s.sub}>Registro de acciones realizadas en el sistema</p>
        </div>
        <span style={s.total}>{total} registro(s)</span>
      </div>

      <div style={s.filtros}>
        <select style={s.select} value={filtros.accion} onChange={(e) => cambiarFiltro('accion', e.target.value)}>
          <option value="">Todas las acciones</option>
          {acciones.map((a) => <option key={a} value={a}>{accionDe(a).etiqueta}</option>)}
        </select>
        <select style={s.select} value={filtros.tabla} onChange={(e) => cambiarFiltro('tabla', e.target.value)}>
          <option value="">Todos los módulos</option>
          {Object.entries(TABLAS).map(([valor, nombre]) => (
            <option key={valor} value={valor}>{nombre}</option>
          ))}
        </select>
        <label style={s.label}>Desde</label>
        <input style={s.select} type="date" value={filtros.desde}
          onChange={(e) => cambiarFiltro('desde', e.target.value)} />
        <label style={s.label}>Hasta</label>
        <input style={s.select} type="date" value={filtros.hasta}
          onChange={(e) => cambiarFiltro('hasta', e.target.value)} />
      </div>

      {cargando ? <p style={s.cargando}>Cargando...</p> : (
        <div style={s.tabla}>
          <table style={s.tbl}>
            <thead>
              <tr>{['Fecha', 'Responsable', 'Acción', 'Módulo', 'Qué ocurrió', ''].map((h) => (
                <th key={h} style={s.th}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {registros.length === 0 && (
                <tr><td style={s.td} colSpan={6}>No hay registros que coincidan con el filtro.</td></tr>
              )}
              {registros.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#64748b' }}>{fecha(r.creado_en)}</td>
                  <td style={s.td}>
                    {r.responsable || '—'}
                    {r.rol && <span style={s.rol}>{r.rol}</span>}
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: accionDe(r.accion).color }}>
                      {accionDe(r.accion).etiqueta}
                    </span>
                  </td>
                  <td style={{ ...s.td, color: '#64748b' }}>{TABLAS[r.tabla] || r.tabla || '—'}</td>
                  <td style={s.tdResumen}>{resumen(r)}</td>
                  <td style={s.td}>
                    <button style={s.btnIcono} onClick={() => abrir(r)} title="Ver detalle">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={s.paginador}>
        <button style={s.btnPag} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          <ChevronLeft size={16} /> Anterior
        </button>
        <span style={s.pagTxt}>Página {pagina} de {paginas}</span>
        <button style={s.btnPag} disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
          Siguiente <ChevronRight size={16} />
        </button>
      </div>

      {detalle && (
        <div style={s.overlay} onClick={() => setDetalle(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <span style={{ ...s.badge, background: accionDe(detalle.accion).color }}>
              {accionDe(detalle.accion).etiqueta}
            </span>

            <p style={s.resumenModal}>{resumen(detalle)}</p>

            <div style={s.meta}>
              <div><span style={s.metaEtiqueta}>Responsable</span>
                <span style={s.metaValor}>{detalle.responsable || '—'}{detalle.rol ? ` (${detalle.rol})` : ''}</span></div>
              <div><span style={s.metaEtiqueta}>Fecha y hora</span>
                <span style={s.metaValor}>{fecha(detalle.creado_en)}</span></div>
              <div><span style={s.metaEtiqueta}>Origen</span>
                <span style={s.metaValor}>{ipLegible(detalle.ip)}</span></div>
              <div><span style={s.metaEtiqueta}>Módulo</span>
                <span style={s.metaValor}>
                  {TABLAS[detalle.tabla] || detalle.tabla || '—'}
                  {detalle.registro_id ? ` · registro #${detalle.registro_id}` : ''}
                </span></div>
            </div>

            {/* Cambio de estado, destacado aparte */}
            {detalle.detalle?.estado_anterior && detalle.detalle?.estado_nuevo && (
              <div style={s.cambio}>
                <span style={s.estadoAntes}>{detalle.detalle.estado_anterior}</span>
                <ArrowRight size={16} color="#94a3b8" />
                <span style={s.estadoDespues}>{detalle.detalle.estado_nuevo}</span>
              </div>
            )}

            {/* Empleado afectado, resuelto a nombre */}
            {detalle.empleado_afectado && (
              <div style={s.fila}>
                <span style={s.filaEtiqueta}>Empleado</span>
                <span style={s.filaValor}>{detalle.empleado_afectado}</span>
              </div>
            )}

            {camposDe(detalle.detalle).map(([clave, valor]) => (
              typeof valor === 'object' && !Array.isArray(valor) ? (
                <div key={clave} style={s.bloque}>
                  <span style={s.bloqueTitulo}>{etiquetaDe(clave)}</span>
                  {Object.entries(valor).map(([k2, v2]) => (
                    <div key={k2} style={s.fila}>
                      <span style={s.filaEtiqueta}>{etiquetaDe(k2)}</span>
                      <span style={s.filaValor}>{valorLegible(k2, v2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div key={clave} style={s.fila}>
                  <span style={s.filaEtiqueta}>{etiquetaDe(clave)}</span>
                  <span style={s.filaValor}>{valorLegible(clave, valor)}</span>
                </div>
              )
            ))}

            {/* El JSON original queda a mano, pero fuera de la vista por defecto */}
            <button style={s.verJson} onClick={() => setVerJson((v) => !v)}>
              <ChevronDown size={14} style={{ transform: verJson ? 'rotate(180deg)' : 'none' }} />
              {verJson ? 'Ocultar' : 'Ver'} datos técnicos
            </button>
            {verJson && <pre style={s.pre}>{JSON.stringify(detalle.detalle, null, 2)}</pre>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button style={s.btnCerrar} onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                marginBottom:'1.25rem', gap:'1rem', flexWrap:'wrap' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b' },
  total:      { fontSize:'.85rem', color:'#64748b' },
  filtros:    { display:'flex', alignItems:'center', gap:'.6rem', marginBottom:'1rem', flexWrap:'wrap' },
  label:      { fontSize:'.8rem', fontWeight:600, color:'#374151' },
  select:     { padding:'.5rem .7rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                fontSize:'.85rem', outline:'none', background:'#fff' },
  cargando:   { color:'#64748b' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse', minWidth:'900px' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b',
                background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600, whiteSpace:'nowrap' },
  td:         { padding:'.7rem 1rem', fontSize:'.88rem', borderBottom:'1px solid #f1f5f9',
                verticalAlign:'top' },
  tdResumen:  { padding:'.7rem 1rem', fontSize:'.85rem', borderBottom:'1px solid #f1f5f9',
                color:'#334155', lineHeight:1.45, minWidth:'280px', verticalAlign:'top' },
  rol:        { display:'block', fontSize:'.72rem', color:'#94a3b8', textTransform:'capitalize' },
  badge:      { display:'inline-block', padding:'.22rem .7rem', borderRadius:'99px', fontSize:'.72rem',
                color:'#fff', fontWeight:700, whiteSpace:'nowrap' },
  btnIcono:   { background:'#e0f2fe', border:'none', borderRadius:'6px', padding:'5px',
                display:'flex', color:'#0369a1', cursor:'pointer' },
  paginador:  { display:'flex', alignItems:'center', justifyContent:'center', gap:'1rem', marginTop:'1rem' },
  btnPag:     { display:'flex', alignItems:'center', gap:'.25rem', padding:'.5rem .9rem',
                border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff',
                color:'#334155', fontWeight:600, cursor:'pointer' },
  pagTxt:     { fontSize:'.85rem', color:'#64748b' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex',
                alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'1.75rem', width:'100%',
                maxWidth:'560px', maxHeight:'85vh', overflowY:'auto' },
  resumenModal:{ fontSize:'1rem', color:'#1e293b', lineHeight:1.55, margin:'.85rem 0 1.25rem',
                fontWeight:500 },
  meta:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
                gap:'.85rem', padding:'1rem', background:'#f8fafc', borderRadius:'10px',
                marginBottom:'1.25rem' },
  metaEtiqueta:{ display:'block', fontSize:'.72rem', color:'#94a3b8', marginBottom:'.15rem' },
  metaValor:  { display:'block', fontSize:'.85rem', color:'#1e293b', fontWeight:600 },
  cambio:     { display:'flex', alignItems:'center', justifyContent:'center', gap:'.85rem',
                padding:'.9rem', border:'1.5px solid #e2e8f0', borderRadius:'10px',
                marginBottom:'1rem' },
  estadoAntes:{ fontSize:'.9rem', color:'#94a3b8', textDecoration:'line-through' },
  estadoDespues:{ fontSize:'.95rem', color:'#1e3a5f', fontWeight:700 },
  fila:       { display:'flex', justifyContent:'space-between', gap:'1rem',
                padding:'.6rem 0', borderBottom:'1px solid #f1f5f9' },
  filaEtiqueta:{ fontSize:'.83rem', color:'#64748b', flexShrink:0 },
  filaValor:  { fontSize:'.88rem', color:'#1e293b', fontWeight:600, textAlign:'right',
                wordBreak:'break-word' },
  bloque:     { border:'1.5px solid #e2e8f0', borderRadius:'10px', padding:'.75rem 1rem',
                marginTop:'.75rem' },
  bloqueTitulo:{ display:'block', fontSize:'.75rem', color:'#94a3b8', fontWeight:700,
                textTransform:'uppercase', letterSpacing:'.04em', marginBottom:'.35rem' },
  verJson:    { display:'flex', alignItems:'center', gap:'.35rem', background:'transparent',
                border:'none', color:'#64748b', fontSize:'.78rem', fontWeight:600,
                cursor:'pointer', marginTop:'1.25rem', padding:0 },
  pre:        { background:'#0f172a', color:'#e2e8f0', padding:'1rem', borderRadius:'10px',
                fontSize:'.75rem', overflowX:'auto', lineHeight:1.5, marginTop:'.5rem' },
  btnCerrar:  { padding:'.6rem 1.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
                background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
};
