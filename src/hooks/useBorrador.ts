import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { database } from '../db/database';

export type BorradorPendiente<T> = {
  datos: T;
  paso: number;
  updated_at: string;
};

type Options<T> = {
  tipo: string;
  clave: string;
  datos: T;
  paso: number;
  activo?: boolean;
};

export function useBorrador<T>({ tipo, clave, datos, paso, activo = true }: Options<T>) {
  const datosRef = useRef(datos);
  const pasoRef = useRef(paso);
  const listoRef = useRef(false);
  const decididoRef = useRef(false);
  const finalizadoRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [pendiente, setPendiente] = useState<BorradorPendiente<T> | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    datosRef.current = datos;
    pasoRef.current = paso;
  }, [datos, paso]);

  useEffect(() => {
    let cancelado = false;
    if (!activo) return undefined;
    finalizadoRef.current = false;
    void database.obtenerBorrador<T>(tipo, clave).then((existente) => {
      if (cancelado) return;
      setPendiente(existente);
      listoRef.current = !existente;
      decididoRef.current = !existente;
      setListo(true);
    });
    return () => {
      cancelado = true;
    };
  }, [activo, tipo, clave]);

  useEffect(() => {
    if (!activo || finalizadoRef.current || !listo || !listoRef.current || !decididoRef.current) return undefined;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void database.guardarBorrador(tipo, clave, datosRef.current, pasoRef.current).catch(() => undefined);
    }, 300);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [activo, tipo, clave, datos, paso, listo]);

  useEffect(() => {
    if (!activo) return undefined;

    const guardarAhora = () => {
      if (!listoRef.current || finalizadoRef.current) return;
      void database.guardarBorrador(tipo, clave, datosRef.current, pasoRef.current).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') guardarAhora();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', guardarAhora);
    const onPause: EventListener = guardarAhora;
    window.addEventListener('pause', onPause);

    let removerApp: (() => void) | null = null;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) guardarAhora();
    }).then((listener) => {
      removerApp = () => listener.remove();
    }).catch(() => undefined);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', guardarAhora);
      window.removeEventListener('pause', onPause);
      removerApp?.();
    };
  }, [activo, tipo, clave]);

  async function continuar(): Promise<number> {
    if (!pendiente) return paso;
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
    setListo(true);
    return pendiente.paso;
  }

  async function descartar(): Promise<void> {
    await database.eliminarBorrador(tipo, clave);
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
    setListo(true);
  }

  async function guardarAhora(): Promise<void> {
    if (!activo || finalizadoRef.current || !listoRef.current) return;
    await database.guardarBorrador(tipo, clave, datosRef.current, pasoRef.current);
  }

  async function limpiar(): Promise<void> {
    finalizadoRef.current = true;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await database.eliminarBorrador(tipo, clave);
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
    setListo(true);
  }

  return { pendiente, continuar, descartar, guardarAhora, limpiar };
}
