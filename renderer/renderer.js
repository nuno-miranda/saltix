const tabsEl = document.getElementById('tabs');
const webviewsEl = document.getElementById('webviews');
const newTabBtn = document.getElementById('new-tab');
const goBackBtn = document.getElementById('go-back');
const goForwardBtn = document.getElementById('go-forward');
const reloadTabBtn = document.getElementById('reload-tab');
const openActiveExternalBtn = document.getElementById('open-active-external');
const activeUrlEl = document.getElementById('active-url');

const SAPO_MAIL_URL = 'https://mail.sapo.pt/v7';
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

console.log('SALTIX renderer starting');

function isWebUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function labelForUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'mail.sapo.pt') {
      return 'SAPO Mail';
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch (error) {
    return 'New Tab';
  }
}

function getActiveTab() {
  return activeTabId ? tabs.get(activeTabId) : null;
}

function getWebviewUrl(tab) {
  if (!tab || !tab.webview || typeof tab.webview.getURL !== 'function') {
    return tab ? tab.url : '';
  }

  try {
    return tab.webview.getURL();
  } catch (error) {
    return tab.url || '';
  }
}

function webviewCan(tab, methodName) {
  if (!tab || !tab.webview || typeof tab.webview[methodName] !== 'function') {
    return false;
  }

  try {
    return tab.webview[methodName]();
  } catch (error) {
    return false;
  }
}

function callWebview(tab, methodName) {
  if (tab && tab.webview && typeof tab.webview[methodName] === 'function') {
    try {
      tab.webview[methodName]();
    } catch (error) {
      console.warn(`Unable to call ${methodName}:`, error.message);
    }
  }
}

function getWebviewTitle(tab) {
  if (!tab || !tab.webview || typeof tab.webview.getTitle !== 'function') {
    return tab ? tab.title : '';
  }

  try {
    return tab.webview.getTitle();
  } catch (error) {
    return tab.title || '';
  }
}

function setTabTitle(tab, title) {
  const fallback = labelForUrl(getWebviewUrl(tab) || tab.url);
  tab.title = (title || fallback || 'New Tab').trim();
  tab.titleEl.textContent = tab.title;
  tab.tabEl.title = tab.title;
}

function updateNavigationState() {
  const tab = getActiveTab();
  if (!tab) {
    goBackBtn.disabled = true;
    goForwardBtn.disabled = true;
    reloadTabBtn.disabled = true;
    openActiveExternalBtn.disabled = true;
    activeUrlEl.textContent = '';
    return;
  }

  const currentUrl = getWebviewUrl(tab);
  goBackBtn.disabled = !webviewCan(tab, 'canGoBack');
  goForwardBtn.disabled = !webviewCan(tab, 'canGoForward');
  reloadTabBtn.disabled = false;
  openActiveExternalBtn.disabled = !isWebUrl(currentUrl);
  activeUrlEl.textContent = currentUrl;
}

function activateTab(tabId) {
  if (!tabs.has(tabId)) {
    return;
  }

  tabs.forEach((tab, id) => {
    const active = id === tabId;
    tab.tabEl.classList.toggle('active', active);
    tab.webview.classList.toggle('active', active);
  });

  activeTabId = tabId;
  updateNavigationState();
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }

  if (tab.isMainMailTab) {
    return;
  }

  const ids = Array.from(tabs.keys());
  const closedIndex = ids.indexOf(tabId);
  tab.webview.remove();
  tab.tabEl.remove();
  tabs.delete(tabId);

  if (activeTabId === tabId) {
    const nextId = ids[closedIndex + 1] || ids[closedIndex - 1] || null;
    if (nextId && tabs.has(nextId)) {
      activateTab(nextId);
    } else {
      createTab(SAPO_MAIL_URL);
    }
  }
}

