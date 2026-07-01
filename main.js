const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, dialog, shell, clipboard } = require('electron');
const Store = require('electron-store');
const path = require('path');
const updateChecker = require('./update-checker');

const store = new Store();
let mainWindow;
let tray;
let notifiedEmails = new Set();
let userSession;
let refreshInterval;
const recentlyOpenedTabUrls = new Set();
const logEntries = [];
const MAX_LOG_ENTRIES = 100;
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function serializeLogPart(part) {
  if (part instanceof Error) {
    return part.stack || part.message;
  }

  if (typeof part === 'string') {
    return part;
  }

  try {
    return JSON.stringify(part);
  } catch (error) {
    return String(part);
  }
}

function addLog(level, source, ...parts) {
  const entry = {
    time: new Date().toISOString(),
    level,
    source,
    message: parts.map(serializeLogPart).join(' ')
  };

  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.splice(0, logEntries.length - MAX_LOG_ENTRIES);
  }

  const line = `[${entry.time}] [${entry.level}] [${entry.source}] ${entry.message}`;
  if (level === 'error') {
    originalConsole.error(line);
  } else if (level === 'warn') {
    originalConsole.warn(line);
  } else {
    originalConsole.log(line);
  }
}

console.log = (...parts) => addLog('info', 'main', ...parts);
console.warn = (...parts) => addLog('warn', 'main', ...parts);
console.error = (...parts) => addLog('error', 'main', ...parts);

function getLogsText() {
  if (logEntries.length === 0) {
    return 'No log entries yet.';
  }

  return logEntries
    .map((entry) => `[${entry.time}] [${entry.level}] [${entry.source}] ${entry.message}`)
    .join('\n');
}

function showLogs() {
  const logsText = getLogsText();
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: 'SALTIX Logs',
    message: `Last ${MAX_LOG_ENTRIES} log entries`,
    detail: logsText,
    buttons: ['OK', 'Copy Logs'],
    defaultId: 0,
    cancelId: 0
  }).then((response) => {
    if (response.response === 1) {
      clipboard.writeText(logsText);
    }
  });
}

function setNotificationsEnabled(enabled) {
  store.set('notificationsEnabled', enabled);
  console.log('[Options] notifications setting saved:', enabled);
  buildApplicationMenu();
  return enabled;
}

function toggleNotificationsEnabled() {
  const current = store.get('notificationsEnabled');
  return setNotificationsEnabled(!current);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

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
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Remove Electron from User-Agent
  const defaultUA = mainWindow.webContents.getUserAgent();
  const cleanUA = defaultUA.replace(/ Electron\/[\d.]+/, '');

  mainWindow.webContents.setUserAgent(cleanUA);
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    addLog(level === 2 ? 'warn' : level >= 3 ? 'error' : 'info', 'renderer', `${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    addLog('error', 'renderer', `Load failed ${errorCode}: ${errorDescription} ${validatedURL}`);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    addLog('info', 'renderer', 'Renderer finished loading');
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    addLog('error', 'renderer', 'Render process gone:', details);
  });
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isHttpUrl(params.src)) {
      addLog('warn', 'main', 'Blocked webview with unsupported URL:', params.src);
      event.preventDefault();
      return;
    }

    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch((error) => {
    console.error('Failed to load renderer:', error);
  });

  buildApplicationMenu();

  // Handle window close to minimize to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  startAutoRefresh();
}

function buildApplicationMenu() {
  const appVersion = app.getVersion();
  const notificationsEnabled = store.get('notificationsEnabled') === true;
  const menuTemplate = [
    {
      label: 'Options',
      submenu: [
        {
          label: 'New Session',
          click: async () => {
            await clearSession();
          }
        },
        {
          label: 'End Session',
          click: async () => {
            await clearSession();
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Notifications',
          type: 'checkbox',
          checked: notificationsEnabled,
          click: () => {
            toggleNotificationsEnabled();
          }
        }
      ]
    },
    {
      label: 'Debug',
      submenu: [
        {
          label: `Show Logs (Last ${MAX_LOG_ENTRIES})`,
          click: () => showLogs()
        },
        {
          label: 'Copy Logs',
          click: () => clipboard.writeText(getLogsText())
        },
        {
          type: 'separator'
        },
        {
          label: 'Open Renderer DevTools',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `Current Version: ${appVersion}`,
          enabled: false
        },
        {
          label: 'Check for Updates',
          click: async () => {
            await handleCheckForUpdates();
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'SALTIX',
              detail: `Version ${appVersion}\nDeveloped by Nuno Miranda`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function isExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

function isInternalSapoUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'sapo.pt'
      || parsed.hostname.endsWith('.sapo.pt')
      || parsed.hostname === 'sapo.io'
      || parsed.hostname.endsWith('.sapo.io');
  } catch (error) {
    return false;
  }
}

function shouldOpenInSaltixTab(url) {
  return isHttpUrl(url) && !isInternalSapoUrl(url);
}

function sendCreateTab(url) {
  if (mainWindow && !mainWindow.isDestroyed() && isHttpUrl(url)) {
    if (recentlyOpenedTabUrls.has(url)) {
      addLog('info', 'main', 'Skipped duplicate tab request:', url);
      return;
    }

    recentlyOpenedTabUrls.add(url);
    setTimeout(() => {
      recentlyOpenedTabUrls.delete(url);
    }, 1000);

    addLog('info', 'main', 'Opening URL in SALTIX tab:', url);
    mainWindow.webContents.send('create-tab', url);
  }
}

async function runRendererHook(hookName) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  await mainWindow.webContents.executeJavaScript(`
    if (typeof window.${hookName} === 'function') {
      window.${hookName}();
    }
  `);
}

async function handleCheckForUpdates() {
  const currentVersion = app.getVersion();

  try {
    const updateInfo = await updateChecker.checkForUpdates(currentVersion);

    if (updateInfo.isLatest) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates Found',
        message: 'You are already using the latest version.',
        detail: `Current Version: ${updateInfo.currentVersion}`,
        buttons: ['OK']
      });
      return;
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: 'A new version of SALTIX is available.',
      detail: `Current Version: ${updateInfo.currentVersion}\nLatest Version: ${updateInfo.latestVersion}`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0 && updateInfo.releaseUrl) {
      shell.openExternal(updateInfo.releaseUrl);
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'Unable to check for updates at this time.';
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message,
      detail: 'Please check your network connection or try again later.',
      buttons: ['OK']
    });
    console.error('Update check failed:', error);
  }
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

// Auto refresh - refresh email page each minute
function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          const webviewEl = document.querySelector('.tab-webview.active');
          if (webviewEl) {
            webviewEl.executeJavaScript(\`
              function clickRefreshButton() {
                const button = document.querySelector(
                  'span.button[aria-label="Atualizar mensagens"]'
                );

                if (button) {
                  button.click();
                  console.log('Refresh button clicked.');
                } else {
                  console.log('Refresh button not found.');
                }
              }
              clickRefreshButton();
            \`);
          }
        })();
      `);
    }
  }, 60000); // 60 seconds
}

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

