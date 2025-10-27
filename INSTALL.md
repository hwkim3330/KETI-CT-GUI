# Installation Guide

Complete installation guide for KETI-CT-GUI (KETI TSN Configuration Tool).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Requirements](#requirements)
- [Installation Methods](#installation-methods)
- [Post-Installation](#post-installation)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### 5-Minute Setup

```bash
# 1. Clone repository
git clone https://github.com/hwkim3330/KETI-CT-GUI.git
cd KETI-CT-GUI

# 2. Install dependencies
npm install

# 3. Setup serial port permissions
sudo usermod -a -G dialout $USER
# Logout and login for this to take effect

# 4. Test installation
npm test

# 5. Start server
npm start
```

Open browser: `http://localhost:8080`

---

## Requirements

### Hardware

**Required:**
- Microchip LAN9662 VelocityDRIVE board
- USB connection (appears as `/dev/ttyACM*` or `/dev/ttyUSB*`)

**Recommended:**
- 2GB+ RAM
- Multi-core CPU for better performance

### Software

**Required:**
- **Node.js**: ≥18.0.0
- **npm**: ≥9.0.0
- **Operating System**: Linux (Ubuntu 22.04+ recommended)

**Optional:**
- **Git**: For cloning repository
- **Docker**: For containerized deployment (optional)

### Permissions

**Serial Port Access:**
```bash
# Check current groups
groups

# Add user to dialout group (required for serial port access)
sudo usermod -a -G dialout $USER

# Apply changes (requires logout/login)
# Or temporary fix for current session:
sudo chmod 666 /dev/ttyACM0
```

---

## Installation Methods

### Method 1: Git Clone (Recommended)

```bash
# Clone repository
git clone https://github.com/hwkim3330/KETI-CT-GUI.git
cd KETI-CT-GUI

# Install dependencies
npm install

# Verify installation
npm test

# Start server
npm start
```

### Method 2: Download ZIP

```bash
# Download and extract
wget https://github.com/hwkim3330/KETI-CT-GUI/archive/refs/heads/main.zip
unzip main.zip
cd KETI-CT-GUI-main

# Install dependencies
npm install

# Verify installation
npm test

# Start server
npm start
```

### Method 3: npm Global Install (CLI Only)

```bash
# Install globally
npm install -g keti-ct-gui

# Use CLI tool
keti-ct device /dev/ttyACM0 get /c

# Or run directly
npx keti-ct-gui device /dev/ttyACM0 get /c
```

### Method 4: Docker (Optional)

```bash
# Build image
docker build -t keti-ct-gui .

# Run container with device access
docker run -d \
  --name keti-ct-gui \
  --device=/dev/ttyACM0 \
  -p 8080:8080 \
  keti-ct-gui

# Access web UI
# http://localhost:8080
```

---

## Post-Installation

### 1. Serial Port Setup

#### Check Device Connection

```bash
# List serial devices
ls -la /dev/ttyACM*
ls -la /dev/ttyUSB*

# Should see:
# crw-rw---- 1 root dialout ... /dev/ttyACM0
```

#### Setup Permissions

```bash
# Option 1: Add user to dialout group (permanent)
sudo usermod -a -G dialout $USER
# Logout and login required

# Option 2: Temporary fix for current session
sudo chmod 666 /dev/ttyACM0
```

#### Test Serial Connection

```bash
# Using CLI tool
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname

# Should see device response
```

### 2. Environment Configuration

#### Optional: Create .env file

```bash
cat > .env << 'EOF'
# Server Configuration
PORT=8080
HOST=0.0.0.0

# Serial Port Configuration
DEFAULT_DEVICE=/dev/ttyACM0
BAUD_RATE=115200

# YANG Schema Cache
YANG_CACHE_DIR=~/.velocitydrive-yang-cache

# Logging
LOG_LEVEL=info
EOF
```

### 3. YANG Schema Cache

The tool automatically downloads and caches YANG schemas:

```bash
# Cache location
~/.velocitydrive-yang-cache/

# Cache is created automatically on first run
# No manual setup required
```

### 4. Verify Installation

```bash
# Run all tests
npm test

# Run CLI tests
npm run test:cli

# Check CLI help
./cli.js --help

# Test device connection
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname
```

---

## Verification

### System Check

```bash
# Check Node.js version
node --version
# Should be: v18.0.0 or higher

# Check npm version
npm --version
# Should be: 9.0.0 or higher

# Check serial port
ls -la /dev/ttyACM*
# Should exist and be accessible
```

### Test Suite

```bash
# Run all tests
npm test

# Output should show:
# ✓ test-mup1.js
# ✓ test-coap-frame.js
# ✓ test-cbor.js
# ✓ test-sid.js
# ✓ test-sid-cbor.js
# ✓ test-yang-schema.js
# ✓ test-yang-converter.js
# ✓ test-coreconf-client.js
```

### CLI Test

```bash
# Run CLI test suite
./test-cli.sh

# Should show:
# ✅ CLI tool implemented
# ✅ All CORECONF operations supported
# ✅ PHASE 6 COMPLETE
```

### Web Server Test

```bash
# Start server
npm start

# Should see:
# ╔══════════════════════════════════════════════════════╗
# ║  KETI TSN Configuration Tool                         ║
# ║  Multi-Board Management System                       ║
# ╚══════════════════════════════════════════════════════╝
#
# 🌐 Server: http://localhost:8080
# 📡 Protocol: MUP1 + CoAP + CORECONF (No Docker)
# 🔧 Device Support: Multiple LAN9662 boards
```

Open browser: `http://localhost:8080`

### Device Test

```bash
# Test device connection
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname

# Expected output (example):
# [*] Connecting to device: /dev/ttyACM0
# [✓] Connected to /dev/ttyACM0
# [*] Initializing CORECONF client...
# [✓] Initialized with 1234 SIDs
# [*] FETCH 1 paths
# [✓] FETCH completed
#
# {
#   "/ietf-system:system/hostname": "lan9662-device"
# }
```

---

## Troubleshooting

### Issue: Permission Denied (EACCES)

**Problem:**
```
Error: EACCES: permission denied, open '/dev/ttyACM0'
```

**Solution:**
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Logout and login for changes to take effect

# Or temporary fix:
sudo chmod 666 /dev/ttyACM0
```

---

### Issue: Device Not Found

**Problem:**
```
Error: Device /dev/ttyACM0 not found
```

**Solution:**
```bash
# Check connected devices
ls -la /dev/ttyACM*
ls -la /dev/ttyUSB*

# Check if device is connected
dmesg | tail

# Try different USB port
# Check USB cable
# Restart device
```

---

### Issue: Port Already in Use

**Problem:**
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution:**
```bash
# Find process using port 8080
sudo lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3000 npm start
```

---

### Issue: Module Not Found

**Problem:**
```
Error: Cannot find module 'express'
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

---

### Issue: Node.js Version Too Old

**Problem:**
```
Error: The engine "node" is incompatible with this module
```

**Solution:**
```bash
# Check current version
node --version

# Update Node.js (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

---

### Issue: YANG Schema Download Failed

**Problem:**
```
Error: Failed to download YANG schema
```

**Solution:**
```bash
# Check internet connection
ping -c 3 artifactory.microchip.com

# Check firewall
# May need proxy configuration

# Manual cache setup (if needed)
mkdir -p ~/.velocitydrive-yang-cache
```

---

### Issue: Tests Failing

**Problem:**
```
npm test fails
```

**Solution:**
```bash
# Check Node.js version
node --version
# Must be >= 18.0.0

# Clean install
rm -rf node_modules
npm install

# Run tests individually
node test-cbor.js
node test-sid.js
# etc.

# Check for specific errors
npm test --verbose
```

---

## Advanced Configuration

### Custom Serial Port

```javascript
// In server-complete.js or your code
const PORT = '/dev/ttyUSB0';  // Change this
```

### Custom Server Port

```bash
# Environment variable
PORT=3000 npm start

# Or edit .env file
echo "PORT=3000" > .env
npm start
```

### YANG Cache Location

```bash
# Default: ~/.velocitydrive-yang-cache/

# Custom location (edit lib/yang-schema-manager.js)
const CACHE_DIR = '/custom/path/cache';
```

---

## Uninstallation

### Remove Application

```bash
# If installed globally
npm uninstall -g keti-ct-gui

# If cloned from git
cd KETI-CT-GUI
rm -rf node_modules
cd ..
rm -rf KETI-CT-GUI
```

### Remove Cache

```bash
# Remove YANG schema cache
rm -rf ~/.velocitydrive-yang-cache
```

### Remove Configuration

```bash
# Remove any config files you created
rm .env
```

### Remove from dialout Group

```bash
# Remove user from dialout group
sudo deluser $USER dialout
# Logout and login required
```

---

## Next Steps

After successful installation:

1. **Read Documentation**
   - `README.md` - Project overview
   - `CLI_GUIDE.md` - CLI tool usage
   - `ARCHITECTURE.md` - System architecture

2. **Try Examples**
   - Web UI: `http://localhost:8080`
   - CLI: `./cli.js --help`
   - Examples: `examples/` directory

3. **Development**
   - Run in watch mode: `npm run dev`
   - Run tests: `npm test`
   - View logs: Check console output

4. **Get Help**
   - Issues: https://github.com/hwkim3330/KETI-CT-GUI/issues
   - Documentation: Project `README.md`

---

## Support

- **GitHub**: https://github.com/hwkim3330/KETI-CT-GUI
- **Issues**: https://github.com/hwkim3330/KETI-CT-GUI/issues
- **Documentation**: See `README.md`, `CLI_GUIDE.md`

---

**Installation Guide Version:** 1.0.0
**Last Updated:** 2025-10-27
