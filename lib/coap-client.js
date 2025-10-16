/**
 * CoAP Client for CORECONF (RFC 9254)
 *
 * Implements CoAP (RFC 7252) over MUP1 for YANG-based device configuration
 * Uses CBOR encoding (RFC 8949) for payload
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc9254
 */

import { encode as cborEncode, decode as cborDecode } from 'cbor-x';

export class CoAPClient {
    constructor(protocol, serial) {
        this.protocol = protocol;
        this.serial = serial;
        this.messageId = Math.floor(Math.random() * 0xFFFF);
        this.token = 0;
        this.pendingRequests = new Map();
        this.receiveBuffer = Buffer.alloc(0);

        // CoAP method codes (RFC 7252 Section 12.1.1)
        this.METHODS = {
            GET: 1,
            POST: 2,
            PUT: 3,
            DELETE: 4,
            FETCH: 5,
            PATCH: 6,
            IPATCH: 7
        };

        // CoAP response codes (RFC 7252 Section 12.1.2)
        this.RESPONSE_CODES = {
            65: '2.01 Created',
            66: '2.02 Deleted',
            67: '2.03 Valid',
            68: '2.04 Changed',
            69: '2.05 Content',
            95: '2.31 Continue',
            128: '4.00 Bad Request',
            129: '4.01 Unauthorized',
            130: '4.02 Bad Option',
            131: '4.03 Forbidden',
            132: '4.04 Not Found',
            133: '4.05 Method Not Allowed',
            134: '4.06 Not Acceptable',
            140: '4.12 Precondition Failed',
            141: '4.13 Request Entity Too Large',
            143: '4.15 Unsupported Content-Format',
            160: '5.00 Internal Server Error',
            161: '5.01 Not Implemented',
            162: '5.02 Bad Gateway',
            163: '5.03 Service Unavailable',
            164: '5.04 Gateway Timeout',
            165: '5.05 Proxying Not Supported'
        };

        // CoAP option numbers (RFC 7252 Section 12.2)
        this.OPTIONS = {
            IF_MATCH: 1,
            URI_HOST: 3,
            ETAG: 4,
            IF_NONE_MATCH: 5,
            URI_PORT: 7,
            LOCATION_PATH: 8,
            URI_PATH: 11,
            CONTENT_FORMAT: 12,
            MAX_AGE: 14,
            URI_QUERY: 15,
            ACCEPT: 17,
            LOCATION_QUERY: 20,
            PROXY_URI: 35,
            PROXY_SCHEME: 39,
            SIZE1: 60
        };

        // Content-Format for YANG Data + CBOR (RFC 9254)
        this.CONTENT_FORMAT_YANG_CBOR = 260;
    }

