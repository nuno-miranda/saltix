const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleNotifications: () => ipcRenderer.invoke('toggle-notifications'),
  getNotificationsEnabled: () => ipcRenderer.invoke('get-notifications-enabled'),
  newSession: () => ipcRenderer.invoke('new-session'),
  notifyNewEmail: (from, subject) => ipcRenderer.invoke('notify-new-email', from, subject)
});