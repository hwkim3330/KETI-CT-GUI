#!/bin/bash

# KETI-CT-GUI Quick Start Script

echo "╔══════════════════════════════════════════════════════╗"
echo "║  KETI-CT-GUI Quick Start                             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Node.js not found. Please install Node.js >= 18.0.0"
    exit 1
fi

NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Need >= 18.0.0"
    exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# Check npm
echo ""
echo "🔍 Checking npm..."
NPM_VERSION=$(npm --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm $NPM_VERSION"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed"
fi

# Make scripts executable
echo ""
echo "🔧 Setting up permissions..."
chmod +x cli.js 2>/dev/null
chmod +x test-cli.sh 2>/dev/null
chmod +x start.sh 2>/dev/null
echo "✅ Permissions set"

# Check serial port
echo ""
echo "🔍 Checking serial ports..."
if ls /dev/ttyACM* 1> /dev/null 2>&1; then
    echo "✅ Serial ports found:"
    ls -la /dev/ttyACM* 2>/dev/null | awk '{print "   " $0}'

    # Check permissions
    if [ ! -r /dev/ttyACM0 ] && [ -e /dev/ttyACM0 ]; then
        echo ""
        echo "⚠️  Permission issue detected. To fix:"
        echo "   sudo usermod -a -G dialout $USER"
        echo "   (Then logout and login)"
        echo ""
        echo "   Or temporary fix:"
        echo "   sudo chmod 666 /dev/ttyACM0"
    fi
else
    echo "⚠️  No serial ports found (/dev/ttyACM*)"
    echo "   Connect your LAN9662 device via USB"
fi

# Show menu
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Choose an option:                                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  1) Start Web UI (http://localhost:8080)"
echo "  2) Run CLI Tool"
echo "  3) Run Tests"
echo "  4) Show Help"
echo "  5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Web UI..."
        echo "   Open http://localhost:8080 in your browser"
        echo ""
        npm start
        ;;
    2)
        echo ""
        echo "💻 CLI Tool"
        echo ""
        ./cli.js --help
        echo ""
        echo "Example commands:"
        echo "  ./cli.js device /dev/ttyACM0 get /c"
        echo "  ./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname"
        ;;
    3)
        echo ""
        echo "🧪 Running tests..."
        echo ""
        npm test && ./test-cli.sh
        ;;
    4)
        echo ""
        echo "📚 Documentation:"
        echo "  README.md          - Project overview"
        echo "  CLI_GUIDE.md       - CLI usage guide"
        echo "  INSTALL.md         - Installation guide"
        echo "  ARCHITECTURE.md    - System architecture"
        echo ""
        echo "Quick examples:"
        echo "  # Web UI"
        echo "  npm start"
        echo ""
        echo "  # CLI Tool"
        echo "  ./cli.js device /dev/ttyACM0 get /c"
        echo "  ./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname"
        echo "  ./cli.js device /dev/ttyACM0 ipatch examples/ipatch-example.json"
        echo ""
        ;;
    5)
        echo ""
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo ""
        echo "❌ Invalid choice. Run ./start.sh again."
        exit 1
        ;;
esac
