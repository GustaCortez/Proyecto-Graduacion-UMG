import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Banknote, FilePlus, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const formVacio = {
  id_empleado: '', periodo: '', fecha_pago: '',
  salario_base: '', bonificacion: '', horas_extra: '',
  igss: '', otros_descuentos: '', total_neto: '', observaciones: '',
};

export default function GestionNotasPago() {
  const [notas, setNotas]         = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(formVacio);
  const [expandido, setExpandido] = useState(null);

  const cargar = () => api.get('/notas-pago').then(r => setNotas(r.data)).catch(() => {});

  useEffect(() => {
    cargar();
    api.get('/empleados').then(r => setEmpleados(r.data)).catch(() => {});
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: value };
      // Auto-calcular total neto
      const base     = parseFloat(updated.salario_base)     || 0;
      const bono     = parseFloat(updated.bonificacion)     || 0;
      const hExtra   = parseFloat(updated.horas_extra)      || 0;
      const igss     = parseFloat(updated.igss)             || 0;
      const otros    = parseFloat(updated.otros_descuentos) || 0;
      updated.total_neto = (base + bono + hExtra - igss - otros).toFixed(2);
      return updated;
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await api.post('/notas-pago', form);
      toast.success('Nota de pago registrada');
      setModal(false);
      setForm(formVacio);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar nota de pago');
    }
  };

  const fmt = val => Number(val || 0).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });

  // Agrupar por empleado para mejor visualización
  const porEmpleado = notas.reduce((acc, n) => {
    if (!acc[n.empleado]) acc[n.empleado] = [];
    acc[n.empleado].push(n);
    return acc;
  }, {});

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Gestión de Notas de Pago</h1>
          <p style={s.sub}>Registro de planilla quincenal por empleado</p>
        </div>
        <button style={s.btnAdd} onClick={() => setModal(true)}>
          <FilePlus size={18}/> Registrar Nota de Pago
        </button>
      </div>

      {/* Lista agrupada por empleado */}
      {!notas.length ? (
        <div style={s.vacio}>
          <Banknote size={40} color="#cbd5e1"/>
          <p style={{ color: '#94a3b8', marginTop: '.75rem' }}>No hay notas de pago registradas</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {Object.entries(porEmpleado).map(([empleado, lista]) => (
            <div key={empleado} style={s.grupo}>
              <button
                style={s.grupoHead}
                onClick={() => setExpandido(expandido === empleado ? null : empleado)}
              >
                <div style={s.avatarWrap}>
                  <span style={s.avatar}>{empleado.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={s.empNombre}>{empleado}</p>
                  <p style={s.empSub}>{lista.length} nota{lista.length !== 1 ? 's' : ''} de pago</p>
                </div>
                {expandido === empleado ? <ChevronUp size={18} color="#64748b"/> : <ChevronDown size={18} color="#64748b"/>}
              </button>

              {expandido === empleado && (
                <div style={s.tablaWrap}>
                  <table style={s.tbl}>
                    <thead>
                      <tr>
                        {['Período', 'Fecha pago', 'Salario base', 'Bonif.', 'H. Extra', 'IGSS', 'Otros desc.', 'Total neto'].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(n => (
                        <tr key={n.id}>
                          <td style={s.td}>{n.periodo}</td>
                          <td style={s.td}>{new Date(n.fecha_pago).toLocaleDateString('es-GT')}</td>
                          <td style={s.td}>{fmt(n.salario_base)}</td>
                          <td style={{ ...s.td, color: '#22c55e' }}>{fmt(n.bonificacion)}</td>
                          <td style={{ ...s.td, color: '#22c55e' }}>{fmt(n.horas_extra)}</td>
                          <td style={{ ...s.td, color: '#ef4444' }}>{fmt(n.igss)}</td>
                          <td style={{ ...s.td, color: '#ef4444' }}>{fmt(n.otros_descuentos)}</td>
                          <td style={{ ...s.td, fontWeight: 700, color: '#1e3a5f' }}>{fmt(n.total_neto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva nota de pago */}
      {modal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Registrar Nota de Pago</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div style={s.campo}>
                <label style={s.label}>Empleado</label>
                <select name="id_empleado" value={form.id_empleado} onChange={handleChange} required style={s.input}>
                  <option value="">Seleccionar empleado...</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>Período</label>
                  <input name="periodo" value={form.periodo} onChange={handleChange} required style={s.input}
                    placeholder="Ej: Primera quincena Mayo 2026"/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Fecha de pago</label>
                  <input name="fecha_pago" type="date" value={form.fecha_pago} onChange={handleChange} required style={s.input}/>
                </div>
              </div>

              <p style={s.seccion}>Ingresos</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>Salario base (Q)</label>
                  <input name="salario_base" type="number" step="0.01" min="0" value={form.salario_base}
                    onChange={handleChange} required style={s.input} placeholder="0.00"/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Bonificación (Q)</label>
                  <input name="bonificacion" type="number" step="0.01" min="0" value={form.bonificacion}
                    onChange={handleChange} style={s.input} placeholder="0.00"/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Horas extra (Q)</label>
                  <input name="horas_extra" type="number" step="0.01" min="0" value={form.horas_extra}
                    onChange={handleChange} style={s.input} placeholder="0.00"/>
                </div>
              </div>

              <p style={s.seccion}>Descuentos</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={s.campo}>
                  <label style={s.label}>IGSS (Q)</label>
                  <input name="igss" type="number" step="0.01" min="0" value={form.igss}
                    onChange={handleChange} style={s.input} placeholder="0.00"/>
                </div>
                <div style={s.campo}>
                  <label style={s.label}>Otros descuentos (Q)</label>
                  <input name="otros_descuentos" type="number" step="0.01" min="0" value={form.otros_descuentos}
                    onChange={handleChange} style={s.input} placeholder="0.00"/>
                </div>
              </div>

              <div style={{ ...s.campo, background: '#f0fdf4', borderRadius: '8px', padding: '.75rem 1rem' }}>
                <label style={{ ...s.label, color: '#166534' }}>Total neto (Q) — calculado automáticamente</label>
                <input name="total_neto" type="number" step="0.01" value={form.total_neto}
                  onChange={handleChange} required style={{ ...s.input, fontWeight: 700, fontSize: '1rem', color: '#166534' }}/>
              </div>

              <div style={s.campo}>
                <label style={s.label}>Observaciones (opcional)</label>
                <textarea name="observaciones" value={form.observaciones} onChange={handleChange}
                  rows={2} style={{ ...s.input, resize: 'vertical' }}/>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => { setModal(false); setForm(formVacio); }}>
                  Cancelar
                </button>
                <button type="submit" style={s.btnGuardar}>Guardar nota de pago</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  titulo:     { fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f' },
  sub:        { color: '#64748b' },
  btnAdd:     { display: 'flex', alignItems: 'center', gap: '.5rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '.75rem 1.25rem', fontWeight: 600, fontSize: '.9rem', cursor: 'pointer' },
  vacio:      { background: '#fff', borderRadius: '12px', padding: '3rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  grupo:      { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.1)' },
  grupoHead:  { width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.1rem 1.25rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' },
  avatarWrap: { background: '#1e3a5f', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatar:     { color: '#fff', fontWeight: 700, fontSize: '1rem' },
  empNombre:  { fontWeight: 600, color: '#1e293b', fontSize: '.95rem' },
  empSub:     { fontSize: '.78rem', color: '#64748b', marginTop: '.1rem' },
  tablaWrap:  { overflowX: 'auto', borderTop: '1px solid #f1f5f9' },
  tbl:        { width: '100%', borderCollapse: 'collapse' },
  th:         { textAlign: 'left', padding: '.65rem 1rem', fontSize: '.78rem', color: '#64748b', background: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap' },
  td:         { padding: '.7rem 1rem', fontSize: '.87rem', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:      { background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '1.5rem' },
  seccion:    { fontSize: '.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0' },
  campo:      { display: 'flex', flexDirection: 'column', gap: '.35rem' },
  label:      { fontSize: '.82rem', fontWeight: 600, color: '#374151' },
  input:      { padding: '.65rem .875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '.9rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btnCancelar:{ padding: '.7rem 1.5rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' },
  btnGuardar: { padding: '.7rem 1.5rem', border: 'none', borderRadius: '8px', background: '#1e3a5f', color: '#fff', fontWeight: 600, cursor: 'pointer' },
};
