const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, dialog, shell } = require('electron');
const Store = require('electron-store');
const path = require('path');

const store = new Store();
let mainWindow;
let tray;
let notifiedEmails = new Set();
let userSession;

const releaseApiUrl = 'https://api.github.com/repos/nuno-miranda/saltix/releases/latest';

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

function parseSemver(version) {
  return normalizeVersion(version)
    .split('.')
    .map((segment) => Number.parseInt(segment, 10) || 0);
}

function compareVersions(a, b) {
  const aParts = parseSemver(a);
  const bParts = parseSemver(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const aNum = aParts[i] || 0;
    const bNum = bParts[i] || 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }

  return 0;
}

function showUpdateDialog(release) {
  if (!mainWindow) return;

  if (release) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new SALTIX version is available (${release.tag_name}).`,
      detail: `Your current version is ${app.getVersion()}.

Release notes:
${release.body || 'No description available.'}`,
      buttons: ['Open Release', 'Close'],
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        shell.openExternal(release.html_url);
      }
    });
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Up to Date',
      message: `You are running the latest SALTIX version (${app.getVersion()}).`,
      buttons: ['Close']
    });
  }
}

function checkForUpdates(showDialog = false) {
  return new Promise((resolve, reject) => {
    const https = require('https');

    const request = https.get(releaseApiUrl, {
      headers: {
        'User-Agent': 'SALTIX-Update-Checker'
      }
    }, (response) => {
      let body = '';

      response.on('data', (chunk) => {
        body += chunk;
      });

      response.on('end', () => {
        if (response.statusCode !== 200) {
          const error = new Error(`GitHub API returned ${response.statusCode}`);
          if (showDialog) {
            dialog.showErrorBox('Update Check Failed', error.message);
          }
          reject(error);
          return;
        }

        try {
          const release = JSON.parse(body);
          const latestTag = normalizeVersion(release.tag_name || release.name || '');
          const currentVersion = app.getVersion();

          if (compareVersions(latestTag, currentVersion) > 0) {
            if (showDialog) showUpdateDialog(release);
            resolve(release);
            return;
          }

          if (showDialog) showUpdateDialog(null);
          resolve(null);
        } catch (error) {
          if (showDialog) {
            dialog.showErrorBox('Update Check Failed', error.message);
          }
          reject(error);
        }
      });
    });

    request.on('error', (error) => {
      if (showDialog) {
        dialog.showErrorBox('Update Check Failed', error.message);
      }
      reject(error);
    });
  });
}

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

  const menuTemplate = [
    {
      label: `SALTIX v${app.getVersion()}`,
      submenu: [
        {
          label: 'Check for Updates',
          click: () => checkForUpdates(true)
        },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Sobre',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre',
              message: 'SapoNoIMAP desenvolvido por Nuno Miranda',
              detail: 'Github: https://github.com/nuno-miranda\nBuymeacoffee: https://buymeacoffee.com/vodrius',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

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
  checkForUpdates().then((release) => {
    if (release) showUpdateDialog(release);
  }).catch((error) => {
    console.error('[Update Check] Failed:', error);
  });
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