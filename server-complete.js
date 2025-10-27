#!/usr/bin/env node

/**
 * KETI TSN Configuration Tool - Complete Server
 *
 * Pure JavaScript implementation - no mvdct binary required
 * Based on official Microchip Ruby implementation
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DeviceManager } from './lib/device-manager-new.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// Device manager
const deviceManager = new DeviceManager();

// Request history
let requestHistory = [];
const MAX_HISTORY = 200;

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
 */
app.post('/api/devices/:devicePath(*)/coap', async (req, res) => {
    const startTime = Date.now();
    const devicePath = '/' + req.params.devicePath;

    try {
        const { method = 'GET', uri = '/c?d=a', data = null, opts = {} } = req.body;

        console.log(`[API] ${method} ${uri} on ${devicePath}`);

        const result = await deviceManager.executeRequest(devicePath, method, uri, data, opts);
        const duration = Date.now() - startTime;

        addToHistory(devicePath, method, uri, { duration });

        res.json({
            success: true,
            method,
            uri,
            codeClass: result.codeClass,
            codeDetail: result.codeDetail,
            payload: result.payload ? result.payload.toString('hex') : null,
            duration,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        addToHistory(devicePath, req.body.method, req.body.uri, null, error);

        res.status(500).json({
            success: false,
            error: error.message,
            codeClass: error.codeClass,
            codeDetail: error.codeDetail,
            duration,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/history
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
 */
app.get('/api/stats', (req, res) => {
    const devices = deviceManager.getAllDevices();
    const connectedDevices = devices.filter(d => d.connected);

    const totalRequests = requestHistory.length;
    const successfulRequests = requestHistory.filter(h => h.success).length;
    const avgDuration = totalRequests > 0
        ? requestHistory.reduce((sum, h) => sum + h.duration, 0) / totalRequests
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
        devices: connectedDevices
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
    console.log('║  Pure JavaScript - No Binary Required!               ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://<your-ip>:${PORT}`);
    console.log('');
    console.log('📡 Protocol Stack:');
    console.log('   ✓ MUP1 Protocol (Pure JS)');
    console.log('   ✓ CoAP Frame Encoding/Decoding');
    console.log('   ✓ Block-wise Transfer (256 bytes)');
    console.log('   ✓ Retransmission & Timeout');
    console.log('   ✓ Multi-device Support');
    console.log('');
    console.log('🔧 Based on official Microchip Ruby implementation');
    console.log('   velocitydrivesp-support/support/libeasy/');
    console.log('');

    // Start auto-scanning
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

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});
