/**
 * KETI TSN Configuration Tool - Frontend Application
 */

// API base URL
const API_BASE = window.location.origin;

// Global state
const state = {
    selectedDevice: null,
    devices: [],
    yangData: null,
    refreshInterval: null
};

// ============================================
// Utility Functions
// ============================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
}

/**
 * Format duration
 */
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// API Functions
// ============================================

/**
 * API: Get all devices
 */
async function getDevices() {
    const response = await fetch(`${API_BASE}/api/devices`);
    const data = await response.json();
    return data.devices || [];
}

/**
 * API: Scan for devices
 */
async function scanDevices() {
    const response = await fetch(`${API_BASE}/api/devices/scan`, { method: 'POST' });
    const data = await response.json();
    return data.devices || [];
}

/**
 * API: Execute CoAP request
 */
async function executeCoAP(devicePath, method, uri, payload = null) {
    const response = await fetch(`${API_BASE}/api/devices${devicePath}/coap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, uri, data: payload })
    });
    return await response.json();
}

/**
 * API: Get YANG configuration
 */
async function getYANG(devicePath) {
    const response = await fetch(`${API_BASE}/api/devices${devicePath}/yang`);
    return await response.json();
}

/**
 * API: Get interfaces
 */
async function getInterfaces(devicePath) {
    const response = await fetch(`${API_BASE}/api/devices${devicePath}/interfaces`);
    return await response.json();
}

/**
 * API: Get bridge config
 */
async function getBridge(devicePath) {
    const response = await fetch(`${API_BASE}/api/devices${devicePath}/bridge`);
    return await response.json();
}

/**
 * API: Get scheduler config
 */
async function getScheduler(devicePath) {
    const response = await fetch(`${API_BASE}/api/devices${devicePath}/scheduler`);
    return await response.json();
}

/**
 * API: Get history
 */
async function getHistory() {
    const response = await fetch(`${API_BASE}/api/history`);
    return await response.json();
}

/**
 * API: Clear history
 */
async function clearHistory() {
    const response = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
    return await response.json();
}

/**
 * API: Get stats
 */
async function getStats() {
    const response = await fetch(`${API_BASE}/api/stats`);
    return await response.json();
}

// ============================================
// UI Rendering Functions
// ============================================

/**
 * Render device list
 */
function renderDeviceList(devices) {
    const container = document.getElementById('device-list');

    if (!devices || devices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No devices found</p>
                <p class="text-muted">Click "Scan" to search for devices</p>
            </div>
        `;
        return;
    }

    container.innerHTML = devices.map(device => `
        <div class="device-item ${device.connected ? 'active' : 'disconnected'}"
             data-path="${device.path}"
             onclick="selectDevice('${device.path}')">
            <div class="device-name">
                <span class="device-status ${device.connected ? '' : 'disconnected'}"></span>
                ${device.path}
            </div>
            <div class="device-info-small">
                ${device.model || 'Unknown'}<br>
                ${device.firmware || 'Unknown'}
            </div>
        </div>
    `).join('');

    state.devices = devices;
}

/**
 * Render device overview
 */
