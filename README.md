# KETI TSN Configuration Tool

**Multi-Board Management System for Microchip LAN9662**

A comprehensive web-based management interface for Time-Sensitive Networking (TSN) configuration on Microchip LAN9662 switches. Implements MUP1 + CoAP + CORECONF protocols without Docker dependencies.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🚀 Core Capabilities
- **Multi-Board Support**: Manage multiple LAN9662 boards simultaneously
- **Direct Protocol Implementation**: Pure Node.js MUP1 + CoAP (no Docker required)
- **Full YANG Support**: Complete YANG-based configuration management
- **TSN Configuration**: IEEE 802.1Qbv (TAS), IEEE 802.1Qav (CBS) support
- **Real-Time Monitoring**: Live device status and statistics
- **Modern Web UI**: Clean, responsive interface with dark mode

### 📡 Protocol Stack
- **MUP1**: Microchip UART Protocol #1 for serial framing
- **CoAP**: Constrained Application Protocol (RFC 7252)
- **CORECONF**: YANG-based configuration over CoAP (RFC 9254)
- **CBOR**: Compact Binary Object Representation for data encoding

### 🎨 User Interface
- **Device Manager**: Auto-discovery and connection management
- **YANG Browser**: Tree/JSON/YAML views of complete configuration
- **Interface Monitor**: Network interface status and statistics
- **Bridge Configuration**: IEEE 802.1Q bridge settings
- **TSN Scheduler**: Time-Aware Shaper and Credit-Based Shaper configuration
- **CoAP Console**: Interactive protocol debugging
- **Request History**: Comprehensive request logging

## Requirements

### Hardware
- Microchip LAN9662 VelocityDRIVE board(s)
- USB connection (appears as `/dev/ttyACM*` devices)

### Software
- **Node.js**: ≥18.0.0
- **npm**: Latest version
- **Linux**: Tested on Ubuntu 22.04+
- **Serial Port Access**: User must be in `dialout` group

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/hwkim3330/KETI-CT-GUI.git
cd KETI-CT-GUI
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Serial Port Permissions
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Set permissions for current session (temporary)
sudo chmod 666 /dev/ttyACM*

# Logout and login for permanent effect
```

### 4. Start Server
```bash
npm start
```

The server will start on `http://localhost:8080`

## Usage

### Starting the Server

```bash
npm start
```

Output:
```
╔══════════════════════════════════════════════════════╗
║  KETI TSN Configuration Tool                         ║
║  Multi-Board Management System                       ║
╚══════════════════════════════════════════════════════╝

🌐 Server: http://localhost:8080
🌐 Network: http://<your-ip>:8080

📡 Protocol: MUP1 + CoAP + CORECONF (No Docker)
🔧 Device Support: Multiple LAN9662 boards

🔍 Auto-scanning for devices...
```

### Web Interface

1. **Open Browser**: Navigate to `http://localhost:8080`
2. **Scan for Devices**: Click "Scan" button to discover connected boards
3. **Select Device**: Click on a device in the sidebar
4. **Explore Configuration**: Use tabs to view different aspects

### API Endpoints

#### Device Management
```javascript
GET    /api/devices              // List all devices
POST   /api/devices/scan         // Trigger device scan
POST   /api/devices/:path/connect    // Connect to device
POST   /api/devices/:path/disconnect // Disconnect from device
GET    /api/devices/:path/info       // Get device information
```

#### Configuration
```javascript
POST   /api/devices/:path/coap       // Execute CoAP request
GET    /api/devices/:path/yang       // Get YANG configuration
GET    /api/devices/:path/interfaces // Get network interfaces
GET    /api/devices/:path/bridge     // Get bridge configuration
GET    /api/devices/:path/scheduler  // Get TSN scheduler config
```

#### Monitoring
```javascript
GET    /api/history          // Get request history
DELETE /api/history          // Clear history
GET    /api/stats            // Get server statistics
```

### CoAP Console Examples

#### Get All Configuration
```
Method: GET
URI: /c?d=a
Payload: (empty)
```

#### Get Specific Interface
```
Method: GET
URI: /c
Payload: (leave empty, filtering done by URI params)
```

#### Set Interface Status
```
Method: IPATCH
URI: /c
Payload: {
  "ietf-interfaces:interfaces": {
    "interface": [
      {
        "name": "eth0",
        "admin-state": "up"
      }
    ]
  }
}
```

## Architecture

### Project Structure
```
KETI-CT-GUI/
├── lib/
│   ├── mup1-protocol.js    # MUP1 protocol implementation
│   ├── coap-client.js      # CoAP client with CORECONF
│   └── device-manager.js   # Multi-device manager
├── public/
│   ├── index.html          # Main UI
│   ├── css/
│   │   └── style.css       # Styling
│   └── js/
│       └── app.js          # Frontend logic
├── server.js               # Express server
├── package.json
└── README.md
```

