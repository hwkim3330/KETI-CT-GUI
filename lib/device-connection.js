/**
 * Device Connection - Integrates Serial + MUP1 + CoAP
 *
 * Single connection to one LAN9662 board
 */

import { SerialPort } from 'serialport';
import { SerialHandler } from './serial-handler.js';
import { CoAPClient } from './coap-client-new.js';
import { CoAPFrame } from './coap-frame.js';
import { MUP1Protocol } from './mup1-protocol.js';

export class DeviceConnection {
    constructor(devicePath, baudRate = 115200) {
        this.devicePath = devicePath;
        this.baudRate = baudRate;

        // Components
        this.serial = null;
        this.serialHandler = null;
        this.coap = null;

        // Connection state
        this.connected = false;

        // Device info
        this.deviceInfo = {
            path: devicePath,
            baudRate,
            connected: false,
            model: 'Unknown',
            firmware: 'Unknown',
            serialNumber: 'Unknown',
            lastSeen: null
        };
    }

    /**
     * Connect to device
     */
    async connect() {
        return new Promise((resolve, reject) => {
            // Create serial port
            this.serial = new SerialPort({
                path: this.devicePath,
                baudRate: this.baudRate,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false
            });

            // Open serial port
            this.serial.open((err) => {
                if (err) {
                    console.error(`[${this.devicePath}] Open error:`, err.message);
                    reject(err);
                    return;
                }

                console.log(`[${this.devicePath}] Serial port opened`);

                // Create serial handler
                this.serialHandler = new SerialHandler(this.serial);

                // Create CoAP client
                const mup1 = new MUP1Protocol();
                this.coap = new CoAPClient(mup1, this.serial);

                // Setup event handlers
                this.setupEventHandlers();

                // Mark as connected
                this.connected = true;
                this.deviceInfo.connected = true;
                this.deviceInfo.lastSeen = new Date().toISOString();

                console.log(`[${this.devicePath}] Connected successfully`);

                // Send initial ping
                setTimeout(() => {
                    this.serialHandler.sendPing();
                }, 500);

                resolve();
            });
        });
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Handle MUP1 frames
        this.serialHandler.on('frame', (type, data) => {
            console.log(`[${this.devicePath}] MUP1 Frame: Type=${type} Len=${data.length}`);

            switch (type) {
                case 'C':  // CoAP
                    try {
                        const frame = new CoAPFrame(data);
                        this.coap.handleCoAPFrame(frame);
                    } catch (error) {
                        console.error(`[${this.devicePath}] CoAP parse error:`, error.message);
                    }
                    break;

                case 'A':  // Announcement
                    console.log(`[${this.devicePath}] ANNOUNCE:`, data.toString('utf8'));
                    break;

                case 'T':  // Trace
                    console.log(`[${this.devicePath}] TRACE:`, data.toString('utf8'));
                    break;

                case 'P':  // Ping response
                    console.log(`[${this.devicePath}] PONG`);
                    this.deviceInfo.lastSeen = new Date().toISOString();
                    break;

                default:
                    console.log(`[${this.devicePath}] Unknown MUP1 type: ${type}`);
            }
        });

        // Handle console output
        this.serialHandler.on('console', (data) => {
            console.log(`[${this.devicePath}] CON:`, data.trim());
        });

        // Handle errors
        this.serialHandler.on('error', (err) => {
            console.error(`[${this.devicePath}] Error:`, err.message);
            this.connected = false;
            this.deviceInfo.connected = false;
        });

        // Handle close
        this.serialHandler.on('close', () => {
            console.log(`[${this.devicePath}] Connection closed`);
            this.connected = false;
            this.deviceInfo.connected = false;
        });
    }

    /**
     * Disconnect from device
     */
    disconnect() {
        if (this.serialHandler) {
            this.serialHandler.close();
        }
        this.connected = false;
        this.deviceInfo.connected = false;
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.connected && this.serial && this.serial.isOpen;
    }

    /**
     * Query device information via CoAP
     */
    async queryDeviceInfo() {
        try {
            // Get system information
            const result = await this.coap.get('/c?d=a');

            if (result.payload && result.payload.length > 0) {
                // TODO: Parse CBOR payload to get device info
                // For now, just mark as successful
                this.deviceInfo.lastSeen = new Date().toISOString();
                console.log(`[${this.devicePath}] Device info retrieved`);
            }

            return this.deviceInfo;
        } catch (error) {
            console.error(`[${this.devicePath}] Query device info failed:`, error.message);
            throw error;
        }
    }

    /**
     * Execute CoAP request
     */
    async executeCoAP(method, uri, data = null, opts = {}) {
        if (!this.isConnected()) {
            throw new Error(`Device ${this.devicePath} not connected`);
        }

        const methodName = method.toUpperCase();

        switch (methodName) {
            case 'GET':
                return this.coap.get(uri, opts);
            case 'POST':
                return this.coap.post(uri, data, opts);
            case 'PUT':
                return this.coap.put(uri, data, opts);
            case 'DELETE':
                return this.coap.delete(uri, opts);
            case 'FETCH':
                return this.coap.fetch(uri, data, opts);
            case 'IPATCH':
                return this.coap.ipatch(uri, data, opts);
            default:
                throw new Error(`Unknown CoAP method: ${method}`);
        }
    }

    /**
     * Get device info
     */
    getInfo() {
        return {
            ...this.deviceInfo,
            connected: this.isConnected()
        };
    }
}

export default DeviceConnection;