    /**
     * Send CoAP request
     * @param {string} method - HTTP-style method name
     * @param {string} uri - Resource URI (e.g., '/c' or '/c?d=a')
     * @param {*} payload - CBOR-serializable payload (optional)
     * @param {number} timeout - Request timeout in ms
     * @returns {Promise} - Resolves with response payload
     */
    async request(method, uri = '/c', payload = null, timeout = 15000) {
        // Get next message ID
        const mid = this.messageId++;
        if (this.messageId > 0xFFFF) this.messageId = 1;

        const methodCode = this.METHODS[method.toUpperCase()];
        if (!methodCode) {
            throw new Error(`Unknown CoAP method: ${method}`);
        }

        // Build CoAP message
        const message = this.buildMessage(methodCode, uri, payload, mid);

        // Encapsulate in MUP1 frame
        const frame = this.protocol.createCoapFrame(message);

        console.log(`[CoAP] ${method} ${uri} (MID=${mid})`);

        // Create pending request promise
        const promise = new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                if (this.pendingRequests.has(mid)) {
                    this.pendingRequests.delete(mid);
                    reject(new Error(`Request timeout after ${timeout}ms: ${method} ${uri}`));
                }
            }, timeout);

            this.pendingRequests.set(mid, {
                resolve,
                reject,
                timeout: timeoutHandle,
                method,
                uri,
                sentAt: Date.now()
            });
        });

        // Send frame over serial
        this.serial.write(frame);

        return promise;
    }

    /**
     * Build CoAP message
     */
    buildMessage(methodCode, uri, payload, messageId) {
        const message = [];

        // === Header (4 bytes) ===

        // Byte 0: Ver(2) | Type(2) | TKL(4)
        const version = 1;  // CoAP version 1
        const type = 0;     // 0=Confirmable (CON)
        const tokenLength = 0;  // No token for simplicity

        message.push((version << 6) | (type << 4) | tokenLength);

        // Byte 1: Code (method or response)
        message.push(methodCode);

        // Bytes 2-3: Message ID (16-bit big-endian)
        message.push((messageId >> 8) & 0xFF);
        message.push(messageId & 0xFF);

        // === Options ===
        const options = this.encodeOptions(uri);
        message.push(...options);

        // === Payload ===
        if (payload !== null && payload !== undefined) {
            // Payload marker
            message.push(0xFF);

            // Encode payload as CBOR
            let encoded;
            if (Buffer.isBuffer(payload)) {
                encoded = payload;
            } else {
                encoded = cborEncode(payload);
            }

            message.push(...encoded);
        }

        return Buffer.from(message);
    }

    /**
     * Encode CoAP options from URI
     */
    encodeOptions(uri) {
        const options = [];

        // Split URI into path and query
        const [pathPart, queryPart] = uri.split('?');
        const segments = (pathPart || '').split('/').filter(s => s);

        let prevOptionNum = 0;

        // === Uri-Path options (option 11) ===
        for (const segment of segments) {
            const optionDelta = this.OPTIONS.URI_PATH - prevOptionNum;
            const optionLength = segment.length;

            // Encode option delta and length
            options.push(...this.encodeOptionHeader(optionDelta, optionLength));

            // Encode segment value
            for (let i = 0; i < segment.length; i++) {
                options.push(segment.charCodeAt(i));
            }

            prevOptionNum = this.OPTIONS.URI_PATH;
        }

        // === Content-Format option (option 12) ===
        // Always use YANG Data + CBOR (260 = 0x0104)
        const cfDelta = this.OPTIONS.CONTENT_FORMAT - prevOptionNum;
        options.push(...this.encodeOptionHeader(cfDelta, 2));
        options.push(0x01);  // High byte of 260
        options.push(0x04);  // Low byte of 260
        prevOptionNum = this.OPTIONS.CONTENT_FORMAT;

        // === Uri-Query options (option 15) ===
        if (queryPart) {
            const queries = queryPart.split('&').filter(Boolean);
            for (const query of queries) {
                const qDelta = this.OPTIONS.URI_QUERY - prevOptionNum;
                const qLength = query.length;

                options.push(...this.encodeOptionHeader(qDelta, qLength));

                for (let i = 0; i < query.length; i++) {
                    options.push(query.charCodeAt(i));
                }

                prevOptionNum = this.OPTIONS.URI_QUERY;
            }
        }

        return options;
    }

    /**
     * Encode CoAP option header (delta and length)
     */
    encodeOptionHeader(delta, length) {
        const header = [];

        let deltaExt = 0;
        let lengthExt = 0;

        // Encode delta
        let deltaValue = delta;
        if (delta < 13) {
            deltaValue = delta;
        } else if (delta < 269) {
            deltaValue = 13;
            deltaExt = delta - 13;
        } else {
            deltaValue = 14;
            deltaExt = delta - 269;
        }

        // Encode length
        let lengthValue = length;
        if (length < 13) {
            lengthValue = length;
        } else if (length < 269) {
            lengthValue = 13;
            lengthExt = length - 13;
        } else {
            lengthValue = 14;
            lengthExt = length - 269;
        }

        // First byte: delta (4 bits) | length (4 bits)
        header.push((deltaValue << 4) | lengthValue);

        // Extended delta (if needed)
        if (delta >= 13 && delta < 269) {
            header.push(deltaExt);
        } else if (delta >= 269) {
            header.push((deltaExt >> 8) & 0xFF);
            header.push(deltaExt & 0xFF);
        }

        // Extended length (if needed)
        if (length >= 13 && length < 269) {
            header.push(lengthExt);
        } else if (length >= 269) {
            header.push((lengthExt >> 8) & 0xFF);
            header.push(lengthExt & 0xFF);
        }

        return header;
    }

    /**
     * Parse CoAP response
     */
    parseResponse(data) {
        if (data.length < 4) {
            throw new Error('Invalid CoAP message (too short)');
        }

        // Parse header
        const version = (data[0] >> 6) & 0x03;
        const type = (data[0] >> 4) & 0x03;
        const tokenLength = data[0] & 0x0F;

        const code = data[1];
        const messageId = (data[2] << 8) | data[3];

        // Skip token
        let offset = 4 + tokenLength;

        // Skip options (find payload marker 0xFF)
        let payloadStart = data.length;
        for (let i = offset; i < data.length; i++) {
            if (data[i] === 0xFF) {
                payloadStart = i + 1;
                break;
            }
        }

        // Extract and decode payload
        let payload = null;
        if (payloadStart < data.length) {
            const payloadData = data.slice(payloadStart);
            try {
                payload = cborDecode(payloadData);
            } catch (e) {
                console.warn('[CoAP] Failed to decode CBOR payload:', e.message);
                payload = payloadData;
            }
        }

        return {
            version,
            type,
            code,
            messageId,
            payload,
            codeClass: Math.floor(code / 32),
            codeName: this.RESPONSE_CODES[code] || `${Math.floor(code / 32)}.${String(code % 32).padStart(2, '0')}`
        };
    }

    /**
     * Handle incoming serial data
     */
    handleData(data) {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

        // Try to parse complete MUP1 frames
        while (this.receiveBuffer.length > 0) {
            // Find SOF marker
            const sofIndex = this.receiveBuffer.indexOf(this.protocol.SOF);
            if (sofIndex === -1) {
                this.receiveBuffer = Buffer.alloc(0);
                break;
            }

            // Discard data before SOF
            if (sofIndex > 0) {
                this.receiveBuffer = this.receiveBuffer.slice(sofIndex);
            }

            // Need at least 8 bytes for minimal frame
            if (this.receiveBuffer.length < 8) {
                break;
            }

            // Find EOF marker
            const eofIndex = this.receiveBuffer.indexOf(this.protocol.EOF, 2);
            if (eofIndex === -1) {
                break;  // Wait for more data
            }

            // Check if we have complete frame (including checksum)
            const hasDoubleEof = this.receiveBuffer[eofIndex + 1] === this.protocol.EOF;
            const checksumStart = hasDoubleEof ? eofIndex + 2 : eofIndex + 1;
            const frameEnd = checksumStart + 4;

            if (this.receiveBuffer.length < frameEnd) {
                break;  // Wait for more data
            }

            // Extract complete frame
            const frameData = this.receiveBuffer.slice(0, frameEnd);
            this.receiveBuffer = this.receiveBuffer.slice(frameEnd);

            // Decode MUP1 frame
            try {
                const decoded = this.protocol.decodeFrame(frameData);

                if (decoded.type === 'C') {
                    // CoAP response
                    this.handleCoapResponse(decoded.data);
                } else if (decoded.type === 'A') {
                    // Announcement message
                    console.log('[MUP1] Announcement:', decoded.data.toString('utf-8'));
                } else if (decoded.type === 'T') {
                    // Trace message
                    console.log('[MUP1] Trace:', decoded.data.toString('utf-8'));
                }
            } catch (error) {
                console.error('[MUP1] Frame decode error:', error.message);
            }
        }
    }

    /**
     * Handle CoAP response
     */
    handleCoapResponse(data) {
        try {
            const response = this.parseResponse(data);
            const pending = this.pendingRequests.get(response.messageId);

            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.messageId);

                const rtt = Date.now() - pending.sentAt;
                console.log(`[CoAP] ${response.codeName} (MID=${response.messageId}, RTT=${rtt}ms)`);

                if (response.codeClass === 2) {
                    // Success (2.xx)
                    pending.resolve(response.payload);
                } else {
                    // Error (4.xx or 5.xx)
                    const error = new Error(response.codeName);
                    error.code = response.code;
                    error.payload = response.payload;
                    pending.reject(error);
                }
            } else {
                console.warn(`[CoAP] Received response for unknown message ID: ${response.messageId}`);
            }
        } catch (error) {
            console.error('[CoAP] Response parse error:', error.message);
        }
    }

    /**
     * Convenience methods for HTTP-style requests
     */
    async get(uri = '/c?d=a') {
        return this.request('GET', uri);
    }

    async post(uri, data) {
        return this.request('POST', uri, data);
    }

    async put(uri, data) {
        return this.request('PUT', uri, data);
    }

    async delete(uri) {
        return this.request('DELETE', uri);
    }

    async patch(uri, data) {
        return this.request('PATCH', uri, data);
    }

    async ipatch(uri, data) {
        return this.request('IPATCH', uri, data);
    }
}

export default CoAPClient;
