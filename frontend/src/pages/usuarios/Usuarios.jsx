import { useEffect, useState } from 'react';
import api from '../../services/api';
import { UserPlus, ToggleLeft, ToggleRight, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

const formVacio = { username:'', password:'', rol:'empleado', id_empleado:'' };

export default function Usuarios() {
  const [usuarios, setUsuarios]     = useState([]);
  const [empleados, setEmpleados]   = useState([]);
  const [modal, setModal]           = useState(null); // 'crear' | 'password'
  const [seleccionado, setSeleccionado] = useState(null);
  const [form, setForm]             = useState(formVacio);
  const [nuevaPwd, setNuevaPwd]     = useState('');

  const cargar = () => api.get('/usuarios').then(r => setUsuarios(r.data)).catch(() => {});

  useEffect(() => {
    cargar();
    api.get('/empleados').then(r => setEmpleados(r.data)).catch(() => {});
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCrear = async e => {
    e.preventDefault();
    try {
      await api.post('/usuarios', form);
      toast.success('Usuario creado');
      setModal(null);
      setForm(formVacio);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear usuario');
    }
  };

  const toggleEstado = async (u) => {
    try {
      await api.patch(`/usuarios/${u.id}/estado`);
      toast.success(`Usuario ${u.activo ? 'desactivado' : 'activado'}`);
      cargar();
    } catch (err) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleResetPwd = async e => {
    e.preventDefault();
    try {
      await api.patch(`/usuarios/${seleccionado.id}/password`, { password: nuevaPwd });
      toast.success('Contraseña actualizada');
      setModal(null);
      setNuevaPwd('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar contraseña');
    }
  };

  const coloresRol = { admin:'#1e3a5f', rrhh:'#0d9488', empleado:'#6366f1' };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.titulo}>Usuarios</h1>
          <p style={s.sub}>Cuentas de acceso al sistema</p>
        </div>
        <button style={s.btnAdd} onClick={() => { setForm(formVacio); setModal('crear'); }}>
          <UserPlus size={18}/> Nuevo Usuario
        </button>
      </div>

      <div style={s.tabla}>
        <table style={s.tbl}>
          <thead>
            <tr>
              {['Usuario','Nombre','Correo','Rol','Estado','Último acceso','Acciones'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td style={s.td}><code style={s.code}>{u.username}</code></td>
                <td style={s.td}>{u.nombres ? `${u.nombres} ${u.apellidos}` : '—'}</td>
                <td style={s.td}>{u.correo || '—'}</td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: coloresRol[u.rol] }}>{u.rol}</span>
                </td>
                <td style={s.td}>
                  <span style={{ ...s.badge, background: u.activo ? '#22c55e' : '#94a3b8' }}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={s.td}>
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-GT') : 'Nunca'}
                </td>
                <td style={s.td}>
                  <div style={{ display:'flex', gap:'.4rem' }}>
                    <button style={u.activo ? s.btnDesact : s.btnAct}
                      onClick={() => toggleEstado(u)} title={u.activo ? 'Desactivar' : 'Activar'}>
                      {u.activo ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                    </button>
                    <button style={s.btnPwd} onClick={() => { setSeleccionado(u); setNuevaPwd(''); setModal('password'); }}
                      title="Cambiar contraseña">
                      <KeyRound size={15}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!usuarios.length && (
          <p style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>No hay usuarios registrados</p>
        )}
      </div>

      {/* Modal Crear */}
      {modal === 'crear' && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth:'460px' }}>
            <h2 style={s.modalTitle}>Nuevo Usuario</h2>
            <form onSubmit={handleCrear} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Nombre de usuario</label>
                <input name="username" value={form.username} onChange={handleChange} required style={s.input} placeholder="ej: jgonzalez"/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Contraseña</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} required style={s.input} placeholder="Mínimo 6 caracteres"/>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Rol</label>
                <select name="rol" value={form.rol} onChange={handleChange} style={s.input}>
                  <option value="empleado">Empleado</option>
                  <option value="rrhh">RRHH</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div style={s.campo}>
                <label style={s.label}>Empleado asociado (opcional)</label>
                <select name="id_empleado" value={form.id_empleado} onChange={handleChange} style={s.input}>
                  <option value="">Sin asociar</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" style={s.btnGuardar}>Crear usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cambiar Contraseña */}
      {modal === 'password' && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, maxWidth:'380px' }}>
            <h2 style={s.modalTitle}>Cambiar Contraseña</h2>
            <p style={{ color:'#64748b', marginBottom:'1rem' }}>Usuario: <strong>{seleccionado?.username}</strong></p>
            <form onSubmit={handleResetPwd} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div style={s.campo}>
                <label style={s.label}>Nueva contraseña</label>
                <input type="password" value={nuevaPwd} onChange={e => setNuevaPwd(e.target.value)}
                  required minLength={6} style={s.input} placeholder="Mínimo 6 caracteres"/>
              </div>
              <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
                <button type="button" style={s.btnCancelar} onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" style={s.btnGuardar}>Actualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' },
  titulo:     { fontSize:'1.5rem', fontWeight:700, color:'#1e3a5f' },
  sub:        { color:'#64748b' },
  btnAdd:     { display:'flex', alignItems:'center', gap:'.5rem', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:'8px', padding:'.75rem 1.25rem', fontWeight:600, fontSize:'.9rem', cursor:'pointer' },
  tabla:      { background:'#fff', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.1)' },
  tbl:        { width:'100%', borderCollapse:'collapse' },
  th:         { textAlign:'left', padding:'.75rem 1rem', fontSize:'.8rem', color:'#64748b', background:'#f8fafc', borderBottom:'2px solid #e2e8f0', fontWeight:600 },
  td:         { padding:'.75rem 1rem', fontSize:'.9rem', borderBottom:'1px solid #f1f5f9' },
  code:       { background:'#f1f5f9', padding:'.15rem .5rem', borderRadius:'4px', fontSize:'.82rem' },
  badge:      { padding:'.25rem .75rem', borderRadius:'99px', fontSize:'.75rem', color:'#fff', fontWeight:500 },
  btnAct:     { background:'#dcfce7', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#16a34a', cursor:'pointer' },
  btnDesact:  { background:'#fee2e2', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#dc2626', cursor:'pointer' },
  btnPwd:     { background:'#fef3c7', border:'none', borderRadius:'6px', padding:'5px', display:'flex', color:'#d97706', cursor:'pointer' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' },
  modal:      { background:'#fff', borderRadius:'16px', padding:'2rem', width:'100%', maxHeight:'90vh', overflowY:'auto' },
  modalTitle: { fontSize:'1.25rem', fontWeight:700, color:'#1e3a5f', marginBottom:'1.5rem' },
  campo:      { display:'flex', flexDirection:'column', gap:'.35rem' },
  label:      { fontSize:'.82rem', fontWeight:600, color:'#374151' },
  input:      { padding:'.65rem .875rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'.9rem', outline:'none', width:'100%', boxSizing:'border-box' },
  btnCancelar:{ padding:'.7rem 1.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer' },
  btnGuardar: { padding:'.7rem 1.5rem', border:'none', borderRadius:'8px', background:'#1e3a5f', color:'#fff', fontWeight:600, cursor:'pointer' },
};
