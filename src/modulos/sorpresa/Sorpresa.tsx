import { useEffect, useMemo, useState } from 'react';
import type { ContextoModulo } from '../contrato';

const RETOS = [
  'Haz 5 minutos de juego de olfato con premios escondidos.',
  'Revisa que el agua esté limpia y disponible hoy.',
  'Dedica 10 minutos a una caminata tranquila o exploración segura.',
  'Haz una sesión corta de cepillado si tu mascota la disfruta.',
  'Practica 3 minutos de una orden conocida con refuerzo positivo.',
  'Prepara un rincón tranquilo para descanso sin interrupciones.',
  'Hoy observa y anota qué actividad disfrutó más tu mascota.',
];

export default function Sorpresa({ contexto }: { contexto: ContextoModulo }) {
  const [habitos, setHabitos] = useState<Array<{id:number;fecha:string;titulo:string;hecho:number;nota?:string|null}>>([]);
  const [nota,setNota]=useState('');
  const [error,setError]=useState<string|null>(null);
  const hoy=new Date().toISOString().slice(0,10);

  const retoHoy=useMemo(()=>RETOS[new Date(hoy+'T00:00:00').getDay()%RETOS.length],[hoy]);

  async function cargar(){
    try{
      await contexto.migracion(1,async()=>undefined);
      const rows=await contexto.consultarPropio<typeof habitos[number]>('SELECT id,fecha,titulo,hecho,nota FROM mod_sorpresa_habitos WHERE fecha=? ORDER BY id DESC;',[hoy]);
      setHabitos(rows);
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void cargar();},[]);

  async function registrar(){
    try{
      await contexto.ejecutarPropio('INSERT INTO mod_sorpresa_habitos (fecha,titulo,hecho,nota) VALUES (?,?,1,?);',[hoy,retoHoy,nota.trim()||null]);
      setNota('');
      await cargar();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div><p className="texto-kicker">Módulo independiente</p><h1>Sorpresa</h1></div>
      </header>
      <section className="tarjeta">
        <p className="texto-kicker">Reto de hoy</p>
        <h2>{retoHoy}</h2>
        <label>Nota opcional<textarea value={nota} onChange={e=>setNota(e.target.value)} maxLength={300} rows={3}/></label>
        <button className="boton-primario boton-grande" onClick={()=>void registrar()}>Lo hice hoy</button>
      </section>
      <section className="tarjeta">
        <h2>Registro de hoy</h2>
        {habitos.length===0?<p className="texto-vacio">Todavía no has marcado el reto de hoy.</p>:
          <ul className="lista-resumen">{habitos.map(h=><li key={h.id}><span>{h.titulo}</span><strong>✓</strong>{h.nota&&<small>{h.nota}</small>}</li>)}</ul>}
      </section>
      {error&&<p className="texto-error">{error}</p>}
    </div>
  );
}
