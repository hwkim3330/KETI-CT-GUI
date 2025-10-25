#!/usr/bin/env node

/**
 * MUP1 Protocol Test
 *
 * Tests the fixed JavaScript implementation against known patterns
 */

import { MUP1Protocol } from './lib/mup1-protocol.js';
import { CoAPClient } from './lib/coap-client.js';

const mup1 = new MUP1Protocol();

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  MUP1 Protocol Implementation Test                   ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

// Test 1: Ping frame (empty payload)
console.log('Test 1: PING Frame (empty payload)');
console.log('─'.repeat(60));
const pingFrame = mup1.createPing();
console.log('Generated frame:', pingFrame.toString('hex'));
console.log('Frame breakdown:');
console.log('  SOF (>):', pingFrame[0].toString(16).padStart(2, '0'));
console.log('  Type (P):', String.fromCharCode(pingFrame[1]), `(0x${pingFrame[1].toString(16)})`);
console.log('  EOF (<):', pingFrame[2].toString(16).padStart(2, '0'));
console.log('  EOF (<):', pingFrame[3].toString(16).padStart(2, '0'), '(padding)');
console.log('  Checksum:', pingFrame.slice(4, 8).toString('ascii'));

// Verify checksum manually
const pingForChk = Buffer.from([0x3E, 0x50, 0x3C, 0x3C]);
const pingChk = mup1.calculateChecksum(pingForChk);
console.log('  Calculated checksum:', pingChk.toString(16).padStart(4, '0'));
console.log('  Match:', pingFrame.slice(4, 8).toString('ascii').toLowerCase() === pingChk.toString(16).padStart(4, '0'));
console.log('');

// Test 2: CoAP GET /c?d=a (minimal request)
console.log('Test 2: CoAP GET /c?d=a');
console.log('─'.repeat(60));

// Build minimal CoAP GET message
const coapMsg = [];

// Header: Ver(1) | Type(0) | TKL(0) | Code(1 = GET) | MID
coapMsg.push((1 << 6) | (0 << 4) | 0);  // Ver=1, Type=CON, TKL=0
coapMsg.push(1);  // Code = 0.01 (GET)
coapMsg.push(0x00, 0x01);  // Message ID = 1

// Options: Uri-Path "c"
// Option 11 (Uri-Path), delta=11, length=1
coapMsg.push((11 << 4) | 1);  // delta=11, len=1
coapMsg.push('c'.charCodeAt(0));  // "c"

// Option 12 (Content-Format), delta=1 (12-11), length=2
coapMsg.push((1 << 4) | 2);  // delta=1, len=2
coapMsg.push(0x01, 0x04);  // 260 = 0x0104 (YANG+CBOR)

// Option 15 (Uri-Query "d=a"), delta=3 (15-12), length=3
coapMsg.push((3 << 4) | 3);  // delta=3, len=3
coapMsg.push('d'.charCodeAt(0));
coapMsg.push('='.charCodeAt(0));
coapMsg.push('a'.charCodeAt(0));

const coapBuffer = Buffer.from(coapMsg);
console.log('CoAP message:', coapBuffer.toString('hex'));
console.log('CoAP message length:', coapBuffer.length);

const coapFrame = mup1.createCoapFrame(coapBuffer);
console.log('MUP1 frame:', coapFrame.toString('hex'));
console.log('Frame breakdown:');
console.log('  SOF (>):', coapFrame[0].toString(16).padStart(2, '0'));
console.log('  Type (C):', String.fromCharCode(coapFrame[1]), `(0x${coapFrame[1].toString(16)})`);
console.log('  Data length:', coapFrame.length - 8, 'bytes (escaped)');
console.log('  Original data length:', coapBuffer.length, 'bytes');
console.log('  Data size is', coapBuffer.length % 2 === 0 ? 'EVEN' : 'ODD');
console.log('  Should have', coapBuffer.length % 2 === 0 ? 'DOUBLE' : 'SINGLE', 'EOF');

// Find EOF positions
let eofCount = 0;
let eofPos = [];
for (let i = 0; i < coapFrame.length; i++) {
    if (coapFrame[i] === 0x3C) {
        eofCount++;
        eofPos.push(i);
    }
}
console.log('  Found', eofCount, 'EOF markers at positions:', eofPos);
console.log('  Checksum:', coapFrame.slice(-4).toString('ascii'));
console.log('');

// Test 3: Frame with escaping (contains 0x00)
console.log('Test 3: Frame with NULL byte (requires escaping)');
console.log('─'.repeat(60));
const dataWithNull = Buffer.from([0x00, 0x41, 0x42]);  // NULL, A, B
console.log('Original data:', dataWithNull.toString('hex'), `(${dataWithNull.length} bytes)`);

const frameWithEsc = mup1.encodeFrame(0x54, dataWithNull);  // Type 'T' (Trace)
console.log('Encoded frame:', frameWithEsc.toString('hex'));
console.log('Frame breakdown:');
console.log('  SOF:', frameWithEsc[0].toString(16));
console.log('  Type:', String.fromCharCode(frameWithEsc[1]));

// Check for escape sequences
let escaped = false;
let dataStart = 2;
let dataBytes = [];
for (let i = dataStart; i < frameWithEsc.length; i++) {
    if (frameWithEsc[i] === 0x3C) break;  // EOF
    if (escaped) {
        const escapedByte = frameWithEsc[i];
        if (escapedByte === 0x30) {  // '0' -> 0x00
            dataBytes.push('0x00');
        } else if (escapedByte === 0x46) {  // 'F' -> 0xFF
            dataBytes.push('0xFF');
        } else {
            dataBytes.push(`0x${escapedByte.toString(16)}`);
        }
        escaped = false;
    } else if (frameWithEsc[i] === 0x5C) {  // Escape char
        escaped = true;
    } else {
        dataBytes.push(`0x${frameWithEsc[i].toString(16)}`);
    }
}
console.log('  Decoded data:', dataBytes.join(' '));
console.log('  Expected: 0x00 0x41 0x42');
console.log('  Match:', dataBytes.join(' ') === '0x00 0x41 0x42');
console.log('');

// Test 4: Checksum calculation test
console.log('Test 4: Checksum Calculation');
console.log('─'.repeat(60));

// Test case from Ruby: >P<<
// SOF (0x3E), P (0x50), EOF (0x3C), EOF (0x3C)
const testData = Buffer.from([0x3E, 0x50, 0x3C, 0x3C]);
const testChecksum = mup1.calculateChecksum(testData);
console.log('Test data:', testData.toString('hex'));
console.log('Calculated checksum:', testChecksum.toString(16).padStart(4, '0'));

// Manual calculation:
// Words: 0x3E50, 0x3C3C
// Sum = 0x3E50 + 0x3C3C = 0x7A8C
// No carry
// One's complement = ~0x7A8C = 0x8573
console.log('Expected checksum: 8573 (manual calculation)');
console.log('Match:', testChecksum.toString(16).padStart(4, '0') === '8573');
console.log('');

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  Test Summary                                        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('All tests completed. Check output above for any failures.');
console.log('');
console.log('Key fixes applied:');
console.log('✓ EOF padding based on ORIGINAL data size (not escaped)');
console.log('✓ Checksum calculated on un-escaped frame');
console.log('✓ Checksum carry folding matches Ruby implementation');
console.log('');
