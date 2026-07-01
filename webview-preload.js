const { ipcRenderer } = require('electron');

function sendLog(level, message) {
  ipcRenderer.sendToHost('saltix-log-entry', level, message);
}

window.addEventListener('error', (event) => {
  const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'unknown location';
  const stack = event.error && event.error.stack ? `\n${event.error.stack}` : '';
  sendLog('error', `${event.message} (${location})${stack}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
  sendLog('error', `Unhandled rejection: ${reason}`);
});

function isWebUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
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

function shouldOpenInSaltixTab(anchor, event) {
  const href = anchor.href;
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
    return false;
  }

  if (!isWebUrl(href)) {
    return true;
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) {
    return true;
  }

  if (anchor.target && anchor.target.toLowerCase() !== '_self') {
    return true;
  }

  return !isInternalSapoUrl(href);
}

function findAnchor(target) {
  if (!target || typeof target.closest !== 'function') {
    return null;
  }

  return target.closest('a[href]');
}

function findAnchorFromEvent(event) {
  const directAnchor = findAnchor(event.target);
  if (directAnchor) {
    return directAnchor;
  }

  if (typeof event.composedPath !== 'function') {
    return null;
  }

  return event.composedPath().find((node) => {
    return node && node.tagName === 'A' && node.href;
  }) || null;
}

function handleLinkClick(event) {
  const anchor = findAnchorFromEvent(event);
  if (!anchor || !shouldOpenInSaltixTab(anchor, event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const href = anchor.href;
  if (isWebUrl(href)) {
    sendLog('info', `Intercepted link click for tab: ${href}`);
    ipcRenderer.sendToHost('saltix-open-tab', href, anchor.textContent.trim());
  } else {
    sendLog('info', `Opening non-web link externally: ${href}`);
    ipcRenderer.sendToHost('saltix-open-external', href);
  }
}

function installLinkHandler() {
  if (window.__saltixLinkHandlerReady) {
    return;
  }

  window.__saltixLinkHandlerReady = true;
  const originalWindowOpen = window.open;

  window.open = function openSaltixTab(url, target, features) {
    if (isWebUrl(url)) {
      sendLog('info', `Intercepted window.open for tab: ${url}`);
      ipcRenderer.sendToHost('saltix-open-tab', url, '');
      return null;
    }

    return originalWindowOpen.call(window, url, target, features);
  };

  window.addEventListener('click', handleLinkClick, true);
  document.addEventListener('click', handleLinkClick, true);

  document.addEventListener('auxclick', (event) => {
    if (event.button !== 1) {
      return;
    }

    const anchor = findAnchorFromEvent(event);
    if (!anchor || !isWebUrl(anchor.href)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    sendLog('info', `Intercepted middle-click for tab: ${anchor.href}`);
    ipcRenderer.sendToHost('saltix-open-tab', anchor.href, anchor.textContent.trim());
  }, true);
}

function installUnreadObserver() {
  if (window.__saltixUnreadObserverReady) {
    return;
  }

  window.__saltixUnreadObserverReady = true;
  window.__saltixNotifiedEmails = window.__saltixNotifiedEmails || new Set();

  const notifyFromUnreadItem = (item) => {
    const fromEl = item.querySelector('.message .from');
    const subjectEl = item.querySelector('.message .subject');

    if (!fromEl || !subjectEl) {
      return;
    }

    const from = fromEl.textContent.trim();
    const subject = subjectEl.textContent.trim();
    if (!from || !subject) {
      return;
    }

    const key = `${from} - ${subject}`;
    if (window.__saltixNotifiedEmails.has(key)) {
      return;
    }

    window.__saltixNotifiedEmails.add(key);
    ipcRenderer.sendToHost('new-unread-email', from, subject);
  };

  const observe = () => {
    const messagesList = document.querySelector('#element-list-messages');
    if (!messagesList || messagesList.__saltixObserved) {
      return;
    }

    messagesList.__saltixObserved = true;
    messagesList.querySelectorAll('.list-item.focus.unread').forEach((item) => {
      const fromEl = item.querySelector('.message .from');
      const subjectEl = item.querySelector('.message .subject');
      if (fromEl && subjectEl) {
        window.__saltixNotifiedEmails.add(`${fromEl.textContent.trim()} - ${subjectEl.textContent.trim()}`);
      }
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }

          if (node.matches && node.matches('.list-item.focus.unread')) {
            notifyFromUnreadItem(node);
          }

          node.querySelectorAll('.list-item.focus.unread').forEach(notifyFromUnreadItem);
        });
      });
    });

    observer.observe(messagesList, { childList: true, subtree: true });
  };

  observe();
  const rootObserver = new MutationObserver(observe);
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener('DOMContentLoaded', () => {
  installLinkHandler();
  installUnreadObserver();
});
