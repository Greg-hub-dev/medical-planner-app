const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { fork } = require('child_process');

// En dev, on charge le serveur `next dev` déjà lancé (voir script electron:dev).
const startUrlFromEnv = process.env.ELECTRON_START_URL;
const isDev = !!startUrlFromEnv;

let serverProcess = null;
let mainWindow = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeout = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, () => resolve());
      req.on('error', () => {
        if (Date.now() - started > timeout) {
          reject(new Error('Le serveur local ne répond pas.'));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

// Lit la config email locale (créée au premier lancement si absente).
function loadUserConfig() {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    if (!fs.existsSync(cfgPath)) {
      const template = {
        EMAIL_USER: '',
        EMAIL_APP_PASSWORD: '',
        NEXTAUTH_URL: '',
        _comment:
          "Renseignez EMAIL_USER (votre adresse Gmail) et EMAIL_APP_PASSWORD (mot de passe d'application Gmail) pour activer l'envoi d'invitations calendrier. Redémarrez l'application après modification.",
      };
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(template, null, 2), 'utf-8');
      return {};
    }
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) || {};
    const out = {};
    for (const key of ['EMAIL_USER', 'EMAIL_APP_PASSWORD', 'NEXTAUTH_URL']) {
      if (cfg[key]) out[key] = String(cfg[key]);
    }
    return out;
  } catch (err) {
    console.error('config.json invalide, email désactivé:', err);
    return {};
  }
}

async function startServer() {
  const port = await getFreePort();
  const standaloneDir = path.join(process.resourcesPath, 'standalone');
  const serverJs = path.join(standaloneDir, 'server.js');

  const env = {
    ...process.env,
    ...loadUserConfig(),
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    MEDICAL_DATA_DIR: app.getPath('userData'),
    // Permet au binaire Electron de se comporter comme Node pour lancer le serveur.
    ELECTRON_RUN_AS_NODE: '1',
  };

  serverProcess = fork(serverJs, [], {
    cwd: standaloneDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  serverProcess.stdout?.on('data', (d) => console.log('[next]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[next]', d.toString().trim()));

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Medical Planner',
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Les liens externes (mailto, http vers un autre site) s'ouvrent dans le navigateur.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    const url = isDev ? startUrlFromEnv : await startServer();
    await mainWindow.loadURL(url);
    if (isDev) mainWindow.webContents.openDevTools();
  } catch (err) {
    console.error('Démarrage impossible:', err);
    mainWindow.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<h1 style="font-family:sans-serif">Erreur de démarrage</h1><pre>${String(err)}</pre>`
        )
    );
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
