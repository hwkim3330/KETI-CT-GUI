#!/usr/bin/env node

/**
 * CORECONF CLI Tool
 *
 * Compatible with mup1ct/mvdct command structure
 * Supports FETCH, IPATCH, GET, PUT, POST operations
 *
 * Usage:
 *   cli.js device <port> get <path> [options]
 *   cli.js device <port> fetch <paths...> [options]
 *   cli.js device <port> ipatch <file.json> [options]
 *   cli.js device <port> put <file.json> [options]
 *   cli.js device <port> post <rpc> [options]
 *
 * Options:
 *   --output <file>    Output to file (JSON/YAML)
 *   --format <fmt>     Output format: json, yaml, pretty (default: pretty)
 *   --depth <d>        GET depth: a (all), t (1 level) (default: a)
 *   --content <c>      GET content: n (nonconfig), a (all), c (config) (default: a)
 *   --verbose          Verbose output
 *   --no-color         Disable colored output
 */

import { DeviceManager } from './lib/device-manager.js';
import { CORECONFClient } from './lib/coreconf-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

let useColor = true;

function color(text, colorCode) {
    return useColor ? `${colorCode}${text}${colors.reset}` : text;
}

function printUsage() {
    console.log(color('CORECONF CLI Tool', colors.bright + colors.cyan));
    console.log('');
    console.log('Usage:');
    console.log('  cli.js device <port> <command> [args...] [options]');
    console.log('');
    console.log('Commands:');
    console.log(color('  get <path>', colors.green));
    console.log('      Retrieve configuration from specified path');
    console.log('      Example: cli.js device /dev/ttyACM0 get /ietf-interfaces:interfaces');
    console.log('');
    console.log(color('  fetch <paths...>', colors.green));
    console.log('      Fetch multiple specific data nodes');
    console.log('      Example: cli.js device /dev/ttyACM0 fetch /ietf-system:system/hostname /ietf-interfaces:interfaces');
    console.log('');
    console.log(color('  ipatch <file>', colors.green));
    console.log('      Apply patches from JSON/YAML file');
    console.log('      Example: cli.js device /dev/ttyACM0 ipatch patches.json');
    console.log('');
    console.log(color('  put <file>', colors.green));
    console.log('      Replace entire configuration from JSON/YAML file');
    console.log('      Example: cli.js device /dev/ttyACM0 put config.json');
    console.log('');
    console.log(color('  post <rpc>', colors.green));
    console.log('      Execute RPC or action');
    console.log('      Example: cli.js device /dev/ttyACM0 post /ietf-system:system-restart');
    console.log('');
    console.log('Options:');
    console.log('  --output <file>     Write output to file (JSON/YAML based on extension)');
    console.log('  --format <fmt>      Output format: json, yaml, pretty (default: pretty)');
    console.log('  --depth <d>         GET depth: a (all), t (1 level) (default: a)');
    console.log('  --content <c>       GET content: n (nonconfig), a (all), c (config) (default: a)');
    console.log('  --verbose           Enable verbose logging');
    console.log('  --no-color          Disable colored output');
    console.log('  --help              Show this help message');
    console.log('');
}

