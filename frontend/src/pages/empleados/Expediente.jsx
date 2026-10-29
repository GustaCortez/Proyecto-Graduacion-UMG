import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { descargarComoUrl } from '../../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft, GraduationCap, ClipboardCheck, TriangleAlert, HeartPulse,
  Plus, Pencil, Trash2, Paperclip, Download, Upload, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useEsMovil } from '../../hooks/useMedia';
import { fechaCorta, fechaHoyISO } from '../../utils/fechas';

/**
 * Expediente del empleado: historial por persona que RRHH administra desde la
 * tabla de Empleados. No tiene entrada propia en el menú: es parte de la ficha.
 *
 * Las cuatro secciones se declaran como datos (campos del formulario y
 * columnas de la tabla) y un solo componente las dibuja. El backend valida con
 * la misma estructura en expediente.controller.js.
 */

const fmt = fechaCorta;
const rango = (a, b) => (b && b !== a ? `${fmt(a)} al ${fmt(b)}` : fmt(a));

const COLOR_RESULTADO = {
  'Excelente': '#16a34a', 'Muy bueno': '#0d9488', 'Satisfactorio': '#f59e0b', 'Necesita mejorar': '#ef4444',
};
const COLOR_LLAMADA = { Verbal: '#f59e0b', Escrita: '#f97316', Grave: '#dc2626' };
const COLOR_IGSS    = { Pendiente: '#f59e0b', Presentado: '#22c55e' };

const PUNTAJE = [1, 2, 3, 4, 5].map((n) => ({ v: String(n), l: `${n} - ${['Deficiente', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'][n - 1]}` }));

const Badge = ({ color, children }) => (
  <span style={{ ...s.badge, background: color || '#64748b' }}>{children}</span>
);

