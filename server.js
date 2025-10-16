#!/usr/bin/env node

/**
 * KETI TSN Configuration Tool - Server
 *
 * Multi-board management system for Microchip LAN9662
 * Implements MUP1 + CoAP + CORECONF protocols
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import DeviceManager from './lib/device-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// Device manager instance
const deviceManager = new DeviceManager();

// Request history
let requestHistory = [];
const MAX_HISTORY = 200;

/**
 * Add request to history
 */
function addToHistory(device, method, uri, result, error = null) {
    requestHistory.unshift({
        timestamp: new Date().toISOString(),
        device,
        method,
        uri,
        success: !error,
        result: error ? null : result,
        error: error ? error.message : null,
        duration: result?.duration || 0
    });

    if (requestHistory.length > MAX_HISTORY) {
        requestHistory = requestHistory.slice(0, MAX_HISTORY);
    }
}

// ============================================
// API Endpoints
// ============================================

/**
 * GET /api/devices
 * List all connected devices
 */
app.get('/api/devices', (req, res) => {
    try {
        const devices = deviceManager.getAllDevices();
        res.json({
            success: true,
            count: devices.length,
            devices
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/scan
 * Trigger device scan
 */
app.post('/api/devices/scan', async (req, res) => {
    try {
        const devices = await deviceManager.scanDevices();
        res.json({
            success: true,
            count: devices.length,
            devices
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/:path/connect
 * Connect to specific device
 */
app.post('/api/devices/:devicePath(*)/connect', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        const { baudRate = 115200 } = req.body;

        const info = await deviceManager.connectDevice(devicePath, baudRate);

        res.json({
            success: true,
            device: info
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/:path/disconnect
 * Disconnect from specific device
 */
app.post('/api/devices/:devicePath(*)/disconnect', (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        deviceManager.disconnectDevice(devicePath);

        res.json({
            success: true,
            message: 'Device disconnected'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/:path/info
 * Get device information
 */
app.get('/api/devices/:devicePath(*)/info', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        const device = deviceManager.getDevice(devicePath);

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        const info = await device.queryDeviceInfo();

        res.json({
            success: true,
            device: info
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/:path/coap
 * Execute CoAP request on device
 */
app.post('/api/devices/:devicePath(*)/coap', async (req, res) => {
    const startTime = Date.now();
    const devicePath = '/' + req.params.devicePath;

    try {
        const { method = 'GET', uri = '/c?d=a', data = null } = req.body;

        console.log(`[API] ${method} ${uri} on ${devicePath}`);

        const result = await deviceManager.executeRequest(devicePath, method, uri, data);
        const duration = Date.now() - startTime;

        addToHistory(devicePath, method, uri, { data: result, duration });

        res.json({
            success: true,
            method,
            uri,
            data: result,
            duration,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        addToHistory(devicePath, req.body.method, req.body.uri, null, error);

        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            duration,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/devices/:path/yang
 * Get full YANG configuration
 */
app.get('/api/devices/:devicePath(*)/yang', async (req, res) => {
    const startTime = Date.now();
    const devicePath = '/' + req.params.devicePath;

    try {
        const format = req.query.format || 'json';

        const data = await deviceManager.executeRequest(devicePath, 'GET', '/c?d=a');
        const duration = Date.now() - startTime;

        if (format === 'yaml') {
            res.type('text/yaml');
            res.send(yamlStringify(data));
        } else {
            res.json({
                success: true,
                data,
                duration,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            duration: Date.now() - startTime
        });
    }
});

/**
 * GET /api/devices/:path/interfaces
 * Get network interfaces
 */
app.get('/api/devices/:devicePath(*)/interfaces', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        const data = await deviceManager.executeRequest(devicePath, 'GET', '/c?d=a');

        const interfaces = data?.['ietf-interfaces:interfaces']?.interface || [];

        res.json({
            success: true,
            interfaces
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/:path/bridge
 * Get bridge configuration
 */
app.get('/api/devices/:devicePath(*)/bridge', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        const data = await deviceManager.executeRequest(devicePath, 'GET', '/c?d=a');

        const bridges = data?.['ieee802-dot1q-bridge:bridges']?.bridge || [];

        res.json({
            success: true,
            bridges
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/:path/scheduler
 * Get TSN scheduler configuration
 */
app.get('/api/devices/:devicePath(*)/scheduler', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;
        const data = await deviceManager.executeRequest(devicePath, 'GET', '/c?d=a');

        const scheduler = data?.['ieee802-dot1q-sched:interfaces']?.interface || [];

        res.json({
            success: true,
            scheduler
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history
 * Get request history
 */
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        success: true,
        history: requestHistory.slice(0, limit)
    });
});

/**
 * DELETE /api/history
 * Clear request history
 */
app.delete('/api/history', (req, res) => {
    requestHistory = [];
    res.json({
        success: true,
        message: 'History cleared'
    });
});

/**
 * GET /api/stats
 * Get server statistics
 */
app.get('/api/stats', (req, res) => {
    const devices = deviceManager.getAllDevices();
    const connectedDevices = devices.filter(d => d.connected);

    const totalRequests = requestHistory.length;
    const successfulRequests = requestHistory.filter(h => h.success).length;
    const avgDuration = requestHistory.length > 0
        ? requestHistory.reduce((sum, h) => sum + h.duration, 0) / requestHistory.length
        : 0;

    res.json({
        success: true,
        stats: {
            totalDevices: devices.length,
            connectedDevices: connectedDevices.length,
            totalRequests,
            successfulRequests,
            failedRequests: totalRequests - successfulRequests,
            successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) + '%' : '0%',
            avgDuration: Math.round(avgDuration) + 'ms',
            uptime: process.uptime()
        },
        devices: connectedDevices.map(d => ({
            path: d.path,
            model: d.model,
            firmware: d.firmware,
            interfaces: d.interfaces?.length || 0
        }))
    });
});

/**
 * Main page
 */
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ============================================
// Server Startup
// ============================================

app.listen(PORT, '0.0.0.0', async () => {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  KETI TSN Configuration Tool                         ║');
    console.log('║  Multi-Board Management System                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://<your-ip>:${PORT}`);
    console.log('');
    console.log('📡 Protocol: MUP1 + CoAP + CORECONF (No Docker)');
    console.log('🔧 Device Support: Multiple LAN9662 boards');
    console.log('');

    // Start auto-scanning for devices
    deviceManager.startAutoScan(5000);

    console.log('🔍 Auto-scanning for devices...');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('─────────────────────────────────────────────────────');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    deviceManager.shutdown();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    deviceManager.shutdown();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});
