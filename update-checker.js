const semver = require('semver');

const RELEASE_API_URL = 'https://api.github.com/repos/nuno-miranda/saltix/releases/latest';

function normalizeVersion(version) {
  if (!version || typeof version !== 'string') {
    return null;
  }
  return semver.clean(version.replace(/^v/i, ''));
}

function buildErrorMessage(error, response) {
  if (response) {
    if (response.status === 403) {
      return 'GitHub API rate limit exceeded. Please try again later.';
    }
    return `GitHub API returned status ${response.status}.`;
  }
  return error && error.message ? error.message : 'An unknown network error occurred.';
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASE_API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'SALTIX Update Checker'
    }
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(buildErrorMessage(null, response));
    error.status = response.status;
    error.body = bodyText;
    throw error;
  }

  const json = await response.json();
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid response from GitHub Releases API.');
  }

  const tagName = json.tag_name;
  const htmlUrl = json.html_url;
  const latestVersion = normalizeVersion(tagName);

  if (!latestVersion) {
    throw new Error('Unable to determine latest version from GitHub release tag.');
  }

  return {
    latestVersion,
    htmlUrl,
    releaseName: json.name || tagName || 'latest release'
  };
}

async function checkForUpdates(currentVersion) {
  const localVersion = normalizeVersion(currentVersion);
  if (!localVersion) {
    throw new Error('The local application version is invalid.');
  }

  const latestRelease = await fetchLatestRelease();
  const isLatest = semver.gte(localVersion, latestRelease.latestVersion);

  return {
    currentVersion: localVersion,
    latestVersion: latestRelease.latestVersion,
    releaseUrl: latestRelease.htmlUrl,
    releaseName: latestRelease.releaseName,
    isLatest
  };
}

module.exports = {
  checkForUpdates,
  normalizeVersion
};