const SECCIONES = [
  {
    id: 'capacitaciones', label: 'Capacitaciones', icon: GraduationCap, color: '#0d9488',
    nombre: 'capacitación', vacio: 'Este empleado no tiene capacitaciones registradas.',
    campos: [
      { name: 'nombre',        label: 'Nombre del curso o evento', tipo: 'text', req: true, ancho: 2 },
      { name: 'institucion',   label: 'Institución que lo imparte', tipo: 'text' },
      { name: 'tipo',          label: 'Tipo', tipo: 'select',
        opciones: ['Curso', 'Taller', 'Diplomado', 'Seminario', 'Certificación', 'Otro'] },
      { name: 'modalidad',     label: 'Modalidad', tipo: 'select', opciones: ['Presencial', 'Virtual', 'Mixta'] },
      { name: 'fecha_inicio',  label: 'Fecha de inicio', tipo: 'date', req: true },
      { name: 'fecha_fin',     label: 'Fecha de fin', tipo: 'date' },
      { name: 'horas',         label: 'Horas', tipo: 'number', min: 0, step: 0.5 },
      { name: 'aprobada',      label: '¿La aprobó?', tipo: 'select', opciones: [{ v: 'true', l: 'Sí' }, { v: 'false', l: 'No' }] },
      { name: 'observaciones', label: 'Observaciones', tipo: 'textarea', ancho: 2, detalle: true },
    ],
    columnas: [
      { label: 'Capacitación', render: (r) => (<><strong>{r.nombre}</strong>{r.institucion && <div style={s.sec}>{r.institucion}</div>}</>) },
      { label: 'Tipo',   render: (r) => `${r.tipo} · ${r.modalidad}` },
      { label: 'Fechas', render: (r) => rango(r.fecha_inicio, r.fecha_fin) },
      { label: 'Horas',  render: (r) => (r.horas != null ? Number(r.horas) : '—') },
      { label: 'Resultado', render: (r) => <Badge color={r.aprobada ? '#22c55e' : '#94a3b8'}>{r.aprobada ? 'Aprobada' : 'No aprobada'}</Badge> },
    ],
  },
  {
    id: 'evaluaciones', label: 'Evaluaciones', icon: ClipboardCheck, color: '#6366f1',
    nombre: 'evaluación de desempeño', vacio: 'Este empleado todavía no ha sido evaluado.',
    nota: 'Cada criterio se califica de 1 (deficiente) a 5 (excelente). El promedio y el resultado los calcula el sistema.',
    campos: [
      { name: 'periodo',   label: 'Período evaluado', tipo: 'text', req: true, placeholder: 'Ej. 2026 - Primer semestre' },
      { name: 'fecha',     label: 'Fecha de la evaluación', tipo: 'date', req: true },
      { name: 'evaluador', label: 'Evaluador (jefe inmediato)', tipo: 'text', req: true, ancho: 2 },
      { name: 'puntualidad',     label: 'Puntualidad y asistencia', tipo: 'select', opciones: PUNTAJE, req: true },
      { name: 'responsabilidad', label: 'Responsabilidad',         tipo: 'select', opciones: PUNTAJE, req: true },
      { name: 'calidad_trabajo', label: 'Calidad del trabajo',     tipo: 'select', opciones: PUNTAJE, req: true },
      { name: 'trabajo_equipo',  label: 'Trabajo en equipo',       tipo: 'select', opciones: PUNTAJE, req: true },
      { name: 'iniciativa',      label: 'Iniciativa',              tipo: 'select', opciones: PUNTAJE, req: true },
      { name: 'fortalezas',   label: 'Fortalezas', tipo: 'textarea', detalle: true },
      { name: 'areas_mejora', label: 'Áreas de mejora', tipo: 'textarea', detalle: true },
      { name: 'compromisos',  label: 'Compromisos para el siguiente período', tipo: 'textarea', ancho: 2, detalle: true },
    ],
    columnas: [
      { label: 'Período',   render: (r) => <strong>{r.periodo}</strong> },
      { label: 'Fecha',     render: (r) => fmt(r.fecha) },
      { label: 'Evaluador', render: (r) => r.evaluador },
      { label: 'Promedio',  render: (r) => <strong style={{ color: COLOR_RESULTADO[r.resultado] }}>{Number(r.promedio).toFixed(2)} / 5</strong> },
      { label: 'Resultado', render: (r) => <Badge color={COLOR_RESULTADO[r.resultado]}>{r.resultado}</Badge> },
    ],
    detalleExtra: (r) => (
      <div style={s.criterios}>
        {[['Puntualidad', r.puntualidad], ['Responsabilidad', r.responsabilidad], ['Calidad', r.calidad_trabajo],
          ['Equipo', r.trabajo_equipo], ['Iniciativa', r.iniciativa]].map(([l, v]) => (
          <div key={l} style={s.criterio}><span style={s.criterioNum}>{v}</span><span style={s.criterioLabel}>{l}</span></div>
        ))}
      </div>
    ),
  },
  {
    id: 'llamadas', label: 'Llamadas de atención', icon: TriangleAlert, color: '#f97316',
    nombre: 'llamada de atención', vacio: 'Este empleado no tiene llamadas de atención.',
    campos: [
      { name: 'fecha',       label: 'Fecha', tipo: 'date', req: true },
      { name: 'tipo',        label: 'Tipo', tipo: 'select', opciones: ['Verbal', 'Escrita', 'Grave'] },
      { name: 'emitida_por', label: 'Emitida por', tipo: 'text', placeholder: 'Jefe inmediato, Director...' },
      { name: 'motivo',      label: 'Motivo', tipo: 'textarea', req: true, ancho: 2 },
      { name: 'sancion',     label: 'Sanción o medida aplicada', tipo: 'textarea', ancho: 2, detalle: true },
    ],
    columnas: [
      { label: 'Fecha',  render: (r) => fmt(r.fecha) },
      { label: 'Tipo',   render: (r) => <Badge color={COLOR_LLAMADA[r.tipo]}>{r.tipo}</Badge> },
      { label: 'Motivo', render: (r) => <span style={s.recorte}>{r.motivo}</span> },
      { label: 'Emitida por', render: (r) => r.emitida_por || '—' },
    ],
  },
  {
    id: 'bajas-igss', label: 'Baja IGSS', icon: HeartPulse, color: '#dc2626',
    nombre: 'aviso de baja ante el IGSS', vacio: 'No hay avisos de baja ante el IGSS. Se abre uno automáticamente al dar de baja al empleado.',
    nota: 'El aviso queda Pendiente hasta que RRHH presenta el formulario al IGSS. Al marcarlo Presentado indique la fecha y el número de aviso.',
    campos: [
      { name: 'fecha_baja',        label: 'Fecha de baja (último día laborado)', tipo: 'date', req: true },
      { name: 'motivo',            label: 'Motivo', tipo: 'select',
        opciones: ['Renuncia', 'Despido', 'Fin de contrato', 'Jubilación', 'Fallecimiento', 'Otro'] },
      { name: 'numero_afiliacion', label: 'Número de afiliación IGSS', tipo: 'text' },
      { name: 'estado',            label: 'Estado del aviso', tipo: 'select', opciones: ['Pendiente', 'Presentado'] },
      { name: 'fecha_aviso',       label: 'Fecha en que se presentó', tipo: 'date' },
      { name: 'numero_aviso',      label: 'Número de aviso / formulario', tipo: 'text' },
      { name: 'observaciones',     label: 'Observaciones', tipo: 'textarea', ancho: 2, detalle: true },
    ],
    columnas: [
      { label: 'Fecha de baja', render: (r) => fmt(r.fecha_baja) },
      { label: 'Motivo',        render: (r) => r.motivo },
      { label: 'Afiliación',    render: (r) => r.numero_afiliacion || <span style={s.sec}>sin número</span> },
      { label: 'Estado',        render: (r) => <Badge color={COLOR_IGSS[r.estado]}>{r.estado}</Badge> },
      { label: 'Aviso',         render: (r) => (r.estado === 'Presentado' ? `${fmt(r.fecha_aviso)}${r.numero_aviso ? ` · ${r.numero_aviso}` : ''}` : '—') },
    ],
  },
];

