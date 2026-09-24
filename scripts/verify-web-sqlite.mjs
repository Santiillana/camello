// Verifica jeep-sqlite en Chromium: WASM, operaciones SQLite y persistencia IndexedDB.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
const port = 5173;
const cdpPort = 9222;
const baseUrl = 'http://' + host + ':' + port;
const wasmUrl = baseUrl + '/assets/sql-wasm.wasm';
const dbName = '__camello_ci_jeep_sqlite__';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await sleep(250);
  }
  throw new Error('Timeout esperando ' + label);
}

async function findChrome() {
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const probe = spawn(command, ['--version']);
    const available = await new Promise((resolve) => {
      probe.once('error', () => resolve(false));
      probe.once('exit', (code) => resolve(code === 0));
    });
    if (available) return command;
  }
  throw new Error('No se encontró Chrome/Chromium');
}

function connectCdp(wsUrl, onRuntimeProblem) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));

    if (message.method === 'Runtime.exceptionThrown') {
      onRuntimeProblem(JSON.stringify(message.params.exceptionDetails));
    }

    if (
      message.method === 'Runtime.consoleAPICalled' &&
      (message.params.type === 'error' || message.params.type === 'warning')
    ) {
      const text = (message.params.args || [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ');
      if (/LinkError|Aborted/i.test(text)) onRuntimeProblem(text);
    }

    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    }
  });

  return {
    ws,
    open: () => new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    }),
    call: (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate falló');
  }
  return result.result?.value;
}

async function main() {
  const server = spawn('npm', ['run', 'dev', '--', '--host', host], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chrome = await findChrome();
  const profile = await mkdtemp(join(tmpdir(), 'camello-chrome-'));
  const browser = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=' + cdpPort,
    '--user-data-dir=' + profile,
    'about:blank',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let cdp;
  let runtimeProblem = null;

  try {
    await waitFor(async () => (await fetch(baseUrl)).ok, 30000, 'Vite');

    const wasm = await fetch(wasmUrl);
    const wasmBytes = new Uint8Array(await wasm.arrayBuffer());
    const contentType = wasm.headers.get('content-type') || '';

    if (!wasm.ok) throw new Error('WASM HTTP ' + wasm.status);
    if (!contentType.toLowerCase().startsWith('application/wasm')) {
      throw new Error('Content-Type WASM incorrecto: ' + contentType);
    }
    if (wasmBytes[0] !== 0 || wasmBytes[1] !== 97 || wasmBytes[2] !== 115 || wasmBytes[3] !== 109) {
      throw new Error('La respuesta WASM no tiene firma binaria válida');
    }

    await waitFor(
      async () => (await fetch('http://' + host + ':' + cdpPort + '/json/version')).ok,
      20000,
      'Chrome CDP'
    );

    const target = await fetch(
      'http://' + host + ':' + cdpPort + '/json/new?about:blank',
      { method: 'PUT' }
    ).then((response) => response.json());

    cdp = connectCdp(target.webSocketDebuggerUrl, (problem) => {
      runtimeProblem = problem;
    });

    await cdp.open();
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await cdp.call('Log.enable');
    await cdp.call('Page.navigate', { url: baseUrl });

    await waitFor(
      () => evaluate(cdp, "document.querySelector('.app-shell') !== null"),
      30000,
      'CAMELLO'
    );

    const dbNameJs = JSON.stringify(dbName);

    const firstRun = await evaluate(cdp, "(async () => {"
      + "await customElements.whenDefined('jeep-sqlite');"
      + "const jeep = document.querySelector('jeep-sqlite');"
      + "if (!jeep) throw new Error('No existe <jeep-sqlite>.');"
      + "await jeep.createConnection({ database: " + dbNameJs + ", version: 1 });"
      + "await jeep.open({ database: " + dbNameJs + " });"
      + "await jeep.execute({ database: " + dbNameJs + ", statements: 'CREATE TABLE IF NOT EXISTS smoke_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL);' });"
      + "await jeep.execute({ database: " + dbNameJs + ", statements: 'DELETE FROM smoke_test;' });"
      + "await jeep.run({ database: " + dbNameJs + ", statement: 'INSERT INTO smoke_test (value) VALUES (?);', values: ['persisted'] });"
      + "await jeep.saveToStore({ database: " + dbNameJs + " });"
      + "const row = await jeep.query({ database: " + dbNameJs + ", statement: 'SELECT value FROM smoke_test ORDER BY id DESC LIMIT 1;' });"
      + "if (row.values?.[0]?.value !== 'persisted') throw new Error('La lectura inicial no coincidió.');"
      + "await jeep.close({ database: " + dbNameJs + " });"
      + "return true;"
      + "})()"
    );

    if (firstRun !== true) throw new Error('La prueba inicial de SQLite no terminó correctamente.');
    if (runtimeProblem) throw new Error('Error de runtime: ' + runtimeProblem);

    await cdp.call('Page.reload', { ignoreCache: true });

    await waitFor(
      () => evaluate(cdp, "document.querySelector('.app-shell') !== null"),
      30000,
      'recarga de CAMELLO'
    );

    const persisted = await evaluate(cdp, "(async () => {"
      + "await customElements.whenDefined('jeep-sqlite');"
      + "const jeep = document.querySelector('jeep-sqlite');"
      + "await jeep.createConnection({ database: " + dbNameJs + ", version: 1 });"
      + "await jeep.open({ database: " + dbNameJs + " });"
      + "const row = await jeep.query({ database: " + dbNameJs + ", statement: 'SELECT value FROM smoke_test ORDER BY id DESC LIMIT 1;' });"
      + "const value = row.values?.[0]?.value ?? null;"
      + "await jeep.close({ database: " + dbNameJs + " });"
      + "await jeep.deleteDatabase({ database: " + dbNameJs + " });"
      + "return value;"
      + "})()"
    );

    if (persisted !== 'persisted') {
      throw new Error('Persistencia IndexedDB fallida. Valor tras recarga: ' + String(persisted));
    }
    if (runtimeProblem) throw new Error('Error de runtime tras recarga: ' + runtimeProblem);

    console.log('WEB SQLITE OK: ' + wasmBytes.byteLength + ' bytes, ' + contentType);
    console.log('WEB SQLITE OK: tabla -> insert -> query -> saveToStore -> recarga -> query');
    console.log('WEB SQLITE OK: sin LinkError/Aborted');
  } finally {
    cdp?.ws.close();
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
