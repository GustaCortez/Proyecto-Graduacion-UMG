import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, FileText, UserCog,
  Umbrella, BarChart2, LogOut, Menu, X, ClipboardList, UserCircle, Banknote,
  ShieldCheck, CalendarDays
} from 'lucide-react';
import { useState } from 'react';
import Notificaciones from './Notificaciones';

const linksAdmin = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard'        },
  { to: '/empleados',        icon: Users,            label: 'Empleados'        },
  { to: '/solicitudes',      icon: FileText,         label: 'Solicitudes'      },
  { to: '/gestion-nomina',   icon: Banknote,         label: 'Nómina / Planilla'},
  { to: '/usuarios',         icon: UserCog,          label: 'Usuarios'         },
  { to: '/vacaciones',       icon: Umbrella,         label: 'Vacaciones'       },
  { to: '/asuetos',          icon: CalendarDays,     label: 'Asuetos'          },
  { to: '/auditoria',        icon: ShieldCheck,      label: 'Auditoría'        },
  { to: '/reportes',         icon: BarChart2,        label: 'Reportes'         },
];

const linksEmpleado = [
  { to: '/mis-solicitudes',  icon: ClipboardList,   label: 'Mis Solicitudes' },
  { to: '/mis-vacaciones',   icon: Umbrella,        label: 'Mis Vacaciones'  },
  { to: '/notas-pago',       icon: Banknote,        label: 'Notas de Pago'   },
  { to: '/mi-perfil',        icon: UserCircle,      label: 'Mi Perfil'       },
];

export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(true);

  // logout ahora también revoca el refresh token en el servidor, por eso es async.
  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  const esAdmin = ['admin', 'rrhh'].includes(usuario?.rol);
  const navLinks = esAdmin ? linksAdmin : linksEmpleado;

  return (
    <div style={s.wrap}>
      {/* Sidebar */}
      <aside style={{ ...s.sidebar, width: abierto ? '240px' : '68px' }}>
        {/* Logo */}
        <div style={s.logo}>
          <span style={s.logoIcon}></span>
          {abierto && <span style={s.logoText}>Muni Jalapa</span>}
          <button style={s.menuBtn} onClick={() => setAbierto(!abierto)}>
            {abierto ? <X size={18}/> : <Menu size={18}/>}
          </button>
        </div>

        {/* Etiqueta de rol */}
        {abierto && (
          <div style={s.rolBadge}>
            <span style={{ ...s.rolTag, background: esAdmin ? '#0d9488' : '#6366f1' }}>
              {usuario?.rol?.toUpperCase()}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav style={s.nav}>
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              ...s.link, ...(isActive ? s.linkActive : {})
            })}>
              <Icon size={20} style={{ flexShrink: 0 }}/>
              {abierto && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Usuario */}
        <div style={s.userBox}>
          {abierto && (
            <div style={s.userInfo}>
              <p style={s.userName}>{usuario?.nombre}</p>
              <p style={s.userRol}>{usuario?.rol}</p>
            </div>
          )}
          <button style={s.logoutBtn} onClick={handleLogout} title="Cerrar sesión">
            <LogOut size={18}/>
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div style={s.columna}>
        <header style={s.barra}>
          <Notificaciones />
        </header>
        <main style={s.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

const s = {
  wrap:       { display:'flex', minHeight:'100vh' },
  sidebar:    { background:'#1e3a5f', display:'flex', flexDirection:'column', transition:'width .25s', overflow:'hidden', flexShrink:0 },
  logo:       { display:'flex', alignItems:'center', gap:'.6rem', padding:'1.25rem 1rem', borderBottom:'1px solid rgba(255,255,255,.1)' },
  logoIcon:   { fontSize:'1.5rem', flexShrink:0 },
  logoText:   { color:'#fff', fontWeight:700, fontSize:'1rem', flex:1 },
  menuBtn:    { background:'transparent', border:'none', color:'#94b8e0', padding:'2px', marginLeft:'auto', display:'flex' },
  rolBadge:   { padding:'.5rem 1rem .25rem' },
  rolTag:     { fontSize:'.7rem', fontWeight:700, color:'#fff', padding:'.2rem .6rem', borderRadius:'99px', letterSpacing:'.05em' },
  nav:        { flex:1, padding:'.75rem .5rem', display:'flex', flexDirection:'column', gap:'.25rem' },
  link:       { display:'flex', alignItems:'center', gap:'.75rem', padding:'.65rem .75rem', borderRadius:'8px', color:'#94b8e0', fontSize:'.9rem', fontWeight:500, transition:'all .15s', textDecoration:'none' },
  linkActive: { background:'rgba(255,255,255,.12)', color:'#fff' },
  userBox:    { display:'flex', alignItems:'center', gap:'.5rem', padding:'1rem', borderTop:'1px solid rgba(255,255,255,.1)' },
  userInfo:   { flex:1, minWidth:0 },
  userName:   { color:'#fff', fontSize:'.85rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  userRol:    { color:'#94b8e0', fontSize:'.75rem', textTransform:'capitalize' },
  logoutBtn:  { background:'transparent', border:'none', color:'#94b8e0', display:'flex', padding:'4px', borderRadius:'6px', cursor:'pointer' },
  columna:    { flex:1, display:'flex', flexDirection:'column', minWidth:0 },
  barra:      { display:'flex', justifyContent:'flex-end', alignItems:'center', gap:'.75rem',
                background:'#1e3a5f', padding:'.5rem 1.5rem', borderBottom:'1px solid rgba(255,255,255,.1)' },
  main:       { flex:1, padding:'2rem', overflow:'auto' },
};
