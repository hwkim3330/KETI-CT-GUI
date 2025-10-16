#!/bin/bash

# KETI TSN Configuration Tool - Startup Script

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  KETI TSN Configuration Tool - Startup               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Install: sudo apt install nodejs npm"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
fi

echo "✓ npm version: $(npm --version)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
fi

# Check for devices
echo ""
echo "🔍 Checking for connected devices..."
if ls /dev/ttyACM* 1> /dev/null 2>&1; then
    echo "✓ Found devices:"
    ls -la /dev/ttyACM*
else
    echo "⚠️  No /dev/ttyACM* devices found!"
    echo "   Please connect your LAN9662 board"
fi

# Check permissions
echo ""
echo "🔐 Checking serial port permissions..."
if [ -e "/dev/ttyACM0" ] && [ ! -w "/dev/ttyACM0" ]; then
    echo "⚠️  No write permission on /dev/ttyACM0"
    echo "   Fix: sudo chmod 666 /dev/ttyACM*"
    echo "   Or:  sudo usermod -a -G dialout $USER (then logout/login)"
fi

echo ""
echo "🚀 Starting server..."
echo ""

# Start server
node server.js
