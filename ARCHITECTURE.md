# System Architecture

Complete architecture documentation for KETI-CT-GUI.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Protocol Stack](#protocol-stack)
- [Module Breakdown](#module-breakdown)
- [Data Flow](#data-flow)
- [Design Decisions](#design-decisions)

---

## Overview

KETI-CT-GUI is a pure JavaScript implementation of CORECONF (RFC 9254) protocol stack for managing Microchip LAN9662 TSN switches. The system provides both a web interface and CLI tool for device configuration.

### Key Features

- **Pure JavaScript**: No binary dependencies, works on ARM and x86
- **Complete Protocol Stack**: MUP1 + CoAP + CORECONF
- **Ruby Compatible**: 100% compatible with official Microchip tools
- **Multi-Board Support**: Manage multiple devices simultaneously
- **RFC Compliant**: Follows all relevant IETF and IEEE standards

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Layer                          │
├─────────────────────────┬───────────────────────────────────┤
│     Web Browser         │         CLI Tool                  │
│  (http://localhost:8080)│       (./cli.js)                  │
└─────────────┬───────────┴───────────────┬───────────────────┘
              │                           │
              │ REST API (Express)        │ Direct API
              │                           │
┌─────────────▼───────────────────────────▼───────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CORECONF Client (High-Level API)             │  │
│  │  • initialize() • fetch() • ipatch()                 │  │
│  │  • get() • put() • post()                            │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         YANG Converter (RFC 7951 ↔ RFC 9254)         │  │
│  │  • JSON ↔ CBOR conversion                            │  │
│  │  • Path ↔ SID conversion                             │  │
│  │  • Content-Format handling (140/141/142)             │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │       YANG Schema Manager (RFC 9595)                 │  │
│  │  • Schema fetching from device                       │  │
│  │  • Remote catalog download                           │  │
│  │  • Local caching                                     │  │
│  │  • SID ↔ Path mapping                                │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │            SID Manager (RFC 9595)                    │  │
│  │  • Base64 URL-safe encoding                          │  │
│  │  • .sid file parsing                                 │  │
│  │  • SIDSchema class                                   │  │
│  └────────────────────┬─────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Protocol Layer                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CoAP Client (RFC 7252, RFC 8132)             │  │
│  │  • Request/Response state machine                    │  │
│  │  • Block-wise transfer (Block1/Block2)               │  │
│  │  • Methods: GET, POST, PUT, DELETE, FETCH, IPATCH    │  │
│  │  • Retransmission & timeout                          │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         CoAP Frame (RFC 7252)                        │  │
│  │  • Frame encoding/decoding                           │  │
│  │  • Option encoding (delta/length)                    │  │
│  │  • Payload marker (0xFF)                             │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         CBOR Encoder/Decoder (RFC 7049/8949)         │  │
│  │  • Basic types (int, str, array, map)                │  │
│  │  • Large integers (SIDs)                             │  │
│  │  • Nested structures                                 │  │
│  └────────────────────┬─────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   Transport Layer                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Serial Handler (State Machine)               │  │
│  │  • MUP1 frame parsing                                │  │
│  │  • Frame types: C (CoAP), A (Announce), T (Trace)    │  │
│  │  • Buffering & timeout                               │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         MUP1 Protocol (Microchip UART #1)            │  │
│  │  • Frame format: >TYPE[DATA]<[<]CHECKSUM             │  │
│  │  • Escaping: 0x00, 0xFF, SOF, EOF, ESC               │  │
│  │  • Checksum: 16-bit one's complement                 │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         Device Connection (SerialPort)               │  │
│  │  • Serial port management                            │  │
│  │  • Event handling                                    │  │
│  │  • Auto-reconnect                                    │  │
│  └────────────────────┬─────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   Physical Layer                            │
├─────────────────────────────────────────────────────────────┤
│                  /dev/ttyACM* (USB-Serial)                  │
│                  Baud: 115200, 8N1                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Microchip LAN9662 Device                       │
│              (VelocityDRIVE TSN Switch)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Protocol Stack

### Layer Breakdown

#### 1. Physical Layer
- **USB-Serial**: `/dev/ttyACM*` or `/dev/ttyUSB*`
- **Baud Rate**: 115200
- **Data Format**: 8N1 (8 data bits, no parity, 1 stop bit)
- **Flow Control**: None

#### 2. MUP1 Layer (Transport)
**Frame Format:**
```
>TYPE[ESCAPED_DATA]<[<]CHECKSUM

Components:
  > (0x3E)       - Start of Frame (SOF)
  TYPE           - Frame type (A/C/P/T)
  [DATA]         - Escaped payload
  < (0x3C)       - End of Frame (EOF)
  [<]            - Padding (optional)
  CHECKSUM       - 4-char hex (16-bit one's complement)
```

**Escaping:**
- `0x00` → `\x01\x00`
- `0xFF` → `\x01\xFF`
- `<` (0x3C) → `\x01<`
- `>` (0x3E) → `\x01>`
- `\x01` (ESC) → `\x01\x01`

**Frame Types:**
- `A`: Announcement (device info)
- `C`: CoAP message
- `T`: Trace/debug
- `P`: Ping/keepalive

#### 3. CoAP Layer (Application)
**CoAP Message Format (RFC 7252):**
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Ver| T |  TKL  |      Code     |          Message ID           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Token (if any, TKL bytes) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Options (if any) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|1 1 1 1 1 1 1 1|    Payload (if any) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Methods:**
- `GET` (1): Retrieve resource
- `POST` (2): Execute action/RPC
- `PUT` (3): Replace resource
- `DELETE` (4): Delete resource
- `FETCH` (5): Query specific nodes (RFC 8132)
- `IPATCH` (7): Modify resource (RFC 8132)

**Options:**
- `Uri-Path` (11): URI path segments
- `Content-Format` (12): Payload content type
- `Uri-Query` (15): Query parameters
- `Accept` (17): Acceptable content types
- `Block2` (23): Response block-wise transfer
- `Block1` (27): Request block-wise transfer

#### 4. CBOR Layer (Encoding)
**CBOR Types (RFC 7049/8949):**
- Major type 0: Unsigned integer
- Major type 1: Negative integer
- Major type 2: Byte string
- Major type 3: Text string
- Major type 4: Array
- Major type 5: Map
- Major type 6: Tagged value
- Major type 7: Simple values (null, true, false)

#### 5. CORECONF Layer (Data Model)
**Content-Formats (RFC 9254):**
- `140`: application/yang-data+cbor (YANG Data)
- `141`: application/yang-identifiers+cbor (SID array)
- `142`: application/yang-instances+cbor (SID: value pairs)

**Operations:**
```
GET /c?d=a&c=a
  → Retrieve full configuration
  → Query params: depth (a/t), content (a/c/n)

FETCH /c
  Content-Format: 141
  [SID1, SID2, ...]
  → Query specific nodes

IPATCH /c
  Content-Format: 142
  {SID1: value1, SID2: value2}
  → Modify configuration

PUT /c
  Content-Format: 140
  {complete YANG tree}
  → Replace configuration

POST /c
  Content-Format: 142
  {SID_rpc: parameters}
  → Execute RPC/action
```

---

## Module Breakdown

### Core Modules

#### 1. lib/mup1-protocol.js (130 LOC)
**Purpose:** MUP1 frame encoding/decoding

**Key Functions:**
```javascript
encodeMUP1Frame(type, payload)
  → Returns: Buffer with framed data

decodeMUP1Frame(buffer)
  → Returns: { type, payload, checksum }

calculateChecksum(data)
  → Returns: 16-bit one's complement

escapeData(data)
  → Returns: Escaped buffer

unescapeData(data)
  → Returns: Unescaped buffer
```

#### 2. lib/coap-frame.js (280 LOC)
**Purpose:** CoAP message encoding/decoding

**Key Functions:**
```javascript
encodeCoAPMessage(options)
  → Returns: Buffer

decodeCoAPMessage(buffer)
  → Returns: { version, type, code, messageId, token, options, payload }

encodeOption(number, value)
  → Returns: Buffer

decodeOptions(buffer)
  → Returns: Array of { number, value }
```

#### 3. lib/coap-client-new.js (396 LOC)
**Purpose:** CoAP request/response handling

**Key Functions:**
```javascript
async executeCoAP(method, uri, payload, options)
  → Returns: { codeClass, codeDetail, payload }

handleBlockWise(...)
  → Handles Block1/Block2 transfer

retransmit(...)
  → 3 second timeout, 5 retries max
```

#### 4. lib/sid-manager.js (234 LOC)
**Purpose:** SID encoding and .sid file parsing

**Key Classes:**
```javascript
class SIDSchema {
  sidToPath: Map<number, object>
  pathToSid: Map<string, object>

  loadFromFile(filePath)
  getSID(path)
  getPath(sid)
  getStats()
}

encodeSID(sid)
  → Returns: Base64 URL-safe string

decodeSID(encoded)
  → Returns: number
```

#### 5. lib/yang-schema-manager.js (330 LOC)
**Purpose:** YANG schema management

**Key Functions:**
```javascript
async fetchYANGLibChecksumFromDevice(device)
  → FETCH SID 29304
  → Returns: checksum string

async getYANGSchema(checksum)
  → Check cache
  → Download if needed
  → Parse .sid files
  → Returns: SIDSchema instance

async downloadFromCatalog(checksum)
  → Download from S3/Artifactory
  → Extract .tar.gz
  → Parse all .sid files
```

#### 6. lib/yang-converter.js (230 LOC)
**Purpose:** JSON ↔ CBOR conversion

**Key Functions:**
```javascript
json2cbor(json, contentFormat)
  → Converts JSON to CBOR
  → Handles: yang, fetch, ipatch, get, put, post
  → Returns: Buffer (CBOR)

cbor2json(cbor, contentFormat)
  → Converts CBOR to JSON
  → Handles: yang, fetch, ipatch, get, put, post
  → Returns: Object (JSON)

_path2sid(path)
  → Returns: SID number

_sid2path(sid)
  → Returns: YANG path string
```

#### 7. lib/coreconf-client.js (250 LOC)
**Purpose:** High-level CORECONF API

**Key Methods:**
```javascript
async initialize()
  → Fetch YANG schema from device

async fetch(paths)
  → Query specific nodes

async ipatch(patches)
  → Modify configuration

async get(uri)
  → Retrieve configuration

async put(data)
  → Replace configuration

async post(rpcCalls)
  → Execute RPC
```

#### 8. cli.js (480 LOC)
**Purpose:** Command-line interface

**Key Functions:**
```javascript
parseArgs(argv)
  → Parse command-line arguments

executeCommand(args)
  → Execute CORECONF operation

formatOutput(data, format)
  → Format output (pretty/json/yaml)

formatPretty(data)
  → Colored pretty-print
```

---

## Data Flow

### Configuration Read (GET/FETCH)

```
User
  ↓
CLI/Web UI
  ↓ JSON request
CORECONFClient.fetch(['/path1', '/path2'])
  ↓
YANGConverter.json2cbor(paths, 'fetch')
  ↓ paths → SIDs
SIDManager._path2sid('/path1') → SID1
  ↓
CBOR encode: [SID1, SID2]
  ↓
CoAPClient.executeCoAP('FETCH', '/c', payload, {
    content_type: 141,  // YANG Identifiers
    accept: 140         // YANG Data
})
  ↓
CoAPFrame.encodeCoAPMessage({
    method: 'FETCH',
    uri: '/c',
    options: [
        {number: 12, value: 141},  // Content-Format
        {number: 17, value: 140}   // Accept
    ],
    payload: [SID1, SID2]
})
  ↓ CoAP binary
MUP1.encodeMUP1Frame('C', coapBinary)
  ↓ MUP1 frame
SerialPort.write(mup1Frame)
  ↓ USB-Serial
LAN9662 Device
  ↓ Response
SerialPort.receive(mup1Response)
  ↓
MUP1.decodeMUP1Frame(mup1Response) → coapBinary
  ↓
CoAPFrame.decodeCoAPMessage(coapBinary)
  ↓ CBOR payload
YANGConverter.cbor2json(payload, 'fetch')
  ↓ SIDs → paths
SIDManager._sid2path(SID1) → '/path1'
  ↓ JSON response
CORECONFClient returns: [
    {'/path1': value1},
    {'/path2': value2}
]
  ↓
CLI/Web UI displays result
```

### Configuration Write (IPATCH)

```
User
  ↓ JSON file
CLI.loadFile('patches.json')
  ↓ [
      {'/path1': value1},
      {'/path2': value2}
    ]
CORECONFClient.ipatch(patches)
  ↓
YANGConverter.json2cbor(patches, 'ipatch')
  ↓ paths → SIDs
{SID1: value1, SID2: value2}
  ↓ CBOR encode
CoAPClient.executeCoAP('IPATCH', '/c', payload, {
    content_type: 142  // YANG Instances
})
  ↓
... (same as FETCH) ...
  ↓
Device applies changes
  ↓
Success response (2.04 Changed)
```

---

## Design Decisions

### 1. Pure JavaScript Implementation

**Rationale:**
- ARM compatibility (Raspberry Pi, embedded systems)
- No binary dependencies
- Easy to debug and modify
- Platform independent

**Trade-offs:**
- Slightly slower than native code
- More memory usage
- But: Acceptable for this use case

### 2. Async/Await Pattern

**Rationale:**
- Clean, readable code
- Better error handling
- Sequential operations (serial I/O)

**Example:**
```javascript
async function fetchData() {
    await client.initialize();
    const data = await client.fetch(['/path']);
    return data;
}
```

### 3. Event-Driven Architecture

**Rationale:**
- Serial port is inherently event-based
- Non-blocking I/O
- Multiple device support

**Example:**
```javascript
device.on('data', (data) => { ... });
device.on('error', (err) => { ... });
```

### 4. Local Schema Caching

**Rationale:**
- Reduce network traffic
- Faster startup
- Offline support (after first download)

**Location:**
```
~/.velocitydrive-yang-cache/
  ├── <checksum1>/
  │   ├── module1.sid
  │   └── module2.sid
  └── <checksum2>/
      └── ...
```

### 5. Block-wise Transfer

**Rationale:**
- Serial port limited buffer
- Large payloads split into 256-byte blocks
- Reliable transfer

**Implementation:**
- Block1: Request fragmentation
- Block2: Response fragmentation

### 6. Content-Format Mapping

**Design:**
```
Operation     Request CT   Response CT
─────────────────────────────────────
GET           (none)       140 (YANG Data)
PUT           140          (none)
FETCH         141          140
IPATCH        142          (none)
POST          142          142 (if output)
```

**Rationale:**
- RFC 9254 compliance
- Clear semantics
- Efficient encoding

---

## Performance Considerations

### 1. Schema Caching
- First load: ~2 seconds (download + parse)
- Subsequent loads: ~50ms (cache read)

### 2. CBOR Encoding
- 3-5x smaller than JSON
- Faster encoding/decoding

### 3. Block-wise Transfer
- 256 bytes per block
- ~50ms per block
- Large transfers: ~10 KB/s

### 4. Memory Usage
- Base: ~50 MB (Node.js runtime)
- Schema: ~5-10 MB per device
- Per request: ~1-2 MB

---

## Security Considerations

### 1. Serial Port Access
- Requires `dialout` group membership
- No authentication on serial port
- Physical access required

### 2. Input Validation
- All user inputs validated
- JSON/CBOR parsing errors handled
- Path validation (YANG schema)

### 3. Error Handling
- Try-catch blocks
- Timeout protection
- Buffer overflow protection

---

## Extensibility

### Adding New YANG Modules
1. Device firmware includes new module
2. New checksum generated
3. Auto-download on first use
4. No code changes needed

### Adding New Operations
1. Implement in `CoAPClient`
2. Add to `YANGConverter`
3. Expose in `CORECONFClient`
4. Add CLI command

### Adding New Devices
1. Same MUP1/CoAP protocol
2. Different YANG schema
3. Auto-detected from checksum

---

## Testing Strategy

### Unit Tests
- Each module tested independently
- Mock dependencies
- Edge cases covered

### Integration Tests
- Full protocol stack
- Real serial communication
- Error scenarios

### End-to-End Tests
- CLI tool with real device
- Web UI with real device
- Complete workflows

---

## Future Enhancements

### Planned
1. **YAML Output**: CLI tool YAML support
2. **Batch Operations**: Multiple devices at once
3. **Configuration Templates**: Reusable configs
4. **Logging**: Structured logging
5. **Monitoring**: Device health checks

### Under Consideration
1. **WebSocket**: Real-time updates
2. **HTTPS**: Secure web interface
3. **Authentication**: User management
4. **REST API**: External integrations
5. **Database**: Configuration history

---

## References

### Standards
- RFC 7049/8949: CBOR
- RFC 7252: CoAP
- RFC 7951: JSON Encoding of YANG Data
- RFC 8132: PATCH and FETCH Methods for CoAP
- RFC 9254: YANG-CBOR (CORECONF)
- RFC 9595: YANG Schema Item iDentifier (SID)

### Microchip Documentation
- VelocityDRIVE Documentation
- LAN9662 Datasheet
- MUP1 Protocol Specification

### Code References
- https://github.com/microchip-ung/velocitydrivesp-support

---

**Architecture Document Version:** 1.0.0
**Last Updated:** 2025-10-27