async function clearSession() {
  // Clear the persistent partition session (not default session)
  const ses = session.fromPartition('persist:sapo-mail');
  let clearError = null;

  await runRendererHook('prepareSessionClear');
  notifiedEmails.clear();

  try {
    await ses.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'serviceworkers',
        'cachestorage'
      ]
    });
    await ses.clearCache();
    await ses.clearAuthCache();
  } catch (error) {
    clearError = error;
    console.error('Session clear failed:', error);
  } finally {
    await runRendererHook('handleSessionCleared');
  }

  if (clearError && mainWindow && !mainWindow.isDestroyed()) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Session Clear Warning',
      message: 'SALTIX reloaded the session, but Electron could not clear all stored web data.',
      detail: clearError.message || String(clearError),
      buttons: ['OK']
    });
  }

  return { ok: !clearError };
}

// IPC handlers
ipcMain.handle('new-session', async () => {
  await clearSession();
});

ipcMain.handle('end-session', async () => {
  await clearSession();
});

ipcMain.handle('open-external', (event, url) => {
  if (url && typeof url === 'string' && isExternalUrl(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('show-link-context-menu', (event, url) => {
  if (!isHttpUrl(url)) {
    return;
  }

  const sender = event.sender;
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open in New Tab',
      click: () => sendCreateTab(url)
    },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(url)
    },
    { type: 'separator' },
    {
      label: 'Copy Link',
      click: () => clipboard.writeText(url)
    }
  ]);

  menu.popup({
    window: BrowserWindow.fromWebContents(sender)
  });
});

ipcMain.handle('toggle-notifications', () => {
  return toggleNotificationsEnabled();
});

ipcMain.handle('get-notifications-enabled', () => {
  const enabled = store.get('notificationsEnabled');
  console.log('[IPC] get-notifications-enabled:', enabled);
  return enabled;
});

ipcMain.handle('notify-new-email', (event, from, subject) => {
  console.log('[IPC] notify-new-email called with:', from, subject);
  showNotification(from, subject);
});

ipcMain.handle('log-entry', (event, level, source, message) => {
  addLog(level || 'info', source || 'renderer', message || '');
});

app.whenReady().then(() => {
  console.log(`SALTIX ${app.getVersion()} starting`);
  console.log('User data path:', app.getPath('userData'));
  userSession = session.fromPartition('persist:sapo-mail');
  app.on('web-contents-created', (event, contents) => {
    const contentsType = contents.getType();
    if (contentsType === 'webview') {
      contents.on('console-message', (consoleEvent, level, message, line, sourceId) => {
        addLog(level === 2 ? 'warn' : level >= 3 ? 'error' : 'info', 'webview', `${message} (${sourceId}:${line})`);
      });
      contents.on('did-fail-load', (loadEvent, errorCode, errorDescription, validatedURL) => {
        addLog('error', 'webview', `Load failed ${errorCode}: ${errorDescription} ${validatedURL}`);
      });
      contents.on('render-process-gone', (goneEvent, details) => {
        addLog('error', 'webview', 'Render process gone:', details);
      });
      contents.on('will-frame-navigate', (navigationEvent) => {
        const url = navigationEvent.url;
        if (navigationEvent.isMainFrame && shouldOpenInSaltixTab(url)) {
          addLog('info', 'webview', 'Intercepted main-frame navigation for tab:', url);
          navigationEvent.preventDefault();
          sendCreateTab(url);
        }
      });
      contents.on('will-navigate', (navigationEvent, url) => {
        const targetUrl = navigationEvent.url || url;
        if (shouldOpenInSaltixTab(targetUrl)) {
          addLog('info', 'webview', 'Intercepted main navigation for tab:', targetUrl);
          navigationEvent.preventDefault();
          sendCreateTab(targetUrl);
        }
      });

      contents.setWindowOpenHandler(({ url }) => {
        if (shouldOpenInSaltixTab(url)) {
          sendCreateTab(url);
        } else if (isInternalSapoUrl(url)) {
          sendCreateTab(url);
        } else if (isExternalUrl(url)) {
          shell.openExternal(url);
        }

        return { action: 'deny' };
      });
      return;
    }

    addLog('info', 'main', 'Created web contents:', contentsType);
  });

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
