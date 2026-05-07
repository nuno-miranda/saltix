const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session } = require('electron');
const Store = require('electron-store');
const path = require('path');

const store = new Store();
let mainWindow;
let tray;
let notifiedEmails = new Set();
let userSession;

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
      webSecurity: true,
      webviewTag: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png') // Assuming tray.png is the app icon
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Handle window close to minimize to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Auto refresh disabled - browser already updates via JSON API
  // startAutoRefresh();
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

// Auto refresh disabled - browser already updates via JSON API
// function startAutoRefresh() {
//   refreshInterval = setInterval(() => {
//     if (mainWindow && !mainWindow.isDestroyed()) {
//       mainWindow.webContents.executeJavaScript(`
//         (function() {
//           const webviewEl = document.getElementById('mail-webview');
//           if (webviewEl) {
//             webviewEl.executeJavaScript(\`
//               const refreshBtn = document.querySelector('.messages.actions.refresh');
//               if (refreshBtn) {
//                 refreshBtn.click();
//               } else {
//                 location.reload();
//               }
//             \`);
//           }
//         })();
//       `);
//     }
//   }, 60000); // 60 seconds
// }

function showNotification(sender, subject) {
  // Defensive check - ensure we're really checking if notifications are enabled
  const notificationsEnabled = store.get('notificationsEnabled');
  console.log('[Notification] Enabled:', notificationsEnabled, 'Sender:', sender);
  
  if (notificationsEnabled === false) {
    console.log('[Notification] Blocked - notifications disabled');
    return;
  }
  
  // Only show if explicitly enabled
  if (notificationsEnabled !== true) {
    console.log('[Notification] Blocked - notifications not enabled');
    return;
  }

  const key = `${sender}-${subject}`;
  if (notifiedEmails.has(key)) {
    console.log('[Notification] Blocked - duplicate');
    return;
  }

  notifiedEmails.add(key);
  console.log('[Notification] Showing notification for:', key);

  new Notification({
    title: 'New Email',
    body: `${sender} - ${subject}`
  }).show();
}

function clearSession() {
  // Clear the persistent partition session (not default session)
  const ses = session.fromPartition('persist:sapo-mail');
  ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage', 'cache']
  }).then(() => {
    mainWindow.webContents.executeJavaScript(`
      const webview = document.getElementById('mail-webview');
      if (webview) {
        webview.loadURL('https://mail.sapo.pt/v7');
      }
    `);
  });
}

// IPC handlers
ipcMain.handle('new-session', () => {
  clearSession();
});

ipcMain.handle('toggle-notifications', () => {
  const current = store.get('notificationsEnabled');
  const newValue = !current;
  console.log('[IPC] toggle-notifications: from', current, 'to', newValue);
  store.set('notificationsEnabled', newValue);
  console.log('[IPC] notifications setting saved, verified:', store.get('notificationsEnabled'));
  return newValue;
});;

ipcMain.handle('get-notifications-enabled', () => {
  const enabled = store.get('notificationsEnabled');
  console.log('[IPC] get-notifications-enabled:', enabled);
  return enabled;
});

ipcMain.handle('notify-new-email', (event, from, subject) => {
  console.log('[IPC] notify-new-email called with:', from, subject);
  showNotification(from, subject);
});

app.whenReady().then(() => {
  userSession = session.fromPartition('persist:sapo-mail');
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
});