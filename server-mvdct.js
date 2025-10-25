#!/usr/bin/env node

/**
 * KETI TSN Configuration Tool - Server (Using mvdct CLI)
 *
 * Multi-board management system for Microchip LAN9662
 * Uses official mvdct CLI tool instead of direct protocol implementation
 */

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync } from 'fs';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// Configuration
const MVDCT_PATH = join(__dirname, 'mvdct');
const DEFAULT_DEVICE = '/dev/ttyACM0';

// Request history
let requestHistory = [];
const MAX_HISTORY = 200;

// Result cache for performance
const resultCache = new Map();
const CACHE_TTL = 2000; // 2 seconds

// Request queue (serial port can't handle concurrent access)
const requestQueue = [];
let isProcessing = false;

// Device info cache
const deviceCache = new Map();

/**
 * Process request queue
 */
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const { device, args, resolve, reject } = requestQueue.shift();

    try {
        const result = await executeMvdctRaw(device, args);
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        isProcessing = false;
        if (requestQueue.length > 0) {
            setImmediate(processQueue);
        }
    }
}

/**
 * Execute mvdct command (with caching and queuing)
 */
function executeMvdct(device, args) {
    const isGetCommand = args.includes('get') && !args.includes('set');
    const cacheKey = isGetCommand ? JSON.stringify({ device, args }) : null;

    // Check cache
    if (cacheKey && resultCache.has(cacheKey)) {
        const cached = resultCache.get(cacheKey);
        const age = Date.now() - cached.timestamp;
        if (age < CACHE_TTL) {
            console.log(`[CACHE HIT] ${device} (age: ${age}ms)`);
            return Promise.resolve({
                ...cached.result,
                cached: true,
                cacheAge: age
            });
        } else {
            resultCache.delete(cacheKey);
        }
    }

    // Add to queue
    return new Promise((resolve, reject) => {
        requestQueue.push({ device, args, resolve, reject, cacheKey });
        processQueue();
    });
}

/**
 * Execute mvdct command (raw, no caching)
 */
function executeMvdctRaw(device, args) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const fullArgs = ['device', device, ...args];
        const proc = spawn(MVDCT_PATH, fullArgs);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            const executionTime = Date.now() - startTime;
            const success = code === 0;

            // Parse YAML output if successful
            let data = null;
            if (success && stdout.trim()) {
                try {
                    data = yamlParse(stdout);
                } catch (e) {
                    console.warn('[YAML] Parse failed, using raw output');
                    data = stdout.trim();
                }
            }

            const result = {
                success,
                data,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code,
                executionTime,
                timestamp: new Date().toISOString()
            };

            // Add to history
            requestHistory.unshift({
                device,
                args,
                result,
                timestamp: new Date().toISOString(),
                executionTime
            });

            if (requestHistory.length > MAX_HISTORY) {
                requestHistory = requestHistory.slice(0, MAX_HISTORY);
            }

            // Cache GET results
            if (args.includes('get') && !args.includes('set') && success) {
                const cacheKey = JSON.stringify({ device, args });
                resultCache.set(cacheKey, {
                    result,
                    timestamp: Date.now()
                });

                if (resultCache.size > 100) {
                    const firstKey = resultCache.keys().next().value;
                    resultCache.delete(firstKey);
                }
            }

            console.log(`[MVDCT] ${device} ${args.join(' ')} → ${success ? 'OK' : 'FAIL'} (${executionTime}ms)`);

            if (success) {
                resolve(result);
            } else {
                reject(new Error(stderr || `Command failed with code ${code}`));
            }
        });

        proc.on('error', (error) => {
            const executionTime = Date.now() - startTime;
            console.error(`[ERROR] ${device} ${args.join(' ')} → ${error.message} (${executionTime}ms)`);
            reject(error);
        });

        // 15 second timeout
        const timeoutId = setTimeout(() => {
            proc.kill('SIGTERM');
            setTimeout(() => {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
            }, 3000);

            const executionTime = Date.now() - startTime;
            console.error(`[TIMEOUT] ${device} ${args.join(' ')} (${executionTime}ms)`);
            reject(new Error('Command timeout (15s)'));
        }, 15000);

        proc.on('close', () => clearTimeout(timeoutId));
    });
}

/**
 * Scan for available devices
 */
