import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout      from './components/Layout';
import Login       from './pages/auth/Login';
import Dashboard   from './pages/dashboard/Dashboard';
import Empleados   from './pages/empleados/Empleados';
import Solicitudes from './pages/solicitudes/Solicitudes';
import Usuarios    from './pages/usuarios/Usuarios';
import Vacaciones  from './pages/vacaciones/Vacaciones';
import Reportes    from './pages/reportes/Reportes';
import MiPerfil       from './pages/perfil/MiPerfil';
import MisSolicitudes from './pages/solicitudes/MisSolicitudes';
import NotasDePago      from './pages/notas-pago/NotasDePago';
import GestionNotasPago from './pages/notas-pago/GestionNotasPago';
import Asuetos        from './pages/asuetos/Asuetos';
import Auditoria      from './pages/auditoria/Auditoria';
import MisVacaciones  from './pages/vacaciones/MisVacaciones';

const RutaProtegida = ({ children, soloAdmin }) => {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (soloAdmin && !['admin','rrhh'].includes(usuario.rol)) return <Navigate to="/mis-solicitudes" replace />;
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

          {/* Solo admin/rrhh */}
          <Route path="/dashboard"       element={<RutaProtegida soloAdmin><Dashboard /></RutaProtegida>} />
          <Route path="/empleados"       element={<RutaProtegida soloAdmin><Empleados /></RutaProtegida>} />
          <Route path="/solicitudes"     element={<RutaProtegida soloAdmin><Solicitudes /></RutaProtegida>} />
          <Route path="/gestion-nomina"  element={<RutaProtegida soloAdmin><GestionNotasPago /></RutaProtegida>} />
          <Route path="/usuarios"        element={<RutaProtegida soloAdmin><Usuarios /></RutaProtegida>} />
          <Route path="/vacaciones"      element={<RutaProtegida soloAdmin><Vacaciones /></RutaProtegida>} />
          <Route path="/asuetos"         element={<RutaProtegida soloAdmin><Asuetos /></RutaProtegida>} />
          <Route path="/auditoria"       element={<RutaProtegida soloAdmin><Auditoria /></RutaProtegida>} />
          <Route path="/reportes"        element={<RutaProtegida soloAdmin><Reportes /></RutaProtegida>} />

          {/* Cualquier usuario autenticado */}
          <Route path="/mis-solicitudes" element={<RutaProtegida><MisSolicitudes /></RutaProtegida>} />
          <Route path="/mis-vacaciones"  element={<RutaProtegida><MisVacaciones /></RutaProtegida>} />
          <Route path="/notas-pago"      element={<RutaProtegida><NotasDePago /></RutaProtegida>} />
          <Route path="/mi-perfil"       element={<RutaProtegida><MiPerfil /></RutaProtegida>} />

          <Route path="*" element={<RutaProtegida><RedirectPorRol /></RutaProtegida>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
