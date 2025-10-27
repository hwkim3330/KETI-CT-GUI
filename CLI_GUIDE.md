# CLI Tool Guide

**CORECONF CLI Tool for Microchip LAN9662 VelocityDRIVE**

A command-line interface compatible with mup1ct/mvdct for YANG-based device configuration using CORECONF (RFC 9254).

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
- [Options Reference](#options-reference)
- [Examples](#examples)
- [File Formats](#file-formats)
- [Troubleshooting](#troubleshooting)

## Installation

The CLI tool is included in the KETI-CT-GUI package. No additional installation required.

```bash
# Make executable (if not already)
chmod +x cli.js

# Test installation
./cli.js --help
```

## Quick Start

### 1. Connect Device

Ensure your LAN9662 board is connected via USB:

```bash
# Check device is available
ls -la /dev/ttyACM*

# Should see: /dev/ttyACM0 (or similar)
```

### 2. Basic Usage

```bash
# Get current hostname
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname

# Get all interfaces
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces

# Change hostname
./cli.js device /dev/ttyACM0 ipatch examples/ipatch-example.json
```

## Command Reference

### Command Syntax

```bash
./cli.js device <port> <operation> [parameters...] [options...]
```

### Operations

#### GET - Retrieve Configuration

Retrieve configuration from a specific path or entire datastore.

**Syntax:**
```bash
./cli.js device <port> get <path> [--depth <d>] [--content <c>]
```

**Parameters:**
- `<path>`: YANG path (e.g., `/ietf-interfaces:interfaces`, `/c` for root)

**Options:**
- `--depth <d>`: `a` (all descendants), `t` (immediate children only)
- `--content <c>`: `a` (all), `c` (config only), `n` (status only)

**Examples:**
```bash
# Get entire configuration with all descendants
./cli.js device /dev/ttyACM0 get /c --depth a --content a

# Get only config data (no status)
./cli.js device /dev/ttyACM0 get /c --content c

# Get immediate children only
./cli.js device /dev/ttyACM0 get /c --depth t

# Get specific module
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces
```

**Notes:**
- GET retrieves the entire subtree at the specified path
- Use `--content c` to exclude operational state data
- Use `--depth t` for shallow queries

---

#### FETCH - Query Multiple Nodes

Fetch specific data nodes (more efficient than multiple GETs).

**Syntax:**
```bash
./cli.js device <port> fetch <path1> [path2] [path3] ...
```

**Parameters:**
- `<path>`: One or more YANG paths

**Examples:**
```bash
# Fetch single node
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname

# Fetch multiple nodes in one request
./cli.js device /dev/ttyACM0 fetch \
    /ietf-system:system/hostname \
    /ietf-system:system/location \
    /ietf-interfaces:interfaces
```

**Notes:**
- FETCH is more efficient than GET for specific nodes
- Returns array of {path: value} objects
- All paths are fetched in a single transaction

---

#### IPATCH - Modify Configuration

Apply patches to modify configuration (RFC 8132).

**Syntax:**
```bash
./cli.js device <port> ipatch <file.json>
```

**Parameters:**
- `<file.json>`: JSON file containing array of {path: value} objects

**File Format:**
```json
[
    {"/ietf-system:system/hostname": "my-device"},
    {"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/enabled": true},
    {"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/description": "Primary Interface"}
]
```

**Examples:**
```bash
# Apply patches from file
./cli.js device /dev/ttyACM0 ipatch examples/ipatch-example.json

# Verbose mode to see progress
./cli.js device /dev/ttyACM0 ipatch patches.json --verbose
```

**Notes:**
- All patches are applied atomically
- Use YANG paths with instance identifiers for lists
- Changes are committed automatically

---

#### PUT - Replace Configuration

Replace entire configuration (use with caution!).

**Syntax:**
```bash
./cli.js device <port> put <file.json>
```

**Parameters:**
- `<file.json>`: JSON file containing complete configuration tree

**File Format:**
```json
{
    "ietf-interfaces:interfaces": {
        "interface": [
            {
                "name": "eth0",
                "type": "iana-if-type:ethernetCsmacd",
                "enabled": true,
                "description": "Primary Ethernet Interface"
            }
        ]
    },
    "ietf-system:system": {
        "hostname": "my-device"
    }
}
```

**Examples:**
```bash
# Replace entire configuration
./cli.js device /dev/ttyACM0 put examples/put-example.json

# Backup first, then restore
./cli.js device /dev/ttyACM0 get /c --output backup.json
./cli.js device /dev/ttyACM0 put backup.json
```

**Notes:**
- PUT replaces the entire configuration
- Existing configuration not in the file will be deleted
- Always backup before using PUT

---

#### POST - Execute RPC/Action

Execute RPC calls or actions.

**Syntax:**
```bash
./cli.js device <port> post <rpc-path> [parameters]
```

**Parameters:**
- `<rpc-path>`: YANG RPC path
- `[parameters]`: Optional JSON parameters

**Examples:**
```bash
# System restart (no parameters)
./cli.js device /dev/ttyACM0 post /ietf-system:system-restart

# RPC with parameters (JSON string)
./cli.js device /dev/ttyACM0 post /my-module:my-rpc '{"param1": "value1"}'
```

**Notes:**
- POST is used for RPCs and actions
- Some RPCs may require parameters
- Response may contain output data

---

## Options Reference

### Output Options

#### `--output <file>`
Write output to file instead of stdout.

```bash
# Save as JSON
./cli.js device /dev/ttyACM0 get /c --output config.json

# Save as YAML (planned)
./cli.js device /dev/ttyACM0 get /c --output config.yaml
```

#### `--format <fmt>`
Output format: `json`, `yaml`, `pretty` (default: `pretty`)

```bash
# JSON output
./cli.js device /dev/ttyACM0 get /c --format json

# Pretty output (colored, human-readable)
./cli.js device /dev/ttyACM0 get /c --format pretty
```

#### `--no-color`
Disable colored output (useful for piping or logging).

```bash
./cli.js device /dev/ttyACM0 get /c --no-color > output.txt
```

### Query Options (GET only)

#### `--depth <d>`
- `a`: All descendants (default)
- `t`: Immediate children only (depth=1)

```bash
# Get all descendants
./cli.js device /dev/ttyACM0 get /c --depth a

# Get immediate children only
./cli.js device /dev/ttyACM0 get /c --depth t
```

#### `--content <c>`
- `a`: All data (config + status) (default)
- `c`: Config data only
- `n`: Non-config (status) data only

```bash
# Get all data
./cli.js device /dev/ttyACM0 get /c --content a

# Get config only
./cli.js device /dev/ttyACM0 get /c --content c

# Get status only
./cli.js device /dev/ttyACM0 get /c --content n
```

### Debug Options

#### `--verbose`
Enable verbose logging (shows all operations).

```bash
./cli.js device /dev/ttyACM0 get /c --verbose
```

Output includes:
- Connection status
- Schema loading progress
- CoAP request/response details
- Timing information

#### `--help`
Show help message.

```bash
./cli.js --help
```

---

## Examples

### Example 1: Backup and Restore

```bash
# 1. Backup current configuration
./cli.js device /dev/ttyACM0 get /c \
    --output backup-$(date +%Y%m%d-%H%M%S).json \
    --format json

# 2. Make changes
./cli.js device /dev/ttyACM0 ipatch my-changes.json

# 3. Restore if needed
./cli.js device /dev/ttyACM0 put backup-20250127-143000.json
```

### Example 2: System Information

```bash
# Get hostname
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname

# Get system info
./cli.js device /dev/ttyACM0 fetch \
    /ietf-system:system/hostname \
    /ietf-system:system/contact \
    /ietf-system:system/location

# Save to file
./cli.js device /dev/ttyACM0 get /ietf-system:system \
    --output system-info.json \
    --format json
```

### Example 3: Interface Configuration

```bash
# Get all interfaces
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces

# Enable interface
cat > enable-eth0.json << 'EOF'
[
    {"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/enabled": true}
]
EOF
./cli.js device /dev/ttyACM0 ipatch enable-eth0.json

# Set description
cat > set-desc.json << 'EOF'
[
    {"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/description": "Primary Port"}
]
EOF
./cli.js device /dev/ttyACM0 ipatch set-desc.json
```

### Example 4: Automated Configuration

```bash
#!/bin/bash
# configure-device.sh

DEVICE="/dev/ttyACM0"
CLI="./cli.js"

echo "Configuring device..."

# 1. Set hostname
echo "[1/3] Setting hostname..."
echo '[{"/ietf-system:system/hostname": "my-switch"}]' > /tmp/hostname.json
$CLI device $DEVICE ipatch /tmp/hostname.json

# 2. Configure interfaces
echo "[2/3] Configuring interfaces..."
$CLI device $DEVICE ipatch examples/interfaces.json

# 3. Verify
echo "[3/3] Verifying configuration..."
$CLI device $DEVICE fetch /ietf-system:system/hostname

echo "Configuration complete!"
```

### Example 5: Monitoring Script

```bash
#!/bin/bash
# monitor-interfaces.sh

DEVICE="/dev/ttyACM0"
CLI="./cli.js"

while true; do
    clear
    echo "=== Interface Status ==="
    date
    echo ""

    $CLI device $DEVICE get /ietf-interfaces:interfaces \
        --content n \
        --no-color

    sleep 5
done
```

---

## File Formats

### IPATCH File Format

```json
[
    {"<yang-path>": <value>},
    {"<yang-path>": <value>}
]
```

**Example:**
```json
[
    {"/ietf-system:system/hostname": "my-device"},
    {"/ietf-system:system/contact": "admin@example.com"},
    {"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/enabled": true}
]
```

### PUT File Format

```json
{
    "<module>:<container>": {
        "<leaf>": <value>,
        "<list>": [...]
    }
}
```

**Example:**
```json
{
    "ietf-system:system": {
        "hostname": "my-device",
        "contact": "admin@example.com",
        "location": "Server Room 1"
    },
    "ietf-interfaces:interfaces": {
        "interface": [
            {
                "name": "eth0",
                "type": "iana-if-type:ethernetCsmacd",
                "enabled": true,
                "description": "Primary Interface"
            }
        ]
    }
}
```

---

## Troubleshooting

### Error: Cannot connect to device

**Problem:** `Failed to connect: EACCES: permission denied`

**Solution:**
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Or set permissions temporarily
sudo chmod 666 /dev/ttyACM0
```

### Error: Device not found

**Problem:** `/dev/ttyACM0: No such file or directory`

**Solution:**
```bash
# Check connected devices
ls -la /dev/ttyACM*
ls -la /dev/ttyUSB*

# Use correct device path
./cli.js device /dev/ttyACM1 get /c
```

### Error: Client not initialized

**Problem:** `Client not initialized. Call initialize() first.`

**Solution:**
- This usually indicates a problem with YANG schema fetching
- Check device firmware version (requires VelocitySP-v2025.06+)
- Try with `--verbose` to see detailed error

```bash
./cli.js device /dev/ttyACM0 get /c --verbose
```

### Error: IPATCH failed

**Problem:** `IPATCH failed: 4.0`

**Solution:**
- Check that YANG paths are correct
- Verify values match YANG schema types
- Use `--verbose` to see detailed error
- Try GET to verify current state first

```bash
# Get current state
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces

# Check path syntax (use proper escaping)
# Correct:
{"/ietf-interfaces:interfaces/interface[name=\"eth0\"]/enabled": true}
```

### Error: No SID found for path

**Problem:** `No SID found for path: /my-module:my-path`

**Solution:**
- The path doesn't exist in the YANG schema
- Check available paths with GET
- Verify module name and path syntax

```bash
# List all available modules
./cli.js device /dev/ttyACM0 get /c --depth t

# Get schema info
./cli.js device /dev/ttyACM0 get /c --verbose
```

### Performance Issues

**Problem:** Commands are slow

**Solution:**
- Use FETCH instead of GET for specific nodes
- Use `--depth t` for shallow queries
- Use `--content c` to exclude operational data
- Schema is cached after first use (faster on subsequent runs)

---

## Advanced Usage

### Scripting

The CLI tool is designed for scripting:

```bash
# Exit codes
# 0: Success
# 1: Error

# Example script
if ./cli.js device /dev/ttyACM0 get /c --output config.json; then
    echo "Backup successful"
else
    echo "Backup failed!"
    exit 1
fi
```

### CI/CD Integration

```yaml
# .gitlab-ci.yml
test-device:
  script:
    - ./cli.js device /dev/ttyACM0 get /c --format json --output config.json
    - ./cli.js device /dev/ttyACM0 ipatch test-config.json
    - ./cli.js device /dev/ttyACM0 get /c --format json --output config-after.json
    - diff config.json config-after.json
```

### JSON Processing with jq

```bash
# Get hostname only
./cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname \
    --format json | jq '.[0]'

# Count interfaces
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces \
    --format json | jq '.["ietf-interfaces:interfaces"].interface | length'

# Filter enabled interfaces
./cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces \
    --format json | jq '.["ietf-interfaces:interfaces"].interface[] | select(.enabled == true)'
```

---

## Comparison with mup1ct/mvdct

| Feature | mup1ct/mvdct | cli.js |
|---------|--------------|--------|
| Platform | x86 only | All (ARM, x86, any Node.js) |
| Dependencies | Binary | Node.js only |
| GET | ✅ | ✅ |
| FETCH | ✅ | ✅ |
| IPATCH | ✅ | ✅ |
| PUT | ✅ | ✅ |
| POST | ✅ | ✅ |
| Pretty output | ❌ | ✅ |
| Colors | ❌ | ✅ |
| Progress | ❌ | ✅ |
| YAML | ✅ | 🔄 Planned |

---

## See Also

- [README.md](README.md) - Full project documentation
- [FINAL_SUMMARY.md](FINAL_SUMMARY.md) - Implementation details
- [test-cli.sh](test-cli.sh) - CLI test suite
- [examples/](examples/) - Example configuration files

---

**Version:** 1.0.0
**License:** MIT
**Author:** KETI TSN Project