function parseArgs(argv) {
    const args = {
        command: null,
        port: null,
        operation: null,
        params: [],
        options: {
            output: null,
            format: 'pretty',
            depth: 'a',
            content: 'a',
            verbose: false,
            color: true,
        }
    };

    let i = 2; // Skip 'node' and script name

    // Parse command
    if (argv[i] === 'device') {
        args.command = 'device';
        i++;
    } else {
        return null;
    }

    // Parse port
    if (i < argv.length && !argv[i].startsWith('--')) {
        args.port = argv[i];
        i++;
    } else {
        return null;
    }

    // Parse operation
    if (i < argv.length && !argv[i].startsWith('--')) {
        args.operation = argv[i];
        i++;
    } else {
        return null;
    }

    // Parse parameters and options
    while (i < argv.length) {
        const arg = argv[i];

        if (arg === '--output') {
            args.options.output = argv[++i];
        } else if (arg === '--format') {
            args.options.format = argv[++i];
        } else if (arg === '--depth') {
            args.options.depth = argv[++i];
        } else if (arg === '--content') {
            args.options.content = argv[++i];
        } else if (arg === '--verbose') {
            args.options.verbose = true;
        } else if (arg === '--no-color') {
            args.options.color = false;
        } else if (arg === '--help') {
            return { help: true };
        } else if (!arg.startsWith('--')) {
            args.params.push(arg);
        } else {
            console.error(color(`Unknown option: ${arg}`, colors.red));
            return null;
        }

        i++;
    }

    return args;
}

function loadFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
        return JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
        // Simple YAML parser (for basic structures)
        // For production, use js-yaml library
        throw new Error('YAML support requires js-yaml library. Please use JSON files for now.');
    } else {
        throw new Error(`Unsupported file format: ${ext}`);
    }
}