async function scanDevices() {
    try {
        const devPath = '/dev';
        const files = readdirSync(devPath);
        const ttyDevices = files
            .filter(f => f.startsWith('ttyACM') || f.startsWith('ttyUSB'))
            .map(f => `${devPath}/${f}`)
            .sort();

        const devices = [];

        for (const devicePath of ttyDevices) {
            // Try to get device info
            try {
                const result = await executeMvdct(devicePath, ['get', '/ietf-system:system-state/platform']);

                const platform = result.data?.['ietf-system:system-state']?.platform;

                const deviceInfo = {
                    path: devicePath,
                    connected: true,
                    model: platform?.['os-name'] || 'LAN9662',
                    firmware: platform?.['os-version'] || 'Unknown',
                    serialNumber: platform?.machine || 'Unknown',
                    lastSeen: new Date().toISOString()
                };

                deviceCache.set(devicePath, deviceInfo);
                devices.push(deviceInfo);
            } catch (error) {
                // Device exists but may not be responsive
                devices.push({
                    path: devicePath,
                    connected: false,
                    model: 'Unknown',
                    firmware: 'Unknown',
                    error: error.message
                });
            }
        }

        return devices;
    } catch (error) {
        console.error('[SCAN] Error:', error.message);
        return [];
    }
}

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
        duration: result?.executionTime || 0
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
app.get('/api/devices', async (req, res) => {
    try {
        const devices = await scanDevices();
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
        const devices = await scanDevices();
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
 * GET /api/devices/:path/info
 * Get device information
 */
app.get('/api/devices/:devicePath(*)/info', async (req, res) => {
    try {
        const devicePath = '/' + req.params.devicePath;

        const result = await executeMvdct(devicePath, ['get', '/c?d=a']);

        const systemState = result.data?.['ietf-system:system-state'];
        const interfaces = result.data?.['ietf-interfaces:interfaces']?.interface || [];
        const bridges = result.data?.['ieee802-dot1q-bridge:bridges']?.bridge || [];

        const deviceInfo = {
            path: devicePath,
            connected: true,
            model: systemState?.platform?.['os-name'] || 'LAN9662',
            firmware: systemState?.platform?.['os-version'] || 'Unknown',
            serialNumber: systemState?.platform?.machine || 'Unknown',
            interfaces: interfaces.map(iface => ({
                name: iface.name,
                type: iface.type,
                enabled: iface['admin-state'] === 'up',
                operStatus: iface['oper-state']
            })),
            bridges: bridges.map(br => ({
                name: br.name,
                address: br.address,
                components: br.component?.length || 0
            })),
            lastSeen: new Date().toISOString()
        };

        res.json({
            success: true,
            device: deviceInfo
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
 * Execute CoAP-style request on device (using mvdct)
 */
app.post('/api/devices/:devicePath(*)/coap', async (req, res) => {
    const startTime = Date.now();
    const devicePath = '/' + req.params.devicePath;

    try {
        const { method = 'GET', uri = '/c?d=a', data = null } = req.body;

        console.log(`[API] ${method} ${uri} on ${devicePath}`);

        // Convert CoAP-style request to mvdct args
        let args;
        if (method.toUpperCase() === 'GET') {
            args = ['get', uri];
        } else if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT') {
            args = ['set', uri, JSON.stringify(data)];
        } else if (method.toUpperCase() === 'DELETE') {
            args = ['delete', uri];
        } else if (method.toUpperCase() === 'IPATCH' || method.toUpperCase() === 'PATCH') {
            args = ['set', uri, JSON.stringify(data)];
        } else {
            throw new Error(`Unsupported method: ${method}`);
        }

        const result = await executeMvdct(devicePath, args);
        const duration = Date.now() - startTime;

        addToHistory(devicePath, method, uri, { data: result.data, duration });

        res.json({
            success: true,
            method,
            uri,
            data: result.data,
            duration,
            cached: result.cached || false,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        addToHistory(devicePath, req.body.method, req.body.uri, null, error);

        res.status(500).json({
            success: false,
            error: error.message,
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

        const result = await executeMvdct(devicePath, ['get', '/c?d=a']);
        const duration = Date.now() - startTime;

        if (format === 'yaml') {
            res.type('text/yaml');
            res.send(yamlStringify(result.data));
        } else {
            res.json({
                success: true,
                data: result.data,
                duration,
                cached: result.cached || false,
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
        const result = await executeMvdct(devicePath, ['get', '/ietf-interfaces:interfaces']);

        const interfaces = result.data?.['ietf-interfaces:interfaces']?.interface || [];

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
        const result = await executeMvdct(devicePath, ['get', '/ieee802-dot1q-bridge:bridges']);

        const bridges = result.data?.['ieee802-dot1q-bridge:bridges']?.bridge || [];

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
        const result = await executeMvdct(devicePath, ['get', '/ieee802-dot1q-sched:interfaces']);

        const scheduler = result.data?.['ieee802-dot1q-sched:interfaces']?.interface || [];

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
 * DELETE /api/cache
 * Clear result cache
 */
app.delete('/api/cache', (req, res) => {
    resultCache.clear();
    res.json({
        success: true,
        message: 'Cache cleared',
        clearedEntries: resultCache.size
    });
});

/**
 * GET /api/stats
 * Get server statistics
 */
app.get('/api/stats', (req, res) => {
    const devices = Array.from(deviceCache.values());
    const connectedDevices = devices.filter(d => d.connected);

    const totalRequests = requestHistory.length;
    const successfulRequests = requestHistory.filter(h => h.success).length;
    const avgDuration = requestHistory.length > 0
        ? requestHistory.reduce((sum, h) => sum + (h.executionTime || h.duration || 0), 0) / requestHistory.length
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
            cacheSize: resultCache.size,
            queueLength: requestQueue.length,
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
    console.log('║  KETI TSN Configuration Tool (mvdct)                 ║');
    console.log('║  Multi-Board Management System                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://<your-ip>:${PORT}`);
    console.log('');
    console.log('📡 Tool: mvdct CLI (Official)');
    console.log(`🔧 Binary: ${MVDCT_PATH}`);
    console.log(`🔌 Default Device: ${DEFAULT_DEVICE}`);
    console.log('');

    // Check if mvdct exists
    if (!existsSync(MVDCT_PATH)) {
        console.error('⚠️  WARNING: mvdct binary not found!');
        console.error(`    Expected at: ${MVDCT_PATH}`);
        console.error('    Please copy mvdct from keti-tsn-ms or download from Microchip.');
    } else {
        console.log('✅ mvdct binary found');
    }

    // Initial device scan
    console.log('');
    console.log('🔍 Scanning for devices...');
    const devices = await scanDevices();
    console.log(`   Found ${devices.length} device(s)`);
    devices.forEach(d => {
        console.log(`   - ${d.path}: ${d.connected ? '✅ ' + d.model : '❌ Not responding'}`);
    });

    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('─────────────────────────────────────────────────────');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});
