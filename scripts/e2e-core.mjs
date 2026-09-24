import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const { chromium } = await import('playwright');

let serverLog = '';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_E2E: '1' },
});
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

async function configurarPrimeraVez(page) {
  const inicial = page.getByRole('heading', { name: 'Vamos a preparar tu espacio de trabajo' });
  await inicial.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
  if (await inicial.isVisible().catch(() => false)) {
    await page.getByLabel('Nombre del negocio').fill('Negocio E2E');
    await page.getByLabel('Nombre de quien lleva la app').fill('Usuario E2E');
    await page.getByRole('button', { name: 'Entrar a CAMELLO' }).click();
    await page.getByRole('heading', { name: 'Inicio' }).waitFor().catch(() => {});
  }
}

async function siguiente(page) {
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

async function omitir(page) {
  const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await dialog.locator('.asistente-tarjeta > button.boton-texto').click();
}

async function crearCliente(page) {
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(
    () => typeof window.__CAMELLO_TEST_SQL__ === 'function',
    undefined,
    { timeout: 60000 },
  );
  await configurarPrimeraVez(page);
  await page.getByRole('heading', { name: 'Inicio' }).waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  try {
    await page.getByLabel('Nombre completo').waitFor({ timeout: 70000 });
  } catch (error) {
    const texto = await page.locator('body').innerText().catch(() => '');
    const sqliteStage = await page.evaluate(() => document.documentElement.dataset.camelloSqliteStage || 'sin-etapa').catch(() => 'sin-etapa');
    await page.screenshot({ path: 'e2e-fallo-clientes.png', fullPage: true }).catch(() => {});
    throw new Error('No apareció Nombre completo. Etapa SQLite: ' + sqliteStage + '. Texto de pantalla:\n' + texto.slice(0, 5000) + '\nCausa: ' + String(error));
  }

  await page.getByLabel('Nombre completo').fill('Cliente E2E');
  await siguiente(page);
  await page.getByLabel('Teléfono 1').fill('3001234567');
  await sleep(500);

  await page.evaluate(() => window.dispatchEvent(new Event('pause')));
  for (let intento = 0; intento < 40; intento += 1) {
    const guardado = await sql(page, "SELECT json,paso FROM borradores WHERE tipo='cliente-nuevo' AND clave='nuevo' LIMIT 1;");
    if (guardado.length === 1) break;
    await sleep(250);
  }
  const borradorPersistido = await sql(page, "SELECT json,paso FROM borradores WHERE tipo='cliente-nuevo' AND clave='nuevo' LIMIT 1;");
  if (borradorPersistido.length !== 1) throw new Error('El borrador no se persistió en SQLite antes de recargar.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__CAMELLO_TEST_SQL__ === 'function',
    undefined,
    { timeout: 60000 },
  );

  await page.getByRole('heading', { name: 'Tienes un formulario sin terminar' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nombre completo').inputValue().then((value) => {
    if (value !== 'Cliente E2E') throw new Error('El borrador no restauró el nombre.');
  });
  await page.getByLabel('Teléfono 1').inputValue().then((value) => {
    if (value !== '3001234567') throw new Error('El borrador no restauró el teléfono.');
  });

  await siguiente(page);
  for (let i = 0; i < 5; i += 1) await omitir(page);
  const guardarCliente = page.getByRole('button', { name: 'Guardar cliente' });
  if (await guardarCliente.count()) await guardarCliente.click();
  else await omitir(page);

  let creado = false;
  for (let intento = 0; intento < 20; intento += 1) {
    const filas = await sql(page, "SELECT id,nombre,estado FROM clientes WHERE nombre='Cliente E2E' ORDER BY id DESC LIMIT 1;");
    if (filas.length === 1 && filas[0]?.estado === 'activo') {
      creado = true;
      break;
    }
    await sleep(250);
  }
  if (!creado) {
    const pantalla = await page.locator('body').innerText().catch(() => '');
    const errores = await page.locator('.texto-error,[role="alert"]').allTextContents().catch(() => []);
    const botones = await page.getByRole('button').allTextContents().catch(() => []);
    await page.screenshot({ path: 'e2e-fallo-cliente.png', fullPage: true }).catch(() => {});
    throw new Error(
      'E2E: el cliente no quedó persistido tras guardar el formulario. '
      + 'URL=' + page.url()
      + ' errores=' + JSON.stringify(errores)
      + ' botones=' + JSON.stringify(botones)
      + ' pantalla=' + pantalla.slice(0, 5000),
    );
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  await page.getByText('Cliente E2E', { exact: true }).waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await page.waitForFunction(
    () => typeof window.__CAMELLO_TEST_SQL__ === 'function',
    undefined,
    { timeout: 15000 },
  );
  const trasRecarga = await sql(page, "SELECT id,nombre,estado FROM clientes WHERE nombre='Cliente E2E' ORDER BY id DESC LIMIT 1;");
  if (trasRecarga.length !== 1 || trasRecarga[0]?.estado !== 'activo') {
    const persistDiag = await page.evaluate(async () => {
      const out = { indexed: null, local: null };
      try {
        const rawLocal = localStorage.getItem('camello.sqlite.v1');
        out.local = rawLocal ? { length: rawLocal.length, prefix: rawLocal.slice(0, 20) } : null;
        const requestDb = indexedDB.open('camelloWebSqlite');
        out.indexed = await new Promise((resolve, reject) => {
          requestDb.onerror = () => reject(requestDb.error ?? new Error('No se pudo abrir store SQLite.'));
          requestDb.onsuccess = () => {
            const db = requestDb.result;
            const req = db.transaction('databases', 'readonly').objectStore('databases').get('camelloSQLite.db');
            req.onerror = () => reject(req.error ?? new Error('No se pudo leer blob SQLite.'));
            req.onsuccess = () => {
              const value = req.result;
              resolve(typeof value === 'string'
                ? { type: 'string', length: value.length, prefix: value.slice(0, 20) }
                : { type: value?.constructor?.name ?? typeof value, byteLength: value?.byteLength ?? null });
              db.close();
            };
          };
        });
      } catch (error) {
        return { error: String(error), indexed: out.indexed, local: out.local };
      }
      return out;
    });
    throw new Error(
      'E2E: el cliente no sobrevivió a una recarga completa. SQLite=' + JSON.stringify(trasRecarga)
      + ' persistencia=' + JSON.stringify(persistDiag),
    );
  }
}


async function sql(page, query, params = []) {
  return page.evaluate(async ({ query: sqlQuery, params: sqlParams }) => {
    const fn = window.__CAMELLO_TEST_SQL__;
    if (!fn) throw new Error('No existe la API SQLite E2E.');
    return fn(sqlQuery, sqlParams);
  }, { query, params });
}

async function venta(page, metodo, cantidad = 1, doble = false) {
  await sql(page, 'DELETE FROM borradores;');
  await page.getByRole('button', { name: 'Listo' }).click().catch(() => {});
  await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('button', { name: /Nueva acción/ }).click();
  await page.getByRole('menu').getByRole('button', { name: 'Nueva venta' }).click();
  const borrador = page.getByRole('dialog', { name: 'Borrador pendiente' });
  if (await borrador.isVisible().catch(() => false)) {
    await borrador.getByRole('button', { name: 'Descartar' }).click();
  }
  await page.locator('h1').filter({ hasText: 'Nueva venta' }).first().waitFor({ timeout: 20000 });
  const borradorDialog = page.getByRole('dialog', { name: 'Borrador pendiente' });
  if (await borradorDialog.count()) {
    await borradorDialog.getByRole('button', { name: 'Descartar' }).click();
  }
  const clienteSelect = page.locator('select').first();
  try {
    await page.locator('input[placeholder="Nombre o mascota…"]').waitFor({ state: 'visible', timeout: 60000 });
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '');
    const stage = await page.evaluate(() => document.documentElement.dataset.camelloSqliteStage || 'sin-etapa').catch(() => 'sin-etapa');
    await page.screenshot({ path: 'e2e-fallo-venta.png', fullPage: true }).catch(() => {});
    throw new Error('No apareció el formulario de nueva venta. URL=' + page.url() + ' etapa=' + stage + ' body=' + body.slice(0, 6000) + ' causa=' + String(error));
  }
  const clienteRow = await sql(page, "SELECT id FROM clientes WHERE nombre='Cliente E2E' AND estado='activo' ORDER BY id DESC LIMIT 1;");
  if (clienteRow.length !== 1) throw new Error('E2E: Cliente E2E no existe en SQLite antes de la venta.');
  await clienteSelect.selectOption(String(clienteRow[0].id));

  await siguiente(page);
  await siguiente(page);
  const cantidadPlus = page.getByRole('button', { name: '+' });
  if (cantidad > 1) {
    for (let i = 1; i < cantidad; i += 1) await cantidadPlus.click();
  }
  await siguiente(page);

  const etiquetaMetodo = metodo === 'TRANSFERENCIA_NEQUI'
    ? 'Transferencia / Nequi'
    : metodo === 'PARCIAL'
      ? 'Pago parcial'
      : metodo === 'FIADO'
        ? 'Fiado'
        : 'Efectivo';
  await page.locator('.metodo-pago-card').filter({ hasText: etiquetaMetodo }).first().click();
  if (metodo === 'PARCIAL') {
    await page.getByLabel('¿Cuánto paga ahora?').fill('1000');
  }
  await siguiente(page);

  const confirm = page.getByRole('article').getByRole('button', { name: 'CONFIRMAR VENTA' }).first();
  if (doble) await confirm.dblclick();
  else await confirm.click();

  await page.getByRole('heading', { name: 'Venta registrada' }).waitFor();
  const voucher = await page.locator('.voucher').innerText();
  return voucher;
}

async function crearRuta(page) {
  await page.goto('http://127.0.0.1:5173/#/rutas?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('heading', { name: 'Nueva ruta' }).waitFor();

  await page.getByLabel('Nombre de la ruta').fill('Ruta E2E');
  await siguiente(page);
  await siguiente(page);
  await page.getByLabel('Paquetes llevados').fill('5');
  await siguiente(page);
  const checkbox = page.getByRole('checkbox', { name: /Registrar ubicación/ });
  if (await checkbox.isChecked()) await checkbox.uncheck();
  await siguiente(page);
  await page.getByRole('button', { name: 'Iniciar ruta' }).click();
  await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();
}

async function cerrarRuta(page, sobrantes) {
  await page.getByLabel('Paquetes sobrantes').fill(String(sobrantes));
  await page.getByRole('button', { name: 'Cerrar ruta y cuadrar' }).click();
  await page.getByText('Finalizada').waitFor();
  await page.getByText('Diferencia').locator('..').getByText('0').waitFor().catch(() => {});
}

async function probarUbicacionWeb(page) {
  await page.goto('http://127.0.0.1:5173/#/clientes/1', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.goto('http://127.0.0.1:5173/#/clientes?nuevo=1', { waitUntil: 'domcontentloaded', timeout: 15000 });
  const locationButton = page.getByRole('button', { name: /Usar mi ubicación/ });
  if (await locationButton.count()) {
    await locationButton.click();
    await page.getByText(/GPS requiere la app instalada|No se pudo obtener/).waitFor({ timeout: 8000 }).catch(() => {});
  }
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

    await crearCliente(page);

    const clienteCreado = await sql(page, "SELECT id,nombre,estado FROM clientes WHERE nombre='Cliente E2E' ORDER BY id DESC LIMIT 1;");
    if (clienteCreado.length !== 1 || clienteCreado[0]?.estado !== 'activo') {
      throw new Error('E2E: el cliente creado por la UI no quedó persistido: ' + JSON.stringify(clienteCreado));
    }
    await page.goto('http://127.0.0.1:5173/#/clientes', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor();
    await page.goto('http://127.0.0.1:5173/#/venta-nueva', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const clienteVenta = page.locator('select').first();
    const clienteVentaRow = await sql(page, "SELECT id FROM clientes WHERE nombre='Cliente E2E' AND estado='activo' ORDER BY id DESC LIMIT 1;");
    if (clienteVentaRow.length !== 1) throw new Error('E2E: Cliente E2E no existe antes de abrir ventas.');
    await clienteVenta.selectOption(String(clienteVentaRow[0].id));

    const efectivo = await venta(page, 'EFECTIVO', 1, true);
    if (!efectivo.includes('Efectivo') && !efectivo.includes('Pagado')) throw new Error('No se generó voucher de efectivo.');

    const anulable = await venta(page, 'EFECTIVO', 1);
    if (!anulable.includes('Venta #')) throw new Error('No se generó venta anulable.');
    page.once('dialog', async (dialog) => { await dialog.accept('Prueba E2E de anulación'); });
    await page.getByRole('button', { name: 'Anular venta' }).click();
    await page.getByText('Venta anulada').waitFor();
    const anulada = await sql(page, "SELECT estado_registro,motivo_anulacion FROM ventas WHERE id=(SELECT MAX(id) FROM ventas);");
    if (anulada[0]?.estado_registro !== 'anulada' || !anulada[0]?.motivo_anulacion) throw new Error('E2E: anulación sin auditoría.');

    const transferencia = await venta(page, 'TRANSFERENCIA_NEQUI', 1);
    if (!transferencia.includes('Venta #')) throw new Error('No se generó voucher de transferencia.');

    const fiado = await venta(page, 'FIADO', 1);
    if (!fiado.includes('Pendiente')) throw new Error('La venta fiada no dejó pendiente.');

    const parcial = await venta(page, 'PARCIAL', 1);
    if (!parcial.includes('Pendiente')) throw new Error('La venta parcial no dejó pendiente.');

    const ventasBase = await sql(page, "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM ventas WHERE cliente_id=(SELECT id FROM clientes WHERE nombre='Cliente E2E') AND COALESCE(estado_registro,'activa')='activa';");
    if (Number(ventasBase[0]?.n) !== 4) throw new Error('E2E: no quedaron 4 ventas activas en SQLite.');
    if (Number(ventasBase[0]?.total) <= 0) throw new Error('E2E: total vendido en SQLite inválido.');

    await page.goto('http://127.0.0.1:5173/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const carteraAntes = await sql(page, "SELECT id, COALESCE(SUM(total-monto_pagado),0) AS pendiente FROM ventas WHERE cliente_id=(SELECT id FROM clientes WHERE nombre='Cliente E2E') AND COALESCE(estado_registro,'activa')='activa' GROUP BY cliente_id;");
    const clienteCarteraId = await sql(page, "SELECT id FROM clientes WHERE nombre='Cliente E2E' AND estado='activo' ORDER BY id DESC LIMIT 1;");
    if (clienteCarteraId.length !== 1) throw new Error('E2E: no se encontró el cliente para probar cartera.');
    await page.goto('http://127.0.0.1:5173/#/cartera?cliente=' + clienteCarteraId[0].id, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const pagoDialog = page.getByRole('dialog', { name: 'Pagar a Cliente E2E' });
    await pagoDialog.waitFor({ state: 'visible', timeout: 15000 });
    await pagoDialog.getByRole('button', { name: 'Siguiente' }).click();
    await pagoDialog.getByRole('button', { name: /^Efectivo/ }).click();
    await pagoDialog.getByRole('button', { name: 'Siguiente' }).click();
    await pagoDialog.getByRole('article').getByRole('button', { name: 'CONFIRMAR COBRO' }).click();
    const carteraBase = await sql(page, "SELECT COALESCE(SUM(total-monto_pagado),0) AS pendiente FROM ventas WHERE cliente_id=(SELECT id FROM clientes WHERE nombre='Cliente E2E') AND COALESCE(estado_registro,'activa')='activa';");
    if (Number(carteraBase[0]?.pendiente) >= Number(carteraAntes[0]?.pendiente)) throw new Error('E2E: el cobro no redujo la cartera.');
    if (Number(carteraBase[0]?.pendiente) < 0) throw new Error('E2E: cartera negativa.');

    await page.goto('http://127.0.0.1:5173/#/rutas', { waitUntil: 'domcontentloaded', timeout: 15000 });


    await crearRuta(page);
    await venta(page, 'EFECTIVO', 1);
    await page.goto('http://127.0.0.1:5173/#/rutas/1', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.getByRole('heading', { name: 'Ruta E2E' }).waitFor();
    await cerrarRuta(page, 4);
    const rutaBase = await sql(page, "SELECT estado, paquetes_llevados, paquetes_sobrantes FROM rutas WHERE id=1;");
    if (rutaBase[0]?.estado !== 'FINALIZADA') throw new Error('E2E: la ruta no quedó finalizada en SQLite.');
    if (Number(rutaBase[0]?.paquetes_llevados) - Number(rutaBase[0]?.paquetes_sobrantes) < 0) throw new Error('E2E: cuadre de ruta inválido.');

    await page.goto('http://127.0.0.1:5173/#/mapa', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const filtros = page.getByRole('button').filter({ hasText: /Filtro|Ubicación|Días|Ruta/ });
    if (await filtros.count() === 0) {
      await page.getByRole('heading', { name: 'Mapa' }).waitFor().catch(() => {});
    }

    await page.goto('http://127.0.0.1:5173/#/respaldo', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar respaldo/ }).click();
    await download;
    await page.getByText(/Respaldo generado|Respaldo/).first().waitFor();
    const backupBase = await sql(page, "SELECT COUNT(*) AS n FROM clientes;");
    if (Number(backupBase[0]?.n) < 1) throw new Error('E2E: la base no conserva clientes antes del respaldo.');

    await probarUbicacionWeb(page);

    if (consoleErrors.length) {
      throw new Error('E2E encontró errores de consola:\n' + consoleErrors.join('\n'));
    }

    console.log('e2e-core: PASÓ — borrador/reload, cuatro métodos de venta, doble toque, ruta/cuadre, mapa, respaldo y navegación.');
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}
