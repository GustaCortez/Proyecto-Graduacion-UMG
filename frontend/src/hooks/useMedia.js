import { useEffect, useState } from 'react';

/**
 * Detecta el tamano de pantalla para adaptar la maquetacion.
 *
 * El proyecto usa estilos en linea, donde no existen las media queries de CSS,
 * asi que el punto de corte se evalua en JavaScript y los componentes eligen el
 * objeto de estilos que corresponde.
 *
 * Se escucha el cambio (no solo el ancho inicial) para que girar el telefono o
 * redimensionar la ventana reacomode la pantalla al instante.
 */
function useConsulta(consulta) {
  const [coincide, setCoincide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches);

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = (e) => setCoincide(e.matches);
    setCoincide(mq.matches);          // por si cambio entre el render y el efecto
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);

  return coincide;
}

/** Telefono: el menu lateral se oculta y las rejillas pasan a una columna. */
export const useEsMovil = () => useConsulta('(max-width: 768px)');

/** Pantalla estrecha de verdad: ademas se reduce el relleno y el tamano de letra. */
export const useEsMovilAngosto = () => useConsulta('(max-width: 480px)');

export default useConsulta;
