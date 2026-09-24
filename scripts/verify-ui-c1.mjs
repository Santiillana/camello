import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = await import('playwright');

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk.toString(); });
server.stderr.on('data', (chunk) => { logs += chunk.toString(); });

async function esperarServidor(url, timeoutMs = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error('Vite no inició a tiempo.\n' + logs);
}

try {
  await esperarServidor('http://127.0.0.1:5173');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(7000);
    console.log('ui-c1: abrir app');
    await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('ui-c1: comprobar Inicio');
    await page.getByRole('heading', { name: '¿Cómo vamos?' }).waitFor({ timeout: 7000 });
    console.log('ui-c1: comprobar menú');

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    console.log('ui-c1: contar secciones');
    const menuLinks = page.locator('.side-nav .side-nav-item');
    if (await menuLinks.count() !== 10) throw new Error('C1: el menú lateral no muestra las 10 secciones.');
    if (await page.getByRole('link', { name: 'Vender' }).count() !== 0) throw new Error('C1: todavía existe Vender en la barra inferior.');
    await page.locator('.side-nav-cerrar').click();
    console.log('ui-c1: comprobar +');
    const fab = page.getByRole('button', { name: 'Nueva acción' });
    if (await fab.count() !== 1) throw new Error('C1: falta el botón flotante +.');
    await fab.click();
    if (await page.getByRole('menu').getByRole('button', { name: /Nueva venta/ }).count() !== 1) throw new Error('C1: falta Nueva venta en el +.');
    if (await page.getByRole('menu').getByRole('button', { name: /Nueva ruta/ }).count() !== 1) throw new Error('C1: falta Nueva ruta en el +.');

    console.log('ui-c1: comprobar escritorio');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const nav = page.locator('.side-nav');
    if (await nav.count() !== 1) throw new Error('C1: no existe el riel lateral en escritorio.');
    const contenido = page.locator('.pantalla');
    const ancho = await contenido.evaluate((el) => getComputedStyle(el).maxWidth);
    if (ancho === 'none' || ancho === '100%') throw new Error('C1: el contenido perdió el ancho máximo en escritorio.');

    console.log('ui-c1: PASÓ — 10 secciones, sin Vender, + con Nueva venta/Nueva ruta, riel lateral y ancho limitado.');
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}
