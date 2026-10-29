import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import escudo from '../../assets/escudo-jalapa.png';
import toast from 'react-hot-toast';
import api, { mensajeDeError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [cargando, setCargando] = useState(false);
  /**
   * El servidor gratuito de Render se apaga sin uso y tarda en despertar. Si el
   * login lleva más de 5 segundos se avisa para que el usuario no crea que falló.
   */
  const [servidorLento, setServidorLento] = useState(false);
  const avisoRef = useRef(null);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const limpiarAviso = () => {
    if (avisoRef.current) { clearTimeout(avisoRef.current); avisoRef.current = null; }
    setServidorLento(false);
  };

  useEffect(() => () => { if (avisoRef.current) clearTimeout(avisoRef.current); }, []);

  const onSubmit = async (data) => {
    setCargando(true);
    avisoRef.current = setTimeout(() => setServidorLento(true), 5000);
    try {
      const res = await api.post('/auth/login', data);
      login(res.data.token, res.data.usuario, res.data.refreshToken);
      toast.success(`Bienvenido, ${res.data.usuario.nombre}`);
      const destino = ['admin','rrhh'].includes(res.data.usuario.rol) ? '/dashboard' : '/mis-solicitudes';
      navigate(destino);
    } catch (err) {
      toast.error(mensajeDeError(err, 'Error al iniciar sesión'));
    } finally {
      limpiarAviso();
      setCargando(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <img src={escudo} alt="Escudo de la Municipalidad de Jalapa" style={s.escudo} />
          <h1 style={s.titulo}>Municipalidad de Jalapa</h1>
          <p style={s.sub}>Sistema de Gestión de Recursos Humanos</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={s.form}>
          <div style={s.campo}>
            <label style={s.label}>Usuario</label>
            <input
              style={{ ...s.input, ...(errors.username ? s.inputError : {}) }}
              placeholder="Ingresa tu usuario"
              autoComplete="username"
              autoFocus
              {...register('username', { required: 'El usuario es requerido' })}
            />
            {errors.username && <span style={s.error}>{errors.username.message}</span>}
          </div>

          <div style={s.campo}>
            <label style={s.label}>Contraseña</label>
            <input
              type="password"
              style={{ ...s.input, ...(errors.password ? s.inputError : {}) }}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
              {...register('password', { required: 'La contraseña es requerida' })}
            />
            {errors.password && <span style={s.error}>{errors.password.message}</span>}
          </div>

          <button type="submit" style={s.btn} disabled={cargando}>
            {cargando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
          {cargando && servidorLento && (
            <p style={s.aviso}>El servidor está iniciando, puede tardar hasta un minuto...</p>
          )}
        </form>
      </div>
    </div>
  );
}

const s = {
  wrap:   { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#1e3a5f 0%,#2e5090 100%)', padding:'1rem' },
  card:   { background:'#fff', borderRadius:'16px', padding:'2.5rem', width:'100%', maxWidth:'420px', boxShadow:'0 20px 60px rgba(0,0,0,.3)' },
  header: { textAlign:'center', marginBottom:'2rem' },
  escudo: { width:'96px', height:'auto', display:'block', margin:'0 auto 1rem' },
  titulo: { fontSize:'1.4rem', fontWeight:700, color:'#1e3a5f', marginBottom:'.25rem' },
  sub:    { fontSize:'.85rem', color:'#64748b' },
  form:   { display:'flex', flexDirection:'column', gap:'1.25rem' },
  campo:  { display:'flex', flexDirection:'column', gap:'.4rem' },
  label:  { fontSize:'.85rem', fontWeight:600, color:'#374151' },
  input:  { padding:'.75rem 1rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'1rem', outline:'none', transition:'border .2s' },
  inputError: { borderColor:'#ef4444' },
  error:  { fontSize:'.78rem', color:'#ef4444' },
  btn:    { padding:'.85rem', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:'8px', fontSize:'1rem', fontWeight:600, marginTop:'.5rem', transition:'background .2s' },
  aviso:  { fontSize:'.82rem', color:'#64748b', textAlign:'center', marginTop:'-.5rem' },
};