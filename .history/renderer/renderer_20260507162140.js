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

// Inject DOM observer into webview
webview.addEventListener('dom-ready', () => {
    webview.executeJavaScript(`
        let notifiedEmails = new Set();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const unreadItems = node.querySelectorAll('.list-item.focus.unread');
                        unreadItems.forEach((item) => {
                            const from = item.querySelector('.message .from')?.textContent?.trim();
                            const subject = item.querySelector('.message .subject')?.textContent?.trim();
                            if (from && subject) {
                                const key = \`\${from}-\${subject}\`;
                                if (!notifiedEmails.has(key)) {
                                    notifiedEmails.add(key);
                                    window.postMessage({ type: 'new-unread-email', from, subject }, '*');
                                }
                            }
                        });
                    }
                });
            });
        });

        const messagesList = document.querySelector('.container.messages-list');
        if (messagesList) {
            observer.observe(messagesList, { childList: true, subtree: true });
        }

        // Listen for messages from injected script
        window.addEventListener('message', (event) => {
            if (event.data.type === 'new-unread-email') {
                // Send to main process
                window.electronAPI.notifyNewEmail(event.data.from, event.data.subject);
            }
        });
    `);
});

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