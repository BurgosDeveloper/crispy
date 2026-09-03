const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const port = 3001;
const startupTimeoutMs = 15000;
const retryDelayMs = 250;

function killBasilicoProcesses() {
  try {
    const cmd = 'wmic process where "name=\'node.exe\'" get commandline,processid';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes('basilico')) {
        const match = line.trim().match(/(\d+)$/);
        if (match) {
          try { execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

function getConnectionInfo() {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/connection-info', timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`El backend respondió con estado ${response.statusCode}.`));
          return;
        }
        try {
          const connectionInfo = JSON.parse(body);
          if (!connectionInfo.backendUrl) throw new Error('No se detectó una IP LAN válida.');
          if (connectionInfo.app !== 'crispy') throw new Error('El backend respondiendo no pertenece a Crispy Burger.');
          resolve(connectionInfo);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('El backend no respondió a tiempo.')));
    request.once('error', reject);
  });
}

function startBackend() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function tryOpenBrowser(executable, args) {
  return new Promise((resolve) => {
    const browser = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    browser.once('error', () => resolve(false));
    browser.once('spawn', () => {
      browser.unref();
      resolve(true);
    });
  });
}

async function openPos(backendUrl) {
  const args = [`--app=${backendUrl}`, '--new-window'];
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome.exe',
    'msedge.exe',
  ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    if (await tryOpenBrowser(candidate, args)) return;
  }

  if (await tryOpenBrowser('cmd.exe', ['/c', 'start', '', backendUrl])) return;
  throw new Error('No se encontró un navegador para abrir Crispy Burger.');
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      return await getConnectionInfo();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error('Crispy Burger no pudo iniciar el backend LAN. Revisa PostgreSQL y la conexión de red.');
}

async function launch() {
  killBasilicoProcesses();
  try {
    const connectionInfo = await getConnectionInfo();
    await openPos(connectionInfo.backendUrl);
    return;
  } catch (error) {
    killBasilicoProcesses();
    startBackend();
  }

  const connectionInfo = await waitForBackend();
  await openPos(connectionInfo.backendUrl);
}

launch().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});