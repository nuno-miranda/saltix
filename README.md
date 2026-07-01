# SALTIX

Open source SAPO Mail desktop application for Linux and Windows.

SALTIX is a lightweight Electron-based desktop app focused on providing a simple and modern experience for accessing SAPO Mail without requiring IMAP configuration.

---

# Features

* Lightweight desktop application
* Supports SAPO Mail
* Windows and Linux builds
* Open source
* GitHub Releases integration
* Automatic update checker
* Portable Linux AppImage support
* Linux `.deb` package support

---

# Downloads

Latest releases:

[SALTIX Releases](https://github.com/nuno-miranda/saltix/releases?utm_source=chatgpt.com)

Available packages:

* Windows `.exe`
* Linux `.AppImage`
* Linux `.deb`

Current release:

```text
v1.0.0
```

---

# Linux Installation

## AppImage

Download the latest `.AppImage` release.

Some Linux desktop environments do not automatically mark AppImages as executable after download.

If double-clicking the AppImage opens it as an archive or disk image instead of launching the app, run:

```bash
chmod +x SALTIX-1.0.0-linux.AppImage
```

Then launch it with:

```bash
./SALTIX-1.0.0-linux.AppImage
```

---

## Debian / Ubuntu (.deb)

Install using:

```bash
sudo dpkg -i SALTIX-1.0.0-linux.deb
```

If dependencies are missing:

```bash
sudo apt install -f
```

---

# Windows Installation

Download the `.exe` installer from the latest release and run it normally.

Windows SmartScreen may display a warning because the application is not code-signed yet.

Click:

* More info
* Run anyway

---

# Development

## Requirements

* Node.js 20+
* npm

---

## Install dependencies

```bash
npm install
```

---

## Start development mode

```bash
npm start
```

---

## Build application

```bash
npm run build
```

---

# Releases

SALTIX uses GitHub Actions for automated builds and releases.

Every semantic version tag:

```text
v1.0.0
```

automatically triggers:

* Windows build
* Linux AppImage build
* Linux `.deb` build
* GitHub Release publishing

---

# Versioning

SALTIX follows Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Examples:

* `1.0.0`

---

# Update Checking

SALTIX checks for updates using the GitHub Releases API:

```text
https://api.github.com/repos/nuno-miranda/saltix/releases/latest
```

---

# Technologies

* Electron
* electron-builder
* GitHub Actions
* JavaScript
* Node.js

---

# License

MIT License

---

# Author

Nuno Miranda

GitHub:

[nuno-miranda GitHub](https://github.com/nuno-miranda?utm_source=chatgpt.com)

# Support the Project

If SALTIX helps you and you would like to support development,
you can buy me a coffee:

[Buy Me a Coffee](https://buymeacoffee.com/vodrius)