function renderDeviceOverview(device) {
    const container = document.getElementById('device-info');

    container.innerHTML = `
        <div class="info-grid">
            <div class="info-card">
                <h4>Device Path</h4>
                <p>${device.path}</p>
            </div>
            <div class="info-card">
                <h4>Model</h4>
                <p>${device.model || 'Unknown'}</p>
            </div>
            <div class="info-card">
                <h4>Firmware</h4>
                <p>${device.firmware || 'Unknown'}</p>
            </div>
            <div class="info-card">
                <h4>Serial Number</h4>
                <p>${device.serialNumber || 'Unknown'}</p>
            </div>
            <div class="info-card">
                <h4>Status</h4>
                <p>
                    <span class="badge ${device.connected ? 'success' : 'danger'}">
                        ${device.connected ? 'Connected' : 'Disconnected'}
                    </span>
                </p>
            </div>
            <div class="info-card">
                <h4>Interfaces</h4>
                <p>${device.interfaces?.length || 0}</p>
            </div>
        </div>

        ${device.interfaces && device.interfaces.length > 0 ? `
            <h4 style="margin-top: 1.5rem; margin-bottom: 1rem;">Network Interfaces</h4>
            <div class="interface-grid">
                ${device.interfaces.map(iface => `
                    <div class="interface-card ${iface.enabled ? 'active' : 'inactive'}">
                        <div class="interface-header">
                            <span class="interface-name">${iface.name}</span>
                            <span class="badge ${iface.enabled ? 'success' : 'danger'}">
                                ${iface.enabled ? 'UP' : 'DOWN'}
                            </span>
                        </div>
                        <div class="interface-details">
                            Type: ${iface.type || 'Unknown'}<br>
                            Oper Status: ${iface.operStatus || 'Unknown'}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

/**
 * Render YANG data
 */
function renderYANG(yangData, format = 'tree') {
    const container = document.getElementById('yang-container');

    if (!yangData) {
        container.innerHTML = '<div class="empty-state"><p>No data available</p></div>';
        return;
    }

    if (format === 'json') {
        container.innerHTML = `<pre>${JSON.stringify(yangData, null, 2)}</pre>`;
    } else if (format === 'yaml') {
        // Simple YAML-like formatting
        container.innerHTML = `<pre>${objectToYAML(yangData)}</pre>`;
    } else {
        // Tree view
        container.innerHTML = renderYANGTree(yangData);
    }

    state.yangData = yangData;
}

/**
 * Render YANG as tree
 */
function renderYANGTree(obj, depth = 0) {
    const indent = '  '.repeat(depth);
    let html = '';

    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            html += `<div class="yang-node">${indent}<span class="yang-key">${key}:</span></div>`;
            html += renderYANGTree(value, depth + 1);
        } else if (Array.isArray(value)) {
            html += `<div class="yang-node">${indent}<span class="yang-key">${key}:</span> [${value.length} items]</div>`;
            value.forEach((item, idx) => {
                if (typeof item === 'object') {
                    html += `<div class="yang-node">${indent}  - Item ${idx}:</div>`;
                    html += renderYANGTree(item, depth + 2);
                } else {
                    html += `<div class="yang-node">${indent}  - <span class="yang-value">${item}</span></div>`;
                }
            });
        } else {
            const valueClass = typeof value === 'string' ? 'yang-string' :
                              typeof value === 'number' ? 'yang-number' :
                              typeof value === 'boolean' ? 'yang-boolean' : 'yang-value';
            html += `<div class="yang-node">${indent}<span class="yang-key">${key}:</span> <span class="${valueClass}">${JSON.stringify(value)}</span></div>`;
        }
    }

    return html;
}

/**
 * Convert object to YAML-like string
 */
function objectToYAML(obj, indent = 0) {
    const indentStr = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            yaml += `${indentStr}${key}:\n${objectToYAML(value, indent + 1)}`;
        } else if (Array.isArray(value)) {
            yaml += `${indentStr}${key}:\n`;
            value.forEach(item => {
                if (typeof item === 'object') {
                    yaml += `${indentStr}  -\n${objectToYAML(item, indent + 2)}`;
                } else {
                    yaml += `${indentStr}  - ${item}\n`;
                }
            });
        } else {
            yaml += `${indentStr}${key}: ${value}\n`;
        }
    }

    return yaml;
}

/**
 * Render interfaces
 */
function renderInterfaces(interfaces) {
    const container = document.getElementById('interfaces-container');

    if (!interfaces || interfaces.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No interfaces found</p></div>';
        return;
    }

    container.innerHTML = `
        <div class="interface-grid">
            ${interfaces.map(iface => `
                <div class="interface-card ${iface['admin-state'] === 'up' ? 'active' : 'inactive'}">
                    <div class="interface-header">
                        <span class="interface-name">${iface.name}</span>
                        <span class="badge ${iface['admin-state'] === 'up' ? 'success' : 'danger'}">
                            ${iface['admin-state'] || 'unknown'}
                        </span>
                    </div>
                    <div class="interface-details">
                        Type: ${iface.type || 'Unknown'}<br>
                        Oper Status: ${iface['oper-state'] || 'Unknown'}<br>
                        ${iface.statistics ? `
                            RX: ${formatBytes(iface.statistics['in-octets'] || 0)}<br>
                            TX: ${formatBytes(iface.statistics['out-octets'] || 0)}
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render bridge configuration
 */
function renderBridge(bridges) {
    const container = document.getElementById('bridge-container');

    if (!bridges || bridges.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No bridge configuration found</p></div>';
        return;
    }

    container.innerHTML = bridges.map(bridge => `
        <div class="info-card" style="margin-bottom: 1rem;">
            <h4>Bridge: ${bridge.name}</h4>
            <div style="margin-top: 0.5rem;">
                <strong>Address:</strong> ${bridge.address || 'N/A'}<br>
                <strong>Components:</strong> ${bridge.component?.length || 0}
            </div>
        </div>
        ${bridge.component ? bridge.component.map(comp => `
            <div class="yang-container" style="margin-bottom: 1rem;">
                <strong>Component: ${comp.name}</strong>
                <pre>${JSON.stringify(comp, null, 2)}</pre>
            </div>
        `).join('') : ''}
    `).join('');
}

/**
 * Render scheduler configuration
 */
function renderScheduler(scheduler) {
    const container = document.getElementById('scheduler-container');

    if (!scheduler || scheduler.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No scheduler configuration found</p></div>';
        return;
    }

    container.innerHTML = `
        <div class="yang-container">
            <pre>${JSON.stringify(scheduler, null, 2)}</pre>
        </div>
    `;
}

/**
 * Render console output
 */
function renderConsoleOutput(entry) {
    const container = document.getElementById('console-output');
    const welcome = container.querySelector('.console-welcome');
    if (welcome) welcome.remove();

    const entryDiv = document.createElement('div');
    entryDiv.className = `console-entry ${entry.success ? 'success' : 'error'}`;
    entryDiv.innerHTML = `
        <div class="console-entry-header">
            <span>${entry.method} ${entry.uri}</span>
            <span>${formatTime(entry.timestamp)} (${formatDuration(entry.duration)})</span>
        </div>
        <div class="console-entry-content">
            ${entry.success ?
                `<pre>${JSON.stringify(entry.data, null, 2)}</pre>` :
                `<span style="color: var(--danger)">Error: ${entry.error}</span>`
            }
        </div>
    `;
    container.insertBefore(entryDiv, container.firstChild);
}

/**
 * Render history
 */
function renderHistory(history) {
    const container = document.getElementById('history-container');

    if (!history || history.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No requests yet</p></div>';
        return;
    }

    container.innerHTML = history.map(item => `
        <div class="history-item ${item.success ? 'success' : 'error'}">
            <div class="history-item-header">
                <span class="history-method">${item.method}</span>
                <span class="history-time">${formatTime(item.timestamp)} (${formatDuration(item.duration)})</span>
            </div>
            <div class="history-uri">${item.uri}</div>
            <div class="history-device">Device: ${item.device}</div>
            ${!item.success ? `<div style="color: var(--danger); margin-top: 0.5rem;">Error: ${item.error}</div>` : ''}
        </div>
    `).join('');
}

/**
 * Update stats
 */
async function updateStats() {
    try {
        const stats = await getStats();
        if (stats.success) {
            document.getElementById('stat-devices').textContent = stats.stats.connectedDevices;
            document.getElementById('stat-requests').textContent = stats.stats.totalRequests;
            document.getElementById('stat-success').textContent = stats.stats.successRate;
        }
    } catch (error) {
        console.error('Failed to update stats:', error);
    }
}

// ============================================
// Event Handlers
// ============================================

/**
 * Select device
 */
window.selectDevice = async function(devicePath) {
    state.selectedDevice = devicePath;

    // Update UI
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.toggle('active', item.dataset.path === devicePath);
    });

    const device = state.devices.find(d => d.path === devicePath);
    if (device) {
        renderDeviceOverview(device);
        showToast(`Selected device: ${devicePath}`, 'success');
    }
};

/**
 * Scan for devices
 */
document.getElementById('btn-scan').addEventListener('click', async () => {
    try {
        showToast('Scanning for devices...', 'info');
        const devices = await scanDevices();
        renderDeviceList(devices);
        showToast(`Found ${devices.length} device(s)`, 'success');
    } catch (error) {
        showToast(`Scan failed: ${error.message}`, 'error');
    }
});

/**
 * Tab switching
 */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
    });
});