function saveFile(filePath, data, format) {
    const ext = path.extname(filePath).toLowerCase();

    let content;
    if (ext === '.json' || format === 'json') {
        content = JSON.stringify(data, null, 2);
    } else if (ext === '.yaml' || ext === '.yml' || format === 'yaml') {
        throw new Error('YAML support requires js-yaml library. Please use JSON files for now.');
    } else {
        content = JSON.stringify(data, null, 2);
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

function formatOutput(data, format) {
    if (format === 'json') {
        return JSON.stringify(data, null, 2);
    } else if (format === 'yaml') {
        throw new Error('YAML support requires js-yaml library. Use json format.');
    } else if (format === 'pretty') {
        return formatPretty(data);
    } else {
        return JSON.stringify(data, null, 2);
    }
}

function formatPretty(data, indent = 0) {
    const spaces = '  '.repeat(indent);

    if (data === null) {
        return color('null', colors.dim);
    } else if (data === undefined) {
        return color('undefined', colors.dim);
    } else if (typeof data === 'boolean') {
        return color(String(data), colors.yellow);
    } else if (typeof data === 'number') {
        return color(String(data), colors.cyan);
    } else if (typeof data === 'string') {
        return color(`"${data}"`, colors.green);
    } else if (Array.isArray(data)) {
        if (data.length === 0) {
            return color('[]', colors.dim);
        }
        const items = data.map((item, i) => {
            return `${spaces}  ${color(`[${i}]`, colors.magenta)} ${formatPretty(item, indent + 1)}`;
        }).join('\n');
        return `${color('[', colors.dim)}\n${items}\n${spaces}${color(']', colors.dim)}`;
    } else if (typeof data === 'object') {
        const keys = Object.keys(data);
        if (keys.length === 0) {
            return color('{}', colors.dim);
        }
        const items = keys.map(key => {
            return `${spaces}  ${color(key, colors.blue)}: ${formatPretty(data[key], indent + 1)}`;
        }).join('\n');
        return `${color('{', colors.dim)}\n${items}\n${spaces}${color('}', colors.dim)}`;
    } else {
        return String(data);
    }
}

function printProgress(message) {
    console.error(color(`[*] ${message}`, colors.cyan));
}

function printSuccess(message) {
    console.error(color(`[✓] ${message}`, colors.green));
}

function printError(message) {
    console.error(color(`[✗] ${message}`, colors.red));
}

async function executeCommand(args) {
    const { port, operation, params, options } = args;

    // Disable color if requested
    useColor = options.color;

    // Create device manager and connect
    printProgress(`Connecting to device: ${port}`);
    const deviceManager = new DeviceManager();

    try {
        await deviceManager.connectDevice(port);
    } catch (error) {
        printError(`Failed to connect: ${error.message}`);
        process.exit(1);
    }

    const device = deviceManager.getDevice(port);
    printSuccess(`Connected to ${port}`);

    // Create CORECONF client
    printProgress('Initializing CORECONF client...');
    const client = new CORECONFClient(device);

    try {
        await client.initialize();
    } catch (error) {
        printError(`Failed to initialize: ${error.message}`);
        await deviceManager.disconnectDevice(port);
        process.exit(1);
    }

    const stats = client.getSchemaStats();
    printSuccess(`Initialized with ${stats.totalSIDs} SIDs`);

    if (options.verbose) {
        console.error(color(`Schema: ${stats.modules} modules, ${stats.totalSIDs} SIDs`, colors.dim));
    }

    // Execute operation
    let result;

    try {
        switch (operation) {
            case 'get': {
                if (params.length === 0) {
                    printError('GET requires a path parameter');
                    printUsage();
                    process.exit(1);
                }

                const path = params[0];
                const uri = `/c?d=${options.depth}&c=${options.content}`;

                printProgress(`GET ${path} (depth=${options.depth}, content=${options.content})`);
                result = await client.get(uri);
                printSuccess('GET completed');
                break;
            }

            case 'fetch': {
                if (params.length === 0) {
                    printError('FETCH requires at least one path parameter');
                    printUsage();
                    process.exit(1);
                }

                printProgress(`FETCH ${params.length} paths`);
                result = await client.fetch(params);
                printSuccess('FETCH completed');
                break;
            }

            case 'ipatch': {
                if (params.length === 0) {
                    printError('IPATCH requires a file parameter');
                    printUsage();
                    process.exit(1);
                }

                const filePath = params[0];
                printProgress(`Loading patches from: ${filePath}`);
                const patches = loadFile(filePath);

                printProgress(`IPATCH ${patches.length} patches`);
                await client.ipatch(patches);
                printSuccess('IPATCH completed');
                result = { status: 'success', patches: patches.length };
                break;
            }

            case 'put': {
                if (params.length === 0) {
                    printError('PUT requires a file parameter');
                    printUsage();
                    process.exit(1);
                }

                const filePath = params[0];
                printProgress(`Loading configuration from: ${filePath}`);
                const config = loadFile(filePath);

                printProgress('PUT configuration');
                await client.put(config);
                printSuccess('PUT completed');
                result = { status: 'success' };
                break;
            }

            case 'post': {
                if (params.length === 0) {
                    printError('POST requires an RPC path parameter');
                    printUsage();
                    process.exit(1);
                }

                const rpcPath = params[0];
                const rpcParams = params.length > 1 ? JSON.parse(params[1]) : null;

                printProgress(`POST ${rpcPath}`);
                result = await client.post([{ [rpcPath]: rpcParams }]);
                printSuccess('POST completed');
                break;
            }

            default:
                printError(`Unknown operation: ${operation}`);
                printUsage();
                process.exit(1);
        }

    } catch (error) {
        printError(`Operation failed: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }
        await deviceManager.disconnectDevice(port);
        process.exit(1);
    }

    // Disconnect
    await deviceManager.disconnectDevice(port);
    printSuccess('Disconnected');

    // Output result
    if (result !== undefined) {
        console.log(''); // Blank line before output

        if (options.output) {
            saveFile(options.output, result, options.format);
            printSuccess(`Output saved to: ${options.output}`);
        } else {
            const formatted = formatOutput(result, options.format);
            console.log(formatted);
        }
    }

    process.exit(0);
}

// Main
async function main() {
    if (process.argv.includes('--help') || process.argv.length < 3) {
        printUsage();
        process.exit(0);
    }

    const args = parseArgs(process.argv);

    if (!args) {
        printError('Invalid arguments');
        console.log('');
        printUsage();
        process.exit(1);
    }

    if (args.help) {
        printUsage();
        process.exit(0);
    }

    await executeCommand(args);
}

main().catch(error => {
    printError(`Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
