/**
 * Device Manager - Manages Multiple LAN9662 Devices
 */

import { readdirSync } from 'fs';
import { DeviceConnection } from './device-connection.js';

export class DeviceManager {
    constructor() {
        this.devices = new Map();  // path -> DeviceConnection
        this.scanInterval = null;
    }

    /**
     * Scan for available serial devices
     */
    async scanDevices() {
        try {
            const devPath = '/dev';
            const files = readdirSync(devPath);
            const ttyDevices = files
                .filter(f => f.startsWith('ttyACM') || f.startsWith('ttyUSB'))
                .map(f => `${devPath}/${f}`)
                .sort();

            console.log(`[DeviceManager] Found ${ttyDevices.length} serial device(s)`);

            // Connect to new devices
            for (const devicePath of ttyDevices) {
                if (!this.devices.has(devicePath)) {
                    try {
                        await this.connectDevice(devicePath);
                    } catch (error) {
                        console.error(`[DeviceManager] Failed to connect to ${devicePath}:`, error.message);
                    }
                }
            }

            // Remove disconnected devices
            for (const [path, device] of this.devices.entries()) {
                if (!ttyDevices.includes(path)) {
                    console.log(`[DeviceManager] Device removed: ${path}`);
                    this.disconnectDevice(path);
                }
            }

            return this.getAllDevices();
        } catch (error) {
            console.error('[DeviceManager] Scan error:', error.message);
            return [];
        }
    }

    /**
     * Connect to specific device
     */
    async connectDevice(devicePath, baudRate = 115200) {
        if (this.devices.has(devicePath)) {
            console.log(`[DeviceManager] Device ${devicePath} already connected`);
            return this.devices.get(devicePath).getInfo();
        }

        console.log(`[DeviceManager] Connecting to ${devicePath}...`);

        const device = new DeviceConnection(devicePath, baudRate);
        await device.connect();

        this.devices.set(devicePath, device);

        // Query device info after a delay
        setTimeout(() => {
            device.queryDeviceInfo().catch(err => {
                console.warn(`[DeviceManager] Failed to query ${devicePath}:`, err.message);
            });
        }, 1000);

        return device.getInfo();
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
    async executeRequest(devicePath, method, uri, data = null, opts = {}) {
        const device = this.devices.get(devicePath);
        if (!device) {
            throw new Error(`Device not found: ${devicePath}`);
        }

        if (!device.isConnected()) {
            throw new Error(`Device not connected: ${devicePath}`);
        }

        return device.executeCoAP(method, uri, data, opts);
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
     * Shutdown - disconnect all devices
     */
    shutdown() {
        this.stopAutoScan();
        for (const device of this.devices.values()) {
            device.disconnect();
        }
        this.devices.clear();
    }
}

export default DeviceManager;
