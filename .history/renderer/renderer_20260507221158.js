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
const webview = document.getElementById('mail-webview');
if (webview) {
  webview.addEventListener('dom-ready', () => {
    webview.executeJavaScript(`
      (function() {
        if (window._sapoMailObserverReady) return;
        window._sapoMailObserverReady = true;
        window._notifiedEmails = new Set();

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const unreadItems = node.querySelectorAll('.list-item.focus.unread');
                unreadItems.forEach((item) => {
                  const fromEl = item.querySelector('.message .from');
                  const subjectEl = item.querySelector('.message .subject');
                  if (fromEl && subjectEl) {
                    const from = fromEl.textContent.trim();
                    const subject = subjectEl.textContent.trim();
                    if (from && subject) {
                      const key = from + ' - ' + subject;
                      if (!window._notifiedEmails.has(key)) {
                        window._notifiedEmails.add(key);
                        window.postMessage({ type: 'new-unread-email', from: from, subject: subject }, '*');
                      }
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

        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'new-unread-email') {
            try {
              window.electronAPI.notifyNewEmail(event.data.from, event.data.subject);
            } catch (e) {
              console.error('Error notifying:', e);
            }
          }
        });
      })();
    `);
  });
}

// Event listeners
newSessionBtn.addEventListener('click', async () => {
    await window.electronAPI.newSession();
    location.reload();
});

toggleNotificationsBtn.addEventListener('click', async () => {
    const enabled = await window.electronAPI.toggleNotifications();
    updateNotificationsUI(enabled);
});

// Initialize
initNotifications();