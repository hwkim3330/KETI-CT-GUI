/**
 * Multi-Device Manager
 *
 * Manages multiple LAN9662 boards connected via USB serial
 * Automatically detects and connects to all /dev/ttyACM* devices
 */

import { SerialPort } from 'serialport';
import { MUP1Protocol } from './mup1-protocol.js';
import { CoAPClient } from './coap-client.js';
import { readdirSync, statSync } from 'fs';

export class DeviceManager {
    constructor() {
        this.devices = new Map();  // path -> DeviceConnection
        this.scanInterval = null;
        this.autoScan = true;
    }

    /**
     * Scan for available serial devices
     */
    async scanDevices() {
        try {
            // Find all ttyACM devices
            const devPath = '/dev';
            const files = readdirSync(devPath);
            const ttyDevices = files
                .filter(f => f.startsWith('ttyACM') || f.startsWith('ttyUSB'))
                .map(f => `${devPath}/${f}`)
                .sort();

            console.log(`[DeviceManager] Found ${ttyDevices.length} serial devices`);

            // Connect to new devices
            for (const devicePath of ttyDevices) {
                if (!this.devices.has(devicePath)) {
                    await this.connectDevice(devicePath);
                }
            }

            // Remove disconnected devices
            for (const [path, device] of this.devices.entries()) {
                if (!ttyDevices.includes(path)) {
                    console.log(`[DeviceManager] Device removed: ${path}`);
                    this.disconnectDevice(path);
                }
            }

            return Array.from(this.devices.values()).map(d => d.getInfo());
        } catch (error) {
            console.error('[DeviceManager] Scan error:', error.message);
            return [];
        }
    }

