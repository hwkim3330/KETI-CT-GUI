/**
 * Serial Handler with MUP1 Protocol State Machine
 *
 * Based on official Ruby implementation
 * Reference: velocitydrivesp-support/support/libeasy/handler/mup1.rb
 */

import { EventEmitter } from 'events';
import { MUP1Protocol } from './mup1-protocol.js';

export class SerialHandler extends EventEmitter {
    constructor(serial) {
        super();
        this.serial = serial;
        this.protocol = new MUP1Protocol();

        // State machine
        this.state = 'init';
        this.rawBuf = Buffer.alloc(0);
        this.mup1Data = [];
        this.mup1DataChk = [];
        this.mup1Chk = [];
        this.mup1Type = 0;

        // Timeout handling
        this.timeout = null;
        this.timeoutDefault = 500; // 0.5 seconds

        // Setup serial event handlers
        this.setupSerial();
    }

    /**
     * Setup serial port event handlers
     */
    setupSerial() {
        this.serial.on('data', (data) => {
            this.handleData(data);
        });

        this.serial.on('error', (err) => {
            console.error('[Serial] Error:', err.message);
            this.emit('error', err);
        });

        this.serial.on('close', () => {
            console.log('[Serial] Port closed');
            this.emit('close');
        });
    }

    /**
     * Handle incoming serial data
     */
    handleData(data) {
        // Append to raw buffer
        if (this.rawBuf.length < 10240) {
            this.rawBuf = Buffer.concat([this.rawBuf, data]);
        }

        // Reset timeout
        this.resetTimeout();

        // Process byte by byte through state machine
        for (const byte of data) {
            this.rxStateMachine(byte);
        }
    }

    /**
     * MUP1 State Machine (matches Ruby implementation)
     */
    rxStateMachine(c) {
        switch (this.state) {
            case 'init':
                if (c === this.protocol.SOF) {
                    this.state = 'sof';
                    this.mup1Data = [];
                    this.mup1DataChk = [this.protocol.SOF];
                    this.mup1Chk = [];
                    this.mup1Type = 0;
                }
                break;

            case 'sof':
                this.mup1Type = c;
                this.state = 'data';
                this.mup1DataChk.push(c);
                break;

            case 'data':
                if (this.mup1Data.length > 1024) {
                    console.error('[MUP1] Frame too big!');
                    this.state = 'init';
                } else {
                    if (c === this.protocol.ESCAPE) {
                        this.state = 'esc';
                    } else if (c === this.protocol.EOF) {
                        this.mup1DataChk.push(...this.mup1Data);
                        this.mup1DataChk.push(this.protocol.EOF);

                        // Check if we need double EOF
                        if (this.mup1Data.length % 2 !== 0) {
                            // Odd sized message = single EOF
                            this.state = 'chk0';
                        } else {
                            // Even sized message = double EOF
                            this.state = 'eof2';
                            this.mup1DataChk.push(this.protocol.EOF);
                        }
                    } else if (c === this.protocol.SOF || c === 0 || c === 0xFF) {
                        console.error(`[MUP1] Invalid data element: ${c}`);
                        this.state = 'init';
                    } else {
                        this.mup1Data.push(c);
                    }
                }
                break;

            case 'esc':
                this.state = 'data';
                switch (c) {
                    case this.protocol.SOF:
                    case this.protocol.ESCAPE:
                    case this.protocol.EOF:
                        this.mup1Data.push(c);
                        break;
                    case 0x30:  // '0' -> 0x00
                        this.mup1Data.push(0x00);
                        break;
                    case 0x46:  // 'F' -> 0xFF
                        this.mup1Data.push(0xFF);
                        break;
                    default:
                        console.error(`[MUP1] Invalid escape sequence: ${c}`);
                        this.state = 'init';
                }
                break;

            case 'eof2':
                if (c === this.protocol.EOF) {
                    this.state = 'chk0';
                } else {
                    console.error(`[MUP1] Expected repeated EOF, got ${c}`);
                    this.state = 'init';
                }
                break;

            case 'chk0':
                this.mup1Chk.push(c);
                this.state = 'chk1';
                break;

            case 'chk1':
                this.mup1Chk.push(c);
                this.state = 'chk2';
                break;

            case 'chk2':
                this.mup1Chk.push(c);
                this.state = 'chk3';
                break;

            case 'chk3':
                this.mup1Chk.push(c);
                this.state = 'init';

                // Verify checksum
                const frameBuffer = Buffer.from(this.mup1DataChk);
                const calculatedChk = this.protocol.calculateChecksum(frameBuffer);
                const calculatedChkStr = calculatedChk.toString(16).padStart(4, '0').toLowerCase();
                const receivedChkStr = String.fromCharCode(...this.mup1Chk).toLowerCase();

                if (calculatedChkStr !== receivedChkStr) {
                    console.error('[MUP1] Checksum error!');
                    console.error(`  Calculated: ${calculatedChkStr}`);
                    console.error(`  Received: ${receivedChkStr}`);
                } else {
                    // Frame is valid!
                    this.rawBuf = Buffer.alloc(0);
                    const data = Buffer.from(this.mup1Data);
                    const type = String.fromCharCode(this.mup1Type);

                    // Emit frame event
                    this.emit('frame', type, data);
                }
                break;
        }
    }

    /**
     * Reset timeout
     */
    resetTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        this.timeout = setTimeout(() => {
            this.handleTimeout();
        }, this.timeoutDefault);
    }

    /**
     * Handle timeout
     */
    handleTimeout() {
        if (this.state !== 'init') {
            console.log(`[MUP1] Reset state machine (was ${this.state}) due to timeout`);
            this.state = 'init';
        }

        // Dispatch any raw console output
        this.dispatchRaw();
    }

    /**
     * Dispatch raw (non-MUP1) data
     */
    dispatchRaw() {
        if (this.rawBuf.length > 0) {
            const data = this.rawBuf.toString('utf8');
            this.rawBuf = Buffer.alloc(0);

            if (data.trim().length > 0) {
                this.emit('console', data);
            }
        }
    }

    /**
     * Send MUP1 frame
     */
    send(type, data = Buffer.alloc(0)) {
        const frame = this.protocol.encodeFrame(type, data);
        console.log(`[MUP1 TX] Type=${String.fromCharCode(type)} Len=${data.length} Frame=${frame.toString('hex')}`);
        this.serial.write(frame);
    }

    /**
     * Send CoAP frame
     */
    sendCoAP(coapData) {
        this.send(this.protocol.COMMANDS.COAP, coapData);
    }

    /**
     * Send Ping
     */
    sendPing() {
        this.send(this.protocol.COMMANDS.PING);
    }

    /**
     * Close serial port
     */
    close() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        if (this.serial && this.serial.isOpen) {
            this.serial.close();
        }
    }
}

export default SerialHandler;