function createTab(url = SAPO_MAIL_URL, options = {}) {
  const safeUrl = isWebUrl(url) ? url : SAPO_MAIL_URL;
  console.log('Creating tab:', safeUrl);
  const tabId = `tab-${nextTabId}`;
  nextTabId += 1;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = tabId;
  tabEl.classList.toggle('main-mail-tab', options.isMainMailTab === true);

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = options.title || labelForUrl(safeUrl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.type = 'button';
  closeBtn.title = 'Close tab';
  closeBtn.textContent = 'x';

  tabEl.append(titleEl);
  if (options.isMainMailTab !== true) {
    tabEl.append(closeBtn);
  }
  tabsEl.append(tabEl);

  const webview = document.createElement('webview');
  webview.className = 'tab-webview';
  webview.dataset.tabId = tabId;
  webview.setAttribute('src', safeUrl);
  webview.setAttribute('partition', 'persist:sapo-mail');
  webview.setAttribute('preload', window.electronAPI.webviewPreloadPath);
  webviewsEl.append(webview);

  const tab = {
    id: tabId,
    url: safeUrl,
    title: titleEl.textContent,
    isMainMailTab: options.isMainMailTab === true,
    tabEl,
    titleEl,
    webview
  };

  tabs.set(tabId, tab);

  tabEl.addEventListener('click', () => activateTab(tabId));
  if (!tab.isMainMailTab) {
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tabId);
    });
  }

  webview.addEventListener('ipc-message', (event) => {
    const [firstArg, secondArg] = event.args || [];

    if (event.channel === 'saltix-open-tab' && isWebUrl(firstArg)) {
      createTab(firstArg, { title: secondArg });
    }

    if (event.channel === 'saltix-open-external' && firstArg) {
      window.electronAPI.openExternal(firstArg);
    }

    if (event.channel === 'new-unread-email') {
      window.electronAPI.notifyNewEmail(firstArg, secondArg);
    }

    if (event.channel === 'saltix-log-entry') {
      window.electronAPI.log(firstArg || 'info', 'webview-preload', secondArg || '');
    }
  });

  webview.addEventListener('context-menu', (event) => {
    const linkUrl = event.params && event.params.linkURL;
    if (linkUrl && isWebUrl(linkUrl)) {
      event.preventDefault();
      window.electronAPI.showLinkContextMenu(linkUrl);
    }
  });

  webview.addEventListener('page-title-updated', (event) => {
    setTabTitle(tab, event.title);
  });

  webview.addEventListener('did-start-loading', () => {
    tab.tabEl.classList.add('loading');
    updateNavigationState();
  });

  webview.addEventListener('did-stop-loading', () => {
    tab.tabEl.classList.remove('loading');
    setTabTitle(tab, getWebviewTitle(tab));
    updateNavigationState();
  });

  webview.addEventListener('did-navigate', (event) => {
    tab.url = event.url;
    setTabTitle(tab, getWebviewTitle(tab));
    updateNavigationState();
  });

  webview.addEventListener('did-navigate-in-page', (event) => {
    tab.url = event.url;
    updateNavigationState();
  });

  webview.addEventListener('new-window', (event) => {
    if (event.url && isWebUrl(event.url)) {
      createTab(event.url);
    }
  });

  activateTab(tabId);
  return tab;
}

function resetToSingleMailTab() {
  destroyAllTabs();
  createTab(SAPO_MAIL_URL, { isMainMailTab: true });
}

function destroyAllTabs() {
  tabs.forEach((tab) => {
    tab.webview.remove();
    tab.tabEl.remove();
  });
  tabs.clear();
  activeTabId = null;
  updateNavigationState();
}

newTabBtn.addEventListener('click', () => createTab(SAPO_MAIL_URL));

goBackBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  if (webviewCan(tab, 'canGoBack')) {
    callWebview(tab, 'goBack');
  }
});

goForwardBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  if (webviewCan(tab, 'canGoForward')) {
    callWebview(tab, 'goForward');
  }
});

reloadTabBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  callWebview(tab, 'reload');
});

openActiveExternalBtn.addEventListener('click', () => {
  const tab = getActiveTab();
  const currentUrl = getWebviewUrl(tab);
  if (isWebUrl(currentUrl)) {
    window.electronAPI.openExternal(currentUrl);
  }
});

window.electronAPI.onCreateTab((url) => {
  if (isWebUrl(url)) {
    createTab(url);
  }
});

window.handleSessionCleared = resetToSingleMailTab;
window.prepareSessionClear = destroyAllTabs;

// Initialize
createTab(SAPO_MAIL_URL, { isMainMailTab: true });
