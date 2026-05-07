const webview = document.getElementById('mail-webview');
const newSessionBtn = document.getElementById('new-session');
const toggleNotificationsBtn = document.getElementById('toggle-notifications');
const notificationsIndicator = document.getElementById('notifications-indicator');

// Initialize notifications state
async function initNotifications() {
    const enabled = await window.electronAPI.getNotificationsEnabled();
    updateNotificationsUI(enabled);
}

function updateNotificationsUI(enabled) {
    toggleNotificationsBtn.textContent = enabled ? 'Notifications ON' : 'Notifications OFF';
    notificationsIndicator.classList.toggle('disabled', !enabled);
}

// Event listeners
newSessionBtn.addEventListener('click', async () => {
    await window.electronAPI.newSession();
});

toggleNotificationsBtn.addEventListener('click', async () => {
    const enabled = await window.electronAPI.toggleNotifications();
    updateNotificationsUI(enabled);
});

// Initialize
initNotifications();