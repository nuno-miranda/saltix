const { contextBridge, ipcRenderer } = require('electron');

const webviewPreloadPath = new URL('../webview-preload.js', window.location.href).toString();

function sendLog(level, source, message) {
  ipcRenderer.invoke('log-entry', level, source, message).catch(() => {});
}

window.addEventListener('error', (event) => {
  const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'unknown location';
  const stack = event.error && event.error.stack ? `\n${event.error.stack}` : '';
  sendLog('error', 'renderer', `${event.message} (${location})${stack}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
  sendLog('error', 'renderer', `Unhandled rejection: ${reason}`);
});

contextBridge.exposeInMainWorld('electronAPI', {
  webviewPreloadPath,
  log: (level, source, message) => ipcRenderer.invoke('log-entry', level, source, message),
  toggleNotifications: () => ipcRenderer.invoke('toggle-notifications'),
  getNotificationsEnabled: () => ipcRenderer.invoke('get-notifications-enabled'),
  newSession: () => ipcRenderer.invoke('new-session'),
  endSession: () => ipcRenderer.invoke('end-session'),
  notifyNewEmail: (from, subject) => ipcRenderer.invoke('notify-new-email', from, subject),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showLinkContextMenu: (url) => ipcRenderer.invoke('show-link-context-menu', url),
  onCreateTab: (callback) => {
    ipcRenderer.on('create-tab', (event, url) => callback(url));
  }
});
