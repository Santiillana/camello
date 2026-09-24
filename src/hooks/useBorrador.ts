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
  const timerRef = useRef<number | null>(null);
  const [pendiente, setPendiente] = useState<BorradorPendiente<T> | null>(null);

  useEffect(() => {
    datosRef.current = datos;
    pasoRef.current = paso;
  }, [datos, paso]);

  useEffect(() => {
    let cancelado = false;
    if (!activo) return undefined;
    void database.obtenerBorrador<T>(tipo, clave).then((existente) => {
      if (cancelado) return;
      setPendiente(existente);
      listoRef.current = !existente;
      decididoRef.current = !existente;
    });
    return () => {
      cancelado = true;
    };
  }, [activo, tipo, clave]);

  useEffect(() => {
    if (!activo || !listoRef.current || !decididoRef.current) return undefined;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void database.guardarBorrador(tipo, clave, datosRef.current, pasoRef.current).catch(() => undefined);
    }, 300);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [activo, tipo, clave, datos, paso]);

  useEffect(() => {
    if (!activo) return undefined;

    const guardarAhora = () => {
      if (!listoRef.current) return;
      void database.guardarBorrador(tipo, clave, datosRef.current, pasoRef.current).catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') guardarAhora();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', guardarAhora);
    window.addEventListener('pause', guardarAhora as EventListener);

    let removerApp: (() => void) | null = null;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) guardarAhora();
    }).then((listener) => {
      removerApp = () => listener.remove();
    }).catch(() => undefined);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', guardarAhora);
      window.removeEventListener('pause', guardarAhora as EventListener);
      removerApp?.();
    };
  }, [activo, tipo, clave]);

  async function continuar(): Promise<number> {
    if (!pendiente) return paso;
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
    return pendiente.paso;
  }

  async function descartar(): Promise<void> {
    await database.eliminarBorrador(tipo, clave);
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
  }

  async function limpiar(): Promise<void> {
    await database.eliminarBorrador(tipo, clave);
    setPendiente(null);
    listoRef.current = true;
    decididoRef.current = true;
  }

  return { pendiente, continuar, descartar, limpiar };
}
