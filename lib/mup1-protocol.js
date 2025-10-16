/**
 * MUP1 (Microchip UART Protocol #1) Implementation
 *
 * Frame Format: >TYPE[DATA]<[<]CHECKSUM
 *
 * Reference: https://github.com/microchip-ung/velocitydrivesp-support
 * Standard: Microchip UART Protocol #1 Specification
 */

export class MUP1Protocol {
    constructor() {
        // Frame delimiters
        this.SOF = 0x3E;  // '>' - Start of Frame
        this.EOF = 0x3C;  // '<' - End of Frame
        this.ESCAPE = 0x5C;  // '\' - Escape character

        // Command types
        this.COMMANDS = {
            ANNOUNCEMENT: 0x41,  // 'A' - Board announcements
            COAP: 0x43,          // 'C' - CoAP messages
            PING: 0x50,          // 'P' - Ping/Pong
            TRACE: 0x54,         // 'T' - Trace messages
            SYSTEM: 0x53         // 'S' - System messages
        };

        // Escape sequences mapping
        this.ESCAPE_MAP = {
            0x00: 0x30,  // NULL -> '0'
            0xFF: 0x46,  // 0xFF -> 'F'
            0x3E: 0x3E,  // '>'  -> '>'
            0x3C: 0x3C,  // '<'  -> '<'
            0x5C: 0x5C   // '\'  -> '\'
        };

        this.UNESCAPE_MAP = {
            0x30: 0x00,  // '0' -> NULL
            0x46: 0xFF,  // 'F' -> 0xFF
            0x3E: 0x3E,  // '>' -> '>'
            0x3C: 0x3C,  // '<' -> '<'
            0x5C: 0x5C   // '\' -> '\'
        };
    }

    /**
     * Check if byte needs escaping
     */
    needsEscape(byte) {
        return byte === 0x00 || byte === 0xFF ||
               byte === 0x3E || byte === 0x3C || byte === 0x5C;
    }

    /**
     * Encode MUP1 frame
     * @param {number} type - Command type byte
     * @param {Buffer} data - Payload data
     * @returns {Buffer} - Encoded frame ready to send
     */
    encodeFrame(type, data = Buffer.alloc(0)) {
        const frame = [];

        // 1. Start of frame
        frame.push(this.SOF);

        // 2. Command type
        frame.push(type);

        // 3. Data payload with escape sequences
        for (const byte of data) {
            if (this.needsEscape(byte)) {
                frame.push(this.ESCAPE);
                frame.push(this.ESCAPE_MAP[byte]);
            } else {
                frame.push(byte);
            }
        }

        // 4. End of frame (with padding if needed)
        frame.push(this.EOF);
        // Add second EOF if frame length is even (for alignment)
        if (frame.length % 2 === 0) {
            frame.push(this.EOF);
        }

        // 5. Calculate and append checksum
        const frameBuffer = Buffer.from(frame);
        const checksum = this.calculateChecksum(frameBuffer);
        const checksumStr = checksum.toString(16).toUpperCase().padStart(4, '0');

        for (const char of checksumStr) {
            frame.push(char.charCodeAt(0));
        }

        return Buffer.from(frame);
    }

    /**
     * Decode MUP1 frame
     * @param {Buffer} buffer - Raw frame data
     * @returns {Object} - Decoded frame {type, data, checksum}
     */
    decodeFrame(buffer) {
        if (buffer.length < 8) {
            throw new Error('Frame too short (minimum 8 bytes)');
        }

        if (buffer[0] !== this.SOF) {
            throw new Error('Invalid start of frame');
        }

        // Extract command type
        const type = buffer[1];

        // Decode data until EOF
        const data = [];
        let i = 2;
        let escaping = false;

        while (i < buffer.length - 4) {
            const byte = buffer[i];

            if (byte === this.EOF) {
                break;
            }

            if (escaping) {
                data.push(this.UNESCAPE_MAP[byte] ?? byte);
                escaping = false;
            } else if (byte === this.ESCAPE) {
                escaping = true;
            } else {
                data.push(byte);
            }

            i++;
        }

        // Find checksum position
        const frameEnd = buffer.indexOf(this.EOF, 2);
        const checksumStart = buffer[frameEnd + 1] === this.EOF ? frameEnd + 2 : frameEnd + 1;

        // Extract and verify checksum
        const providedChecksum = buffer.toString('ascii', checksumStart, checksumStart + 4).toUpperCase();
        const frameForChecksum = buffer.slice(0, frameEnd + (buffer[frameEnd + 1] === this.EOF ? 2 : 1));
        const calculatedChecksum = this.calculateChecksum(frameForChecksum).toString(16).toUpperCase().padStart(4, '0');

        if (providedChecksum !== calculatedChecksum) {
            console.warn(`[MUP1] Checksum mismatch: provided=${providedChecksum}, calculated=${calculatedChecksum}`);
        }

        return {
            type: String.fromCharCode(type),
            data: Buffer.from(data),
            checksum: providedChecksum,
            valid: providedChecksum === calculatedChecksum
        };
    }

    /**
     * Calculate 16-bit one's complement checksum
     * @param {Buffer} data - Data to checksum
     * @returns {number} - 16-bit checksum
     */
    calculateChecksum(data) {
        let sum = 0;

        // Sum all bytes as 16-bit values (big-endian pairs)
        for (let i = 0; i < data.length; i += 2) {
            const value = i + 1 < data.length
                ? (data[i] << 8) | data[i + 1]
                : data[i] << 8;
            sum += value;
        }

        // Fold 32-bit sum to 16 bits (add carry)
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }

        // Return one's complement
        return (~sum) & 0xFFFF;
    }

    /**
     * Create CoAP frame
     * @param {Buffer} coapMessage - CoAP message to encapsulate
     * @returns {Buffer} - MUP1 frame containing CoAP message
     */
    createCoapFrame(coapMessage) {
        return this.encodeFrame(this.COMMANDS.COAP, coapMessage);
    }

    /**
     * Create Ping frame
     * @returns {Buffer} - MUP1 ping frame
     */
    createPing() {
        return this.encodeFrame(this.COMMANDS.PING);
    }

    /**
     * Get command type name
     */
    getCommandName(type) {
        const typeCode = typeof type === 'string' ? type.charCodeAt(0) : type;
        return Object.keys(this.COMMANDS).find(k => this.COMMANDS[k] === typeCode) || `Unknown(${type})`;
    }
}

export default MUP1Protocol;
