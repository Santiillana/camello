import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = await import('playwright');

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

async function esperarServidor(url) {
  const inicio = Date.now();
  while (Date.now() - inicio < 30000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Vite no inició.\n' + serverLog);
}

async function siguiente(page) {
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

async function omitir(page) {
  await page.getByRole('button', { name: 'Omitir' }).click();
}

try {
  await esperarServidor('http://127.0.0.1:5173');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Nuevo cliente' }).waitFor();

    await page.getByLabel('Nombre completo').fill('Cliente E2E');
    await siguiente(page);
    await page.getByLabel('Teléfono 1').fill('3001234567');
    await siguiente(page);

    await omitir(page);
    await omitir(page);
    await omitir(page);
    await omitir(page);

    await page.getByRole('heading', { name: 'Clientes' }).waitFor().catch(() => {});
    await page.goto('http://127.0.0.1:5173/#/venta-nueva', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const clienteSelect = page.locator('select').first();
    await clienteSelect.selectOption({ label: 'Cliente E2E' });

    await siguiente(page).catch(() => {});
    await siguiente(page);

    const cantidadInput = page.getByLabel('Cantidad');
    if (await cantidadInput.count()) await cantidadInput.fill('2');
    else {
      await page.getByRole('button', { name: '+' }).click();
    }
    await siguiente(page);

    await page.getByRole('button', { name: 'Efectivo' }).click();
    await siguiente(page);
    await page.getByRole('button', { name: 'CONFIRMAR VENTA' }).dblclick();
    await page.getByRole('heading', { name: 'Venta registrada' }).waitFor();

    await page.goto('http://127.0.0.1:5173/#/rutas', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '+ Nueva ruta' }).click();
    await page.getByLabel('Nombre de la ruta').fill('Ruta E2E');
    await page.getByLabel('¿Cuántos paquetes llevas?').fill('5');
    await page.getByRole('button', { name: '▶ Iniciar ruta' }).click();
    await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();

    await page.getByRole('link', { name: /Nueva venta/ }).click();
    await page.locator('select').first().selectOption({ label: 'Cliente E2E' });
    await siguiente(page).catch(() => {});
    await siguiente(page);
    await siguiente(page);
    await page.getByRole('button', { name: 'Efectivo' }).click();
    await siguiente(page);
    await page.getByRole('button', { name: 'CONFIRMAR VENTA' }).click();
    await page.getByRole('heading', { name: 'Venta registrada' }).waitFor();

    await page.goto('http://127.0.0.1:5173/#/rutas/1', { waitUntil: 'domcontentloaded' });
    const sobrantes = page.getByLabel('Paquetes sobrantes');
    await sobrantes.fill('3');
    await page.getByRole('button', { name: 'Cerrar ruta y cuadrar' }).click();
    await page.getByText('Finalizada').waitFor();

    await page.goto('http://127.0.0.1:5173/#/respaldo', { waitUntil: 'domcontentloaded' });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar respaldo/ }).click();
    await download;
    await page.getByText('Respaldo generado, verificado y descargado.').waitFor();

    if (consoleErrors.length) {
      throw new Error('E2E encontró errores de consola:\n' + consoleErrors.join('\n'));
    }

    console.log('e2e-core: PASÓ — cliente, venta, doble toque, ruta, cuadre y respaldo.');
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}