const hoy = fechaHoyISO;

const valorInicial = (c) => {
  if (c.tipo === 'date') return c.name.startsWith('fecha') && c.req ? hoy() : '';
  if (c.tipo === 'select') { const o = c.opciones[0]; return typeof o === 'string' ? o : o.v; }
  return '';
};

const formDe = (sec, registro) => Object.fromEntries(sec.campos.map((c) => {
  if (!registro) return [c.name, valorInicial(c)];
  const v = registro[c.name];
  if (v === null || v === undefined) return [c.name, ''];
  if (typeof v === 'boolean') return [c.name, String(v)];
  return [c.name, String(v)];
}));

export default function Expediente() {
  const { id } = useParams();
  const esMovil = useEsMovil();
  const [exp, setExp]           = useState(null);
  const [error, setError]       = useState(null);
  const [seccion, setSeccion]   = useState(SECCIONES[0].id);
  const [modal, setModal]       = useState(null); // { modo:'crear'|'editar', registro? }
  const [form, setForm]         = useState({});
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // registro a eliminar
  const [abierto, setAbierto]   = useState(null);   // id del registro expandido
  const [fotoUrl, setFotoUrl]   = useState(null);
  const urlRef = useRef(null);

  const sec = SECCIONES.find((x) => x.id === seccion) || SECCIONES[0];
  const registros = exp ? (exp[sec.id === 'bajas-igss' ? 'bajas_igss' : sec.id] || []) : [];

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(`/expediente/${id}`);
      setExp(data);
      if (data.empleado.foto_url && !urlRef.current) {
        try {
          const url = await descargarComoUrl(`/empleados/${id}/foto`);
          urlRef.current = url; setFotoUrl(url);
        } catch { /* sin foto */ }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el expediente.');
    }
  }, [id]);

  useEffect(() => {
    cargar();
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [cargar]);

  const abrirCrear  = () => { setForm(formDe(sec, null)); setModal({ modo: 'crear' }); };
  const abrirEditar = (r) => { setForm(formDe(sec, r)); setModal({ modo: 'editar', registro: r }); };
  const cerrar = () => { setModal(null); setConfirmar(null); };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      if (modal.modo === 'crear') {
        const { data } = await api.post(`/expediente/${id}/${sec.id}`, form);
        toast.success(data.mensaje);
      } else {
        const { data } = await api.put(`/expediente/${id}/${sec.id}/${modal.registro.id}`, form);
        toast.success(data.mensaje);
      }
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    try {
      const { data } = await api.delete(`/expediente/${id}/${sec.id}/${confirmar.id}`);
      toast.success(data.mensaje);
      if (abierto === confirmar.id) setAbierto(null);
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo eliminar.');
    }
  };

  if (error) {
    return (
      <div>
        <Link to="/empleados" style={s.volver}><ArrowLeft size={16} /> Volver a Empleados</Link>
        <p style={{ color: '#b91c1c', marginTop: '1rem' }}>{error}</p>
      </div>
    );
  }
  if (!exp) return <p style={s.cargando}>Cargando expediente...</p>;

  const { empleado: emp, resumen } = exp;
  const inicial = (emp.nombres || 'E')[0].toUpperCase();
  const alerta = resumen.llamadas_12_meses >= 3;

  const chips = [
    { icon: GraduationCap, color: '#0d9488', val: resumen.capacitaciones,
      label: `capacitación(es) · ${Number(resumen.horas_capacitacion || 0)} h` },
    { icon: ClipboardCheck, color: resumen.ultima_evaluacion ? COLOR_RESULTADO[resumen.ultima_evaluacion.resultado] : '#94a3b8',
      val: resumen.ultima_evaluacion ? `${resumen.ultima_evaluacion.promedio.toFixed(2)}` : '—',
      label: resumen.ultima_evaluacion ? `${resumen.ultima_evaluacion.resultado} · ${resumen.ultima_evaluacion.periodo}` : 'Sin evaluación' },
    { icon: TriangleAlert, color: alerta ? '#dc2626' : '#f97316', val: resumen.llamadas_12_meses,
      label: `llamada(s) en 12 meses${alerta ? ' · reincidente' : ''}` },
    ...(resumen.aviso_igss ? [{ icon: HeartPulse, color: COLOR_IGSS[resumen.aviso_igss.estado], val: resumen.aviso_igss.estado,
      label: `aviso IGSS · baja ${fmt(resumen.aviso_igss.fecha_baja)}` }] : []),
  ];

  return (
    <div>
      <Link to="/empleados" style={s.volver}><ArrowLeft size={16} /> Volver a Empleados</Link>

      <div style={{ ...s.cabecera, flexDirection: esMovil ? 'column' : 'row' }}>
        {fotoUrl ? <img src={fotoUrl} alt="" style={s.foto} /> : <div style={s.avatar}>{inicial}</div>}
        <div style={{ flex: 1 }}>
          <h1 style={s.titulo}>{emp.nombre_completo}</h1>
          <p style={s.sub}>
            <code style={s.code}>{emp.codigo_empleado}</code> · {emp.puesto} · {emp.departamento}
          </p>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
            <Badge color={emp.estado === 'Activo' ? '#22c55e' : '#ef4444'}>{emp.estado}</Badge>
            {emp.situacion && emp.situacion !== 'Activo' && <Badge color="#64748b">{emp.situacion}</Badge>}
            {emp.estado !== 'Activo' && emp.fecha_baja && (
              <span style={s.sec}>Baja el {fmt(emp.fecha_baja)}{emp.motivo_baja ? `: ${emp.motivo_baja}` : ''}</span>
            )}
          </div>
        </div>
      </div>

      <div style={s.chips}>
        {chips.map((c, i) => (
          <div key={i} style={s.chip}>
            <div style={{ ...s.chipIcon, background: c.color }}><c.icon size={18} color="#fff" /></div>
            <div>
              <p style={s.chipVal}>{c.val}</p>
              <p style={s.chipLabel}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={s.tabs}>
        {SECCIONES.map((x) => {
          const n = (exp[x.id === 'bajas-igss' ? 'bajas_igss' : x.id] || []).length;
          return (
            <button key={x.id} type="button" onClick={() => { setSeccion(x.id); setAbierto(null); }}
              style={{ ...s.tab, ...(x.id === seccion ? { borderBottom: `3px solid ${x.color}`, color: x.color } : {}) }}>
              <x.icon size={15} /> {x.label} <span style={s.tabNum}>{n}</span>
            </button>
          );
        })}
      </div>

      <div style={s.panel}>
        <div style={s.panelCabecera}>
          <div>
            <h2 style={s.panelTitulo}>{sec.label}</h2>
            {sec.nota && <p style={s.nota}>{sec.nota}</p>}
          </div>
          <button style={{ ...s.btnAdd, background: sec.color }} onClick={abrirCrear}>
            <Plus size={16} /> Registrar
          </button>
        </div>

        {registros.length === 0 ? (
          <p style={s.vacio}>{sec.vacio}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead>
                <tr>
                  {sec.columnas.map((c) => <th key={c.label} style={s.th}>{c.label}</th>)}
                  <th style={s.th}>Adjuntos</th>
                  <th style={s.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <Fila key={r.id} sec={sec} r={r} idEmpleado={id}
                    abierto={abierto === r.id}
                    onToggle={() => setAbierto(abierto === r.id ? null : r.id)}
                    onEditar={() => abrirEditar(r)}
                    onEliminar={() => setConfirmar(r)}
                    onCambio={cargar} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>
              {modal.modo === 'crear' ? 'Registrar' : 'Editar'} {sec.nombre}
            </h2>
            <p style={s.ayuda}>Para <strong>{emp.nombre_completo}</strong>. Los campos con <span style={s.req}>*</span> son obligatorios.</p>
            <form onSubmit={guardar}>
              <div style={{ ...s.formGrid, gridTemplateColumns: esMovil ? '1fr' : 'repeat(2, 1fr)' }}>
                {sec.campos.map((c) => (
                  <div key={c.name} style={{ ...s.campo, gridColumn: c.ancho === 2 && !esMovil ? 'span 2' : 'auto' }}>
                    <label style={s.label}>{c.label}{c.req && <span style={s.req}> *</span>}</label>
                    {c.tipo === 'select' ? (
                      <select style={s.input} value={form[c.name]} required={c.req}
                        onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}>
                        {c.opciones.map((o) => (typeof o === 'string'
                          ? <option key={o} value={o}>{o}</option>
                          : <option key={o.v} value={o.v}>{o.l}</option>))}
                      </select>
                    ) : c.tipo === 'textarea' ? (
                      <textarea style={{ ...s.input, resize: 'vertical' }} rows={3} value={form[c.name]} required={c.req}
                        placeholder={c.placeholder} onChange={(e) => setForm({ ...form, [c.name]: e.target.value })} />
                    ) : (
                      <input style={s.input} type={c.tipo} value={form[c.name]} required={c.req}
                        min={c.min} step={c.step} placeholder={c.placeholder}
                        onChange={(e) => setForm({ ...form, [c.name]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
              <div style={s.pie}>
                <button type="button" style={s.btnCancelar} onClick={cerrar}>Cancelar</button>
                <button type="submit" style={{ ...s.btnGuardar, background: sec.color }} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmar && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth: '420px' }}>
            <h2 style={{ ...s.modalTitle, color: '#dc2626' }}>Eliminar registro</h2>
            <p style={s.ayuda}>
              ¿Eliminar esta {sec.nombre} del expediente de <strong>{emp.nombre_completo}</strong>?
              También se borrarán sus adjuntos. Esta acción queda en la auditoría.
            </p>
            <div style={s.pie}>
              <button type="button" style={s.btnCancelar} onClick={cerrar}>Cancelar</button>
              <button type="button" style={{ ...s.btnGuardar, background: '#dc2626' }} onClick={eliminar}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fila de la tabla con su panel de detalle y adjuntos. */
function Fila({ sec, r, idEmpleado, abierto, onToggle, onEditar, onEliminar, onCambio }) {
  const [docs, setDocs]       = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef(null);
  const base = `/expediente/${idEmpleado}/${sec.id}/${r.id}/documentos`;

  const cargarDocs = useCallback(() => {
    api.get(base).then((x) => setDocs(x.data)).catch(() => setDocs([]));
  }, [base]);

  useEffect(() => { if (abierto && docs === null) cargarDocs(); }, [abierto, docs, cargarDocs]);

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const fd = new FormData();
    fd.append('documento', archivo);
    setSubiendo(true);
    try {
      await api.post(base, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Documento adjuntado.');
      cargarDocs(); onCambio();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo adjuntar el documento.');
    } finally {
      setSubiendo(false);
    }
  };

  const descargar = async (d) => {
    try {
      const url = await descargarComoUrl(`${base}/${d.id}`);
      const a = document.createElement('a');
      a.href = url; a.download = d.nombre_archivo; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('No se pudo descargar el documento.');
    }
  };

  const quitar = async (d) => {
    try {
      await api.delete(`${base}/${d.id}`);
      toast.success('Documento eliminado.');
      cargarDocs(); onCambio();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo eliminar el documento.');
    }
  };

  const camposDetalle = sec.campos.filter((c) => c.detalle && r[c.name]);
  const cols = sec.columnas.length + 2;

  return (
    <>
      <tr style={abierto ? s.trAbierta : undefined}>
        {sec.columnas.map((c) => <td key={c.label} style={s.td}>{c.render(r)}</td>)}
        <td style={s.td}>
          <button type="button" style={s.btnAdj} onClick={onToggle} title="Ver detalle y adjuntos">
            <Paperclip size={14} /> {r.adjuntos || 0} {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>
        <td style={s.td}>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button type="button" style={s.btnEdit} onClick={onEditar} title="Editar"><Pencil size={15} /></button>
            <button type="button" style={s.btnDel} onClick={onEliminar} title="Eliminar"><Trash2 size={15} /></button>
          </div>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={cols} style={s.detalle}>
            {sec.detalleExtra && sec.detalleExtra(r)}
            {camposDetalle.length > 0 && (
              <div style={s.detalleGrid}>
                {camposDetalle.map((c) => (
                  <div key={c.name}>
                    <p style={s.detalleLabel}>{c.label}</p>
                    <p style={s.detalleVal}>{r[c.name]}</p>
                  </div>
                ))}
              </div>
            )}
            <div style={s.adjCabecera}>
              <p style={s.detalleLabel}>Adjuntos (PDF o imagen, máximo 10 MB)</p>
              <button type="button" style={s.btnSubir} onClick={() => archivoRef.current?.click()} disabled={subiendo}>
                <Upload size={14} /> {subiendo ? 'Subiendo...' : 'Adjuntar'}
              </button>
              <input ref={archivoRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                style={{ display: 'none' }} onChange={subir} />
            </div>
            {docs === null ? <p style={s.sec}>Cargando...</p>
              : docs.length === 0 ? <p style={s.sec}>Sin documentos adjuntos.</p>
              : (
                <ul style={s.docs}>
                  {docs.map((d) => (
                    <li key={d.id} style={s.doc}>
                      <Paperclip size={14} color="#64748b" />
                      <span style={{ flex: 1, wordBreak: 'break-all' }}>{d.nombre_archivo}</span>
                      <span style={s.sec}>{Math.max(1, Math.round((d.tamano_bytes || 0) / 1024))} KB</span>
                      <button type="button" style={s.btnEdit} onClick={() => descargar(d)} title="Descargar"><Download size={14} /></button>
                      <button type="button" style={s.btnDel} onClick={() => quitar(d)} title="Eliminar"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            <p style={s.sec}>Registrado por {r.registrado_por_usuario || 'sistema'} el {new Date(r.creado_en).toLocaleString('es-GT')}.</p>
          </td>
        </tr>
      )}
    </>
  );
}

const s = {
  cargando:   { textAlign: 'center', padding: '3rem', color: '#64748b' },
  volver:     { display: 'inline-flex', alignItems: 'center', gap: '.35rem', color: '#2e5090', fontWeight: 600, fontSize: '.85rem', textDecoration: 'none', marginBottom: '1rem' },
  cabecera:   { display: 'flex', gap: '1.25rem', alignItems: 'center', background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)', marginBottom: '1rem' },
  foto:       { width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0', flexShrink: 0 },
  avatar:     { width: '80px', height: '80px', borderRadius: '50%', background: '#1e3a5f', color: '#fff', fontSize: '2rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titulo:     { fontSize: '1.4rem', fontWeight: 700, color: '#1e3a5f', margin: 0 },
  sub:        { color: '#64748b', marginTop: '.25rem' },
  code:       { background: '#f1f5f9', padding: '.15rem .5rem', borderRadius: '4px', fontSize: '.82rem' },
  sec:        { fontSize: '.78rem', color: '#94a3b8' },
  badge:      { padding: '.2rem .65rem', borderRadius: '99px', fontSize: '.72rem', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' },
  chips:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' },
  chip:       { background: '#fff', borderRadius: '12px', padding: '.9rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  chipIcon:   { borderRadius: '9px', padding: '.55rem', display: 'flex', flexShrink: 0 },
  chipVal:    { fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', margin: 0 },
  chipLabel:  { fontSize: '.75rem', color: '#64748b', margin: 0 },
  tabs:       { display: 'flex', flexWrap: 'wrap', gap: '.25rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1rem' },
  tab:        { display: 'flex', alignItems: 'center', gap: '.4rem', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: '3px solid transparent', padding: '.6rem .9rem', fontSize: '.85rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', marginBottom: '-2px' },
  tabNum:     { background: '#f1f5f9', color: '#475569', borderRadius: '99px', padding: '.05rem .5rem', fontSize: '.72rem' },
  panel:      { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  panelCabecera: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  panelTitulo: { fontSize: '1.05rem', fontWeight: 700, color: '#1e3a5f', margin: 0 },
  nota:       { fontSize: '.78rem', color: '#64748b', marginTop: '.3rem', lineHeight: 1.45, maxWidth: '620px' },
  btnAdd:     { display: 'flex', alignItems: 'center', gap: '.4rem', color: '#fff', border: 'none', borderRadius: '8px', padding: '.6rem 1rem', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  vacio:      { color: '#94a3b8', textAlign: 'center', padding: '2rem 1rem', fontSize: '.9rem' },
  tbl:        { width: '100%', borderCollapse: 'collapse', minWidth: '720px' },
  th:         { textAlign: 'left', padding: '.65rem .85rem', fontSize: '.78rem', color: '#64748b', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' },
  td:         { padding: '.65rem .85rem', fontSize: '.87rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', color: '#1e293b' },
  trAbierta:  { background: '#f8fafc' },
  recorte:    { display: 'inline-block', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' },
  btnAdj:     { display: 'inline-flex', alignItems: 'center', gap: '.25rem', background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '.3rem .55rem', fontSize: '.78rem', color: '#334155', fontWeight: 600, cursor: 'pointer' },
  btnEdit:    { background: '#dbeafe', border: 'none', borderRadius: '6px', padding: '5px', display: 'flex', color: '#2563eb', cursor: 'pointer' },
  btnDel:     { background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '5px', display: 'flex', color: '#dc2626', cursor: 'pointer' },
  detalle:    { background: '#f8fafc', padding: '1rem 1.25rem 1.1rem', borderBottom: '1px solid #e2e8f0' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.9rem', marginBottom: '1rem' },
  detalleLabel: { fontSize: '.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', margin: '0 0 .2rem' },
  detalleVal: { fontSize: '.87rem', color: '#1e293b', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.45 },
  criterios:  { display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' },
  criterio:   { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '.5rem .8rem', textAlign: 'center', minWidth: '96px' },
  criterioNum: { display: 'block', fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' },
  criterioLabel: { fontSize: '.7rem', color: '#64748b' },
  adjCabecera: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '.5rem', flexWrap: 'wrap' },
  btnSubir:   { display: 'inline-flex', alignItems: 'center', gap: '.35rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', padding: '.4rem .7rem', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' },
  docs:       { listStyle: 'none', padding: 0, margin: '0 0 .75rem', display: 'flex', flexDirection: 'column', gap: '.4rem' },
  doc:        { display: 'flex', alignItems: 'center', gap: '.6rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '.45rem .7rem', fontSize: '.85rem' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:      { background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '1.2rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '.5rem' },
  ayuda:      { fontSize: '.85rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.25rem' },
  req:        { color: '#dc2626' },
  formGrid:   { display: 'grid', gap: '1rem' },
  campo:      { display: 'flex', flexDirection: 'column', gap: '.35rem' },
  label:      { fontSize: '.82rem', fontWeight: 600, color: '#374151' },
  input:      { padding: '.65rem .875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '.9rem', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' },
  pie:        { display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' },
  btnCancelar: { padding: '.7rem 1.5rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' },
  btnGuardar: { padding: '.7rem 1.5rem', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' },
};
