import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, FileText, UserCog,
  Umbrella, BarChart2, Power, Menu, X, ClipboardList, UserCircle,
  ShieldCheck, Landmark
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Notificaciones from './Notificaciones';
import { useEsMovil } from '../hooks/useMedia';

/** `admin` marca los enlaces reservados al administrador (cuentas de usuario). */
const linksGestion = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard'        },
  { to: '/empleados',        icon: Users,            label: 'Empleados'        },
  { to: '/solicitudes',      icon: FileText,         label: 'Solicitudes'      },
  { to: '/usuarios',         icon: UserCog,          label: 'Usuarios', admin: true },
  { to: '/vacaciones',       icon: Umbrella,         label: 'Vacaciones'       },
  { to: '/auditoria',        icon: ShieldCheck,      label: 'Auditoría'        },
  { to: '/reportes',         icon: BarChart2,        label: 'Reportes'         },
];

const linksEmpleado = [
  { to: '/mis-solicitudes',  icon: ClipboardList,   label: 'Mis Solicitudes' },
  { to: '/mis-vacaciones',   icon: Umbrella,        label: 'Mis Vacaciones'  },
  { to: '/mi-perfil',        icon: UserCircle,      label: 'Mi Perfil'       },
];

export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const ruta = useLocation().pathname;
  const esMovil = useEsMovil();

  /**
   * En escritorio la barra lateral esta fija y solo se encoge a iconos.
   * En telefono ocuparia media pantalla, asi que se convierte en un panel que
   * aparece sobre el contenido y se cierra al elegir una opcion.
   */
  const [abierto, setAbierto] = useState(true);

  // Al pasar a telefono se cierra; al volver a escritorio se muestra de nuevo.
  useEffect(() => { setAbierto(!esMovil); }, [esMovil]);

  // Navegar en telefono cierra el panel: si no, tapa la pantalla recien abierta.
  useEffect(() => { if (esMovil) setAbierto(false); }, [ruta, esMovil]);

  // Con el panel abierto en telefono se bloquea el desplazamiento del fondo.
  useEffect(() => {
    if (!esMovil) return undefined;
    document.body.style.overflow = abierto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [esMovil, abierto]);

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  const esGestion = ['admin', 'rrhh'].includes(usuario?.rol);
  const navLinks = esGestion
    ? linksGestion.filter((l) => !l.admin || usuario?.rol === 'admin')
    : linksEmpleado;

  // En telefono el panel siempre va completo: media barra de iconos no se lee.
  const anchoBarra = esMovil ? '250px' : (abierto ? '240px' : '68px');
  const mostrarTexto = esMovil ? true : abierto;

  const estiloBarra = esMovil
    ? { ...s.sidebar, ...s.sidebarMovil, width: anchoBarra,
        transform: abierto ? 'translateX(0)' : 'translateX(-100%)' }
    : { ...s.sidebar, width: anchoBarra };

  return (
    <div style={s.wrap}>
      {/* Capa oscura: en telefono cierra el panel al tocar fuera. */}
      {esMovil && abierto && (
        <div style={s.capa} onClick={() => setAbierto(false)} aria-hidden="true" />
      )}

      <aside style={estiloBarra}>
        <div style={s.logo}>
          <Landmark size={22} color="#94b8e0" style={{ flexShrink: 0 }} />
          {mostrarTexto && <span style={s.logoText}>Muni Jalapa</span>}
          {/* En telefono el boton de abrir vive en la barra superior. */}
          {!esMovil && (
            <button style={s.menuBtn} onClick={() => setAbierto(!abierto)}
              title={abierto ? 'Contraer menú' : 'Expandir menú'}>
              {abierto ? <X size={18}/> : <Menu size={18}/>}
            </button>
          )}
          {esMovil && (
            <button style={s.menuBtn} onClick={() => setAbierto(false)} title="Cerrar menú">
              <X size={18}/>
            </button>
          )}
        </div>

        {mostrarTexto && (
          <div style={s.rolBadge}>
            <span style={{ ...s.rolTag, background: esGestion ? '#0d9488' : '#6366f1' }}>
              {usuario?.rol?.toUpperCase()}
            </span>
          </div>
        )}

        <nav style={s.nav}>
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              ...s.link, ...(isActive ? s.linkActive : {})
            })}>
              <Icon size={20} style={{ flexShrink: 0 }}/>
              {mostrarTexto && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* El cierre de sesión vive ahora en la barra superior, junto a la campana. */}
        {mostrarTexto && (
          <div style={s.userBox}>
            <div style={s.userInfo}>
              <p style={s.userName}>{usuario?.nombre}</p>
              <p style={s.userRol}>{usuario?.rol}</p>
            </div>
          </div>
        )}
      </aside>

      <div style={s.columna}>
        <header style={{ ...s.barra, justifyContent: esMovil ? 'space-between' : 'flex-end' }}>
          {esMovil && (
            <button style={s.menuMovil} onClick={() => setAbierto(true)} title="Abrir menú"
              aria-label="Abrir menú">
              <Menu size={20}/>
            </button>
          )}
          <div style={s.acciones}>
            <Notificaciones />
            {/* Mismo simbolo de encendido que usa Windows (IEC 60417-5009). */}
            <button className="btn-apagado" onClick={handleLogout}
              title="Cerrar sesión" aria-label="Cerrar sesión">
              <Power size={18} strokeWidth={2.25} />
            </button>
          </div>
        </header>
        <main style={{ ...s.main, padding: esMovil ? '1rem' : '2rem' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

const s = {
  wrap:       { display:'flex', minHeight:'100vh' },
  sidebar:    { background:'#1e3a5f', display:'flex', flexDirection:'column', transition:'width .25s', overflow:'hidden', flexShrink:0 },
  // Sobre el contenido, no al lado: en telefono no hay espacio para ambos.
  sidebarMovil: { position:'fixed', top:0, left:0, bottom:0, zIndex:60,
                  transition:'transform .25s ease', boxShadow:'4px 0 24px rgba(0,0,0,.35)' },
  capa:       { position:'fixed', inset:0, background:'rgba(15,23,42,.5)', zIndex:50 },
  logo:       { display:'flex', alignItems:'center', gap:'.6rem', padding:'1.25rem 1rem', borderBottom:'1px solid rgba(255,255,255,.1)' },
  logoText:   { color:'#fff', fontWeight:700, fontSize:'1rem', flex:1 },
  menuBtn:    { background:'transparent', border:'none', color:'#94b8e0', padding:'2px', marginLeft:'auto', display:'flex' },
  menuMovil:  { background:'transparent', border:'none', color:'#fff', display:'flex',
                padding:'.35rem', borderRadius:'6px', cursor:'pointer' },
  rolBadge:   { padding:'.5rem 1rem .25rem' },
  rolTag:     { fontSize:'.7rem', fontWeight:700, color:'#fff', padding:'.2rem .6rem', borderRadius:'99px', letterSpacing:'.05em' },
  nav:        { flex:1, padding:'.75rem .5rem', display:'flex', flexDirection:'column', gap:'.25rem', overflowY:'auto' },
  link:       { display:'flex', alignItems:'center', gap:'.75rem', padding:'.65rem .75rem', borderRadius:'8px', color:'#94b8e0', fontSize:'.9rem', fontWeight:500, transition:'all .15s', textDecoration:'none' },
  linkActive: { background:'rgba(255,255,255,.12)', color:'#fff' },
  userBox:    { display:'flex', alignItems:'center', gap:'.5rem', padding:'1rem', borderTop:'1px solid rgba(255,255,255,.1)' },
  userInfo:   { flex:1, minWidth:0 },
  userName:   { color:'#fff', fontSize:'.85rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  userRol:    { color:'#94b8e0', fontSize:'.75rem', textTransform:'capitalize' },
  acciones:   { display:'flex', alignItems:'center', gap:'.5rem', marginLeft:'auto' },
  columna:    { flex:1, display:'flex', flexDirection:'column', minWidth:0 },
  barra:      { display:'flex', alignItems:'center', gap:'.75rem',
                background:'#1e3a5f', padding:'.5rem 1rem', borderBottom:'1px solid rgba(255,255,255,.1)' },
  main:       { flex:1, overflow:'auto', minWidth:0 },
};
