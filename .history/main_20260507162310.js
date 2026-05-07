const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session } = require('electron');
const Store = require('electron-store');
const path = require('path');

const store = new Store();
let mainWindow;
let tray;
let notifiedEmails = new Set();
let refreshInterval;

// Initialize notifications enabled
if (store.get('notificationsEnabled') === undefined) {
    store.set('notificationsEnabled', true);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets', 'tray.png') // Assuming tray.png is the app icon
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Handle window close to minimize to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Start auto refresh
  startAutoRefresh();
}

function createTray() {
  // tray = new Tray(path.join(__dirname, 'assets', 'tray.png'));
  // const contextMenu = Menu.buildFromTemplate([
  //   { label: 'Show App', click: () => mainWindow.show() },
  //   { label: 'Quit', click: () => {
  //     app.isQuitting = true;
  //     app.quit();
  //   }}
  // ]);
  // tray.setToolTip('SAPO Mail');
  // tray.setContextMenu(contextMenu);
  // tray.on('click', () => mainWindow.show());
}

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        const webview = document.getElementById('mail-webview');
        if (webview) {
          webview.executeJavaScript(\`
            const refreshBtn = document.querySelector('.messages.actions.refresh');
            if (refreshBtn) {
              refreshBtn.click();
            } else {
              location.reload();
            }
          \`);
        }
      `);
    }
  }, 60000); // 60 seconds
}

function showNotification(sender, subject) {
  if (!store.get('notificationsEnabled')) return;

  const key = `${sender}-${subject}`;
  if (notifiedEmails.has(key)) return;

  notifiedEmails.add(key);

  new Notification({
    title: 'New Email',
    body: `${sender} - ${subject}`
    // icon: path.join(__dirname, 'assets', 'tray.png')
  }).show();
}

function clearSession() {
  const ses = session.defaultSession;
  ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage', 'cache']
  });
  mainWindow.webContents.executeJavaScript(`
    const webview = document.getElementById('mail-webview');
    if (webview) {
      webview.reload();
    }
  `);
}

// IPC handlers
ipcMain.handle('new-session', () => {
  clearSession();
});

ipcMain.handle('toggle-notifications', () => {
  const current = store.get('notificationsEnabled');
  const newValue = !current;
  store.set('notificationsEnabled', newValue);
  return newValue;
});

ipcMain.handle('get-notifications-enabled', () => {
  return store.get('notificationsEnabled');
});

ipcMain.handle('notify-new-email', (event, sender, subject) => {
  showNotification(sender, subject);
});

app.whenReady().then(() => {
  createWindow();
  // createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (refreshInterval) clearInterval(refreshInterval);
});