    /**
     * Connect to a specific device
     */
    async connectDevice(devicePath, baudRate = 115200) {
        try {
            console.log(`[DeviceManager] Connecting to ${devicePath}...`);

            const device = new DeviceConnection(devicePath, baudRate);
            await device.connect();

            this.devices.set(devicePath, device);

            // Query device info
            setTimeout(() => {
                device.queryDeviceInfo().catch(err => {
                    console.warn(`[DeviceManager] Failed to query ${devicePath}:`, err.message);
                });
            }, 1000);

            return device.getInfo();
        } catch (error) {
            console.error(`[DeviceManager] Failed to connect to ${devicePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnect device
     */
    disconnectDevice(devicePath) {
        const device = this.devices.get(devicePath);
        if (device) {
            device.disconnect();
            this.devices.delete(devicePath);
        }
    }

    /**
     * Get device by path
     */
    getDevice(devicePath) {
        return this.devices.get(devicePath);
    }

    /**
     * Get all devices
     */
    getAllDevices() {
        return Array.from(this.devices.values()).map(d => d.getInfo());
    }

    /**
     * Execute CoAP request on specific device
     */
    async executeRequest(devicePath, method, uri, data = null) {
        const device = this.devices.get(devicePath);
        if (!device) {
            throw new Error(`Device not found: ${devicePath}`);
        }

        if (!device.isConnected()) {
            throw new Error(`Device not connected: ${devicePath}`);
        }

        return device.coap.request(method, uri, data);
    }

    /**
     * Start auto-scanning
     */
    startAutoScan(interval = 5000) {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        console.log(`[DeviceManager] Starting auto-scan (every ${interval}ms)`);
        this.scanInterval = setInterval(() => {
            this.scanDevices().catch(err => {
                console.error('[DeviceManager] Auto-scan error:', err.message);
            });
        }, interval);

        // Initial scan
        this.scanDevices();
    }

    /**
     * Stop auto-scanning
     */
    stopAutoScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    /**
     * Cleanup
     */
    shutdown() {
        this.stopAutoScan();
        for (const device of this.devices.values()) {
            device.disconnect();
        }
        this.devices.clear();
    }
}

/**
 * Single device connection
 */
class DeviceConnection {
    constructor(devicePath, baudRate = 115200) {
        this.devicePath = devicePath;
        this.baudRate = baudRate;
        this.serial = null;
        this.protocol = new MUP1Protocol();
        this.coap = null;
        this.connected = false;
        this.deviceInfo = {
            path: devicePath,
            baudRate,
            connected: false,
            model: 'Unknown',
            firmware: 'Unknown',
            serialNumber: 'Unknown',
            interfaces: [],
            lastSeen: null
        };
    }

    /**
     * Connect to device
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.serial = new SerialPort({
                path: this.devicePath,
                baudRate: this.baudRate,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false
            });

            this.serial.open((err) => {
                if (err) {
                    console.error(`[${this.devicePath}] Open error:`, err.message);
                    reject(err);
                    return;
                }

                this.connected = true;
                this.deviceInfo.connected = true;
                this.deviceInfo.lastSeen = new Date().toISOString();

                // Create CoAP client
                this.coap = new CoAPClient(this.protocol, this.serial);

                // Setup data handler
                this.serial.on('data', (data) => {
                    this.coap.handleData(data);
                });

                this.serial.on('error', (err) => {
                    console.error(`[${this.devicePath}] Serial error:`, err.message);
                    this.connected = false;
                    this.deviceInfo.connected = false;
                });

                this.serial.on('close', () => {
                    console.log(`[${this.devicePath}] Serial port closed`);
                    this.connected = false;
                    this.deviceInfo.connected = false;
                });

                console.log(`[${this.devicePath}] Connected successfully`);

                // Send initial ping
                setTimeout(() => {
                    const ping = this.protocol.createPing();
                    this.serial.write(ping);
                }, 500);

                resolve();
            });
        });
    }

    /**
     * Disconnect from device
     */
    disconnect() {
        if (this.serial && this.serial.isOpen) {
            this.serial.close();
        }
        this.connected = false;
        this.deviceInfo.connected = false;
    }

    /**
     * Check connection status
     */
    isConnected() {
        return this.connected && this.serial && this.serial.isOpen;
    }

    /**
     * Query device information
     */
    async queryDeviceInfo() {
        try {
            // Get system information
            const systemInfo = await this.coap.get('/c?d=a');

            if (systemInfo) {
                // Extract device info from YANG data
                this.parseDeviceInfo(systemInfo);
                this.deviceInfo.lastSeen = new Date().toISOString();
            }

            return this.deviceInfo;
        } catch (error) {
            console.error(`[${this.devicePath}] Query device info failed:`, error.message);
            throw error;
        }
    }

    /**
     * Parse YANG device info
     */
    parseDeviceInfo(yangData) {
        try {
            // Extract system state
            const systemState = yangData['ietf-system:system-state'];
            if (systemState) {
                const platform = systemState.platform;
                if (platform) {
                    this.deviceInfo.model = platform['os-name'] || 'LAN9662';
                    this.deviceInfo.firmware = platform['os-version'] || 'Unknown';
                    this.deviceInfo.serialNumber = platform['machine'] || 'Unknown';
                }
            }

            // Extract interfaces
            const interfaces = yangData['ietf-interfaces:interfaces'];
            if (interfaces && interfaces.interface) {
                this.deviceInfo.interfaces = interfaces.interface.map(iface => ({
                    name: iface.name,
                    type: iface.type,
                    enabled: iface['admin-state'] === 'up',
                    operStatus: iface['oper-state']
                }));
            }

            // Extract bridge info
            const bridges = yangData['ieee802-dot1q-bridge:bridges'];
            if (bridges && bridges.bridge) {
                this.deviceInfo.bridges = bridges.bridge.map(br => ({
                    name: br.name,
                    address: br.address,
                    components: br.component?.length || 0
                }));
            }

        } catch (error) {
            console.warn(`[${this.devicePath}] Failed to parse device info:`, error.message);
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

export default DeviceManager;