### Protocol Flow

```
┌─────────────┐
│  Web UI     │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────┐
│ Express     │
│ Server      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Device      │
│ Manager     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     MUP1 Frames      ┌─────────────┐
│ CoAP Client │ ◄─────────────────► │ SerialPort  │
└─────────────┘                       └──────┬──────┘
       │                                     │
       │ Encode/Decode                       │ UART
       ▼                                     ▼
┌─────────────┐                       ┌─────────────┐
│ MUP1        │                       │ /dev/ttyACM*│
│ Protocol    │                       └──────┬──────┘
└─────────────┘                              │
                                             ▼
                                      ┌─────────────┐
                                      │  LAN9662    │
                                      │  Board      │
                                      └─────────────┘
```

### MUP1 Frame Format

```
>TYPE[ESCAPED_DATA]<[<]CHECKSUM

Where:
  > (0x3E)       - Start of Frame
  TYPE           - Command type (A=Announcement, C=CoAP, P=Ping, T=Trace)
  [DATA]         - Escaped payload
  < (0x3C)       - End of Frame (doubled for padding)
  CHECKSUM       - 4-char hex checksum
```

### CoAP Message Format

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Ver| T |  TKL  |      Code     |          Message ID           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Options (if any) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|1 1 1 1 1 1 1 1|    Payload (CBOR) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

## Configuration

### Serial Port Settings
- **Baud Rate**: 115200
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Flow Control**: None

### Server Settings
Edit `server.js` to configure:

```javascript
const PORT = process.env.PORT || 8080;  // Server port
```

Edit `lib/device-manager.js` for device scanning:

```javascript
startAutoScan(interval = 5000);  // Scan interval in ms
```

## Known Issues

### Direct Serial MUP1 Communication
Currently, the pure JavaScript MUP1 protocol implementation sends frames but receives "MUP1 error" from the board. This is being investigated. The frame structure and checksum appear correct based on the MUP1 specification, but the board doesn't accept it.

**Workaround**: Use the official mup1cc tool via Docker wrapper (see `web-server-mup1cc.js` in keti-tsn-ms repository).

**Status**: Under active development. Contributors welcome!

## Troubleshooting

### Device Not Detected
```bash
# Check if device is connected
ls -la /dev/ttyACM*

# Check permissions
sudo chmod 666 /dev/ttyACM*

# Add user to dialout group
sudo usermod -a -G dialout $USER
```

### Connection Timeout
- Verify board is powered on
- Check USB connection
- Try different USB port
- Restart the board

### Port Already in Use
```bash
# Find process using port 8080
sudo lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3000 npm start
```

### Cannot Parse CBOR
- Board may not support CORECONF
- Check firmware version (requires VelocitySP-v2025.06+)
- Try simpler GET request first

## Development

### Run in Development Mode
```bash
npm run dev  # Auto-restart on file changes
```

### Testing Protocol
```bash
node test/test-protocol.js  # Test MUP1 encoding/decoding
```

### Debug Mode
Enable verbose logging:
```javascript
// In lib/coap-client.js
console.log('[DEBUG]', ...);
```

## References

### Standards
- [RFC 7252](https://datatracker.ietf.org/doc/html/rfc7252) - CoAP Protocol
- [RFC 9254](https://datatracker.ietf.org/doc/html/rfc9254) - CORECONF (YANG over CoAP)
- [RFC 8949](https://datatracker.ietf.org/doc/html/rfc8949) - CBOR Encoding
- [RFC 7951](https://datatracker.ietf.org/doc/html/rfc7951) - YANG JSON Encoding
- [IEEE 802.1Qbv](https://standards.ieee.org/standard/802_1Qbv-2015.html) - Time-Aware Shaper
- [IEEE 802.1Qav](https://standards.ieee.org/standard/802_1Qav-2009.html) - Credit-Based Shaper

### Microchip Resources
- [VelocityDRIVE Support](https://github.com/microchip-ung/velocitydrivesp-support)
- [LAN9662 Documentation](https://microchip-ung.github.io/lan966x-tsn-doc/)
- [MUP1 Protocol Specification](https://github.com/microchip-ung/velocitydrivesp-support/blob/main/mup1.md)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and questions:
- GitHub Issues: [https://github.com/hwkim3330/KETI-CT-GUI/issues](https://github.com/hwkim3330/KETI-CT-GUI/issues)
- Email: KETI Support

## Changelog

### Version 1.0.0 (2025-10-16)
- ✅ Initial release
- ✅ Multi-board support
- ✅ Direct MUP1 + CoAP implementation (no Docker)
- ✅ Complete YANG browser
- ✅ TSN configuration interface
- ✅ Real-time monitoring
- ✅ Modern web UI

---

**Made with ❤️ by KETI**