/**
 * Refresh YANG
 */
document.getElementById('btn-refresh-yang').addEventListener('click', async () => {
    if (!state.selectedDevice) {
        showToast('Please select a device first', 'warning');
        return;
    }

    try {
        showToast('Loading YANG configuration...', 'info');
        const result = await getYANG(state.selectedDevice);
        if (result.success) {
            const format = document.getElementById('yang-format').value;
            renderYANG(result.data, format);
            showToast('YANG configuration loaded', 'success');
        }
    } catch (error) {
        showToast(`Failed to load YANG: ${error.message}`, 'error');
    }
});

/**
 * YANG format change
 */
document.getElementById('yang-format').addEventListener('change', (e) => {
    if (state.yangData) {
        renderYANG(state.yangData, e.target.value);
    }
});

/**
 * Refresh interfaces
 */
document.getElementById('btn-refresh-interfaces').addEventListener('click', async () => {
    if (!state.selectedDevice) {
        showToast('Please select a device first', 'warning');
        return;
    }

    try {
        const result = await getInterfaces(state.selectedDevice);
        if (result.success) {
            renderInterfaces(result.interfaces);
            showToast('Interfaces loaded', 'success');
        }
    } catch (error) {
        showToast(`Failed to load interfaces: ${error.message}`, 'error');
    }
});

