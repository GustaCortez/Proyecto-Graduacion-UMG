import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout      from './components/Layout';
import Login       from './pages/auth/Login';
import Dashboard   from './pages/dashboard/Dashboard';
import Empleados   from './pages/empleados/Empleados';
import Expediente  from './pages/empleados/Expediente';
import Solicitudes from './pages/solicitudes/Solicitudes';
import Usuarios    from './pages/usuarios/Usuarios';
import Vacaciones  from './pages/vacaciones/Vacaciones';
import Reportes    from './pages/reportes/Reportes';
import MiPerfil       from './pages/perfil/MiPerfil';
import MisSolicitudes from './pages/solicitudes/MisSolicitudes';
import Auditoria      from './pages/auditoria/Auditoria';
import MisVacaciones  from './pages/vacaciones/MisVacaciones';

/**
 * soloRRHH  -> administracion y RRHH (gestion de personal)
 * soloAdmin -> unicamente el administrador (cuentas de usuario)
 * Debe reflejar exactamente lo que valida el backend; esto es comodidad de
 * navegacion, la autorizacion real esta en la API.
 */
const RutaProtegida = ({ children, soloRRHH, soloAdmin }) => {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (soloRRHH && !['admin','rrhh'].includes(usuario.rol)) return <Navigate to="/mis-solicitudes" replace />;
  if (soloAdmin && usuario.rol !== 'admin') return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
};

const RedirectPorRol = () => {
  const { usuario } = useAuth();
  if (['admin','rrhh'].includes(usuario?.rol)) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/mis-solicitudes" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard"       element={<RutaProtegida soloRRHH><Dashboard /></RutaProtegida>} />
          <Route path="/empleados"       element={<RutaProtegida soloRRHH><Empleados /></RutaProtegida>} />
          <Route path="/empleados/:id/expediente" element={<RutaProtegida soloRRHH><Expediente /></RutaProtegida>} />
          <Route path="/solicitudes"     element={<RutaProtegida soloRRHH><Solicitudes /></RutaProtegida>} />
          <Route path="/usuarios"        element={<RutaProtegida soloAdmin><Usuarios /></RutaProtegida>} />
          <Route path="/vacaciones"      element={<RutaProtegida soloRRHH><Vacaciones /></RutaProtegida>} />
          <Route path="/auditoria"       element={<RutaProtegida soloRRHH><Auditoria /></RutaProtegida>} />
          <Route path="/reportes"        element={<RutaProtegida soloRRHH><Reportes /></RutaProtegida>} />

          <Route path="/mis-solicitudes" element={<RutaProtegida><MisSolicitudes /></RutaProtegida>} />
          <Route path="/mis-vacaciones"  element={<RutaProtegida><MisVacaciones /></RutaProtegida>} />
          <Route path="/mi-perfil"       element={<RutaProtegida><MiPerfil /></RutaProtegida>} />

          <Route path="*" element={<RutaProtegida><RedirectPorRol /></RutaProtegida>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