/**
 * Refresh bridge
 */
document.getElementById('btn-refresh-bridge').addEventListener('click', async () => {
    if (!state.selectedDevice) {
        showToast('Please select a device first', 'warning');
        return;
    }

    try {
        const result = await getBridge(state.selectedDevice);
        if (result.success) {
            renderBridge(result.bridges);
            showToast('Bridge configuration loaded', 'success');
        }
    } catch (error) {
        showToast(`Failed to load bridge: ${error.message}`, 'error');
    }
});

/**
 * Refresh scheduler
 */
document.getElementById('btn-refresh-scheduler').addEventListener('click', async () => {
    if (!state.selectedDevice) {
        showToast('Please select a device first', 'warning');
        return;
    }

    try {
        const result = await getScheduler(state.selectedDevice);
        if (result.success) {
            renderScheduler(result.scheduler);
            showToast('Scheduler configuration loaded', 'success');
        }
    } catch (error) {
        showToast(`Failed to load scheduler: ${error.message}`, 'error');
    }
});

/**
 * Execute CoAP command
 */
document.getElementById('btn-execute').addEventListener('click', async () => {
    if (!state.selectedDevice) {
        showToast('Please select a device first', 'warning');
        return;
    }

    const method = document.getElementById('console-method').value;
    const uri = document.getElementById('console-uri').value;
    const payloadText = document.getElementById('console-payload').value.trim();

    let payload = null;
    if (payloadText && ['PUT', 'POST', 'IPATCH'].includes(method)) {
        try {
            payload = JSON.parse(payloadText);
        } catch (error) {
            showToast('Invalid JSON payload', 'error');
            return;
        }
    }

    try {
        showToast(`Executing ${method} ${uri}...`, 'info');
        const result = await executeCoAP(state.selectedDevice, method, uri, payload);
        renderConsoleOutput(result);
        if (result.success) {
            showToast('Command executed successfully', 'success');
        } else {
            showToast(`Command failed: ${result.error}`, 'error');
        }
        updateStats();
    } catch (error) {
        showToast(`Execution failed: ${error.message}`, 'error');
    }
});

/**
 * Clear console
 */
document.getElementById('btn-clear-console').addEventListener('click', () => {
    const container = document.getElementById('console-output');
    container.innerHTML = '<div class="console-welcome"><p>Console cleared</p></div>';
});

/**
 * Load and render history
 */
async function loadHistory() {
    try {
        const result = await getHistory();
        if (result.success) {
            renderHistory(result.history);
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

/**
 * Clear history
 */
document.getElementById('btn-clear-history').addEventListener('click', async () => {
    try {
        await clearHistory();
        renderHistory([]);
        showToast('History cleared', 'success');
        updateStats();
    } catch (error) {
        showToast(`Failed to clear history: ${error.message}`, 'error');
    }
});

// ============================================
// Initialization
// ============================================

async function init() {
    console.log('KETI TSN Configuration Tool - Initializing...');

    // Load initial data
    try {
        const devices = await getDevices();
        renderDeviceList(devices);
        updateStats();
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Failed to connect to server', 'error');
    }

    // Auto-refresh stats every 5 seconds
    setInterval(updateStats, 5000);

    // Auto-refresh devices every 10 seconds
    setInterval(async () => {
        try {
            const devices = await getDevices();
            renderDeviceList(devices);
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }, 10000);
}

// Start application
init();
