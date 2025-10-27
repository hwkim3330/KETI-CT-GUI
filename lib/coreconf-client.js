/**
 * CORECONF Client
 *
 * High-level client for CORECONF (RFC 9254) operations
 * Integrates CoAP Client + YANG Converter + SID Manager
 *
 * Provides easy-to-use methods for:
 * - FETCH: Query specific data nodes
 * - IPATCH: Modify configuration
 * - GET: Retrieve full configuration
 * - PUT: Replace configuration
 */

import { YANGConverter, ContentFormat } from './yang-converter.js';
import { YANGSchemaManager } from './yang-schema-manager.js';

/**
 * CORECONFClient class
 * High-level wrapper around CoAP + YANG conversion
 */
export class CORECONFClient {
    constructor(deviceConnection) {
        this.device = deviceConnection;
        this.schemaManager = new YANGSchemaManager();
        this.schema = null;
        this.converter = null;
    }

    /**
     * Initialize: Fetch YANG schema from device
     * Must be called before using other methods
     */
    async initialize() {
        console.log('[CORECONFClient] Initializing...');

        // Fetch YANG library checksum from device
        const checksum = await this.schemaManager.fetchYANGLibChecksumFromDevice(this.device);

        // Load YANG schema (from cache or download)
        this.schema = await this.schemaManager.getYANGSchema(checksum);

        // Create converter
        this.converter = new YANGConverter(this.schema);

        console.log('[CORECONFClient] Initialized with schema:', checksum);
        console.log(`[CORECONFClient] Schema contains ${this.schema.sidToPath.size} SIDs`);
    }

    /**
     * FETCH: Query specific data nodes
     *
     * @param {Array<string>} paths - YANG paths to fetch
     * @returns {Promise<Array>} - Array of {path: value} objects
     *
     * Example:
     *   await client.fetch(['/ietf-interfaces:interfaces', '/ietf-system:system/hostname'])
     *   Returns: [{'/ietf-interfaces:interfaces': {...}}, {'/ietf-system:system/hostname': 'my-host'}]
     */
    async fetch(paths) {
        if (!this.converter) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        console.log(`[CORECONFClient] FETCH: ${paths.length} paths`);

        // Convert JSON paths to CBOR SIDs
        const cborPayload = this.converter.json2cbor(paths, 'fetch');

        // Execute CoAP FETCH
        const result = await this.device.executeCoAP('FETCH', '/c', cborPayload, {
            content_type: ContentFormat.YANG_IDENTIFIERS_CBOR,
            accept: ContentFormat.YANG_DATA_CBOR
        });

        if (result.codeClass !== 2) {
            throw new Error(`FETCH failed: ${result.codeClass}.${result.codeDetail}`);
        }

        // Convert CBOR response to JSON
        const jsonResponse = this.converter.cbor2json(result.payload, 'fetch');

        console.log(`[CORECONFClient] FETCH: Got ${jsonResponse.length} results`);

        return jsonResponse;
    }

    /**
     * IPATCH: Modify configuration (RFC 8132)
     *
     * @param {Array<object>} patches - Array of {path: value} objects
     * @returns {Promise<void>}
     *
     * Example:
     *   await client.ipatch([
     *       {'/ietf-interfaces:interfaces/interface[name="eth0"]/enabled': true},
     *       {'/ietf-system:system/hostname': 'new-hostname'}
     *   ])
     */
    async ipatch(patches) {
        if (!this.converter) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        console.log(`[CORECONFClient] IPATCH: ${patches.length} patches`);

        // Convert JSON patches to CBOR
        const cborPayload = this.converter.json2cbor(patches, 'ipatch');

        // Execute CoAP IPATCH
        const result = await this.device.executeCoAP('IPATCH', '/c', cborPayload, {
            content_type: ContentFormat.YANG_INSTANCES_CBOR
        });

        if (result.codeClass !== 2) {
            // If there's an error payload, decode it
            if (result.payload) {
                const errorData = this.converter.cbor2json(result.payload, 'yang');
                throw new Error(`IPATCH failed: ${result.codeClass}.${result.codeDetail}, ${JSON.stringify(errorData)}`);
            }
            throw new Error(`IPATCH failed: ${result.codeClass}.${result.codeDetail}`);
        }

        console.log(`[CORECONFClient] IPATCH: Success`);
    }

    /**
     * GET: Retrieve full configuration
     *
     * @param {string} uri - URI with optional query params
     *                       Examples: '/c', '/c?d=a', '/c?d=t', '/c?c=n'
     * @returns {Promise<object>} - Complete YANG data tree
     *
     * Query parameters (RFC 9254):
     * - d=a: depth=all (include all descendants)
     * - d=t: depth=1 (include immediate children only)
     * - c=n: content=nonconfig (only non-config data)
     * - c=a: content=all (both config and non-config)
     * - c=c: content=config (only config data)
     */
    async get(uri = '/c?d=a') {
        if (!this.converter) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        console.log(`[CORECONFClient] GET: ${uri}`);

        // Execute CoAP GET
        const result = await this.device.executeCoAP('GET', uri, null, {
            accept: ContentFormat.YANG_DATA_CBOR
        });

        if (result.codeClass !== 2) {
            throw new Error(`GET failed: ${result.codeClass}.${result.codeDetail}`);
        }

        // Convert CBOR response to JSON
        const jsonResponse = this.converter.cbor2json(result.payload, 'yang');

        console.log(`[CORECONFClient] GET: Success`);

        return jsonResponse;
    }

    /**
     * PUT: Replace entire configuration
     *
     * @param {object} data - Complete YANG data tree
     * @returns {Promise<void>}
     *
     * Example:
     *   await client.put({
     *       'ietf-interfaces:interfaces': {
     *           'interface': [...]
     *       }
     *   })
     */
    async put(data) {
        if (!this.converter) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        console.log(`[CORECONFClient] PUT: Replacing configuration`);

        // Convert JSON data to CBOR
        const cborPayload = this.converter.json2cbor(data, 'put');

        // Execute CoAP PUT
        const result = await this.device.executeCoAP('PUT', '/c', cborPayload, {
            content_type: ContentFormat.YANG_DATA_CBOR
        });

        if (result.codeClass !== 2) {
            throw new Error(`PUT failed: ${result.codeClass}.${result.codeDetail}`);
        }

        console.log(`[CORECONFClient] PUT: Success`);
    }

    /**
     * POST: Execute RPC or action
     *
     * @param {Array<object>} rpcCalls - Array of {path: parameters} objects
     * @returns {Promise<Array>} - Array of RPC results
     *
     * Example:
     *   await client.post([
     *       {'/ietf-system:system-restart': null}
     *   ])
     */
    async post(rpcCalls) {
        if (!this.converter) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        console.log(`[CORECONFClient] POST: ${rpcCalls.length} RPC calls`);

        // Convert JSON RPC calls to CBOR
        const cborPayload = this.converter.json2cbor(rpcCalls, 'post');

        // Execute CoAP POST
        const result = await this.device.executeCoAP('POST', '/c', cborPayload, {
            content_type: ContentFormat.YANG_INSTANCES_CBOR
        });

        if (result.codeClass !== 2) {
            throw new Error(`POST failed: ${result.codeClass}.${result.codeDetail}`);
        }

        // Convert CBOR response to JSON (may be empty)
        if (result.payload && result.payload.length > 0) {
            const jsonResponse = this.converter.cbor2json(result.payload, 'post');
            console.log(`[CORECONFClient] POST: Got ${jsonResponse.length} results`);
            return jsonResponse;
        }

        console.log(`[CORECONFClient] POST: Success (no response data)`);
        return [];
    }

    /**
     * Get schema statistics
     */
    getSchemaStats() {
        if (!this.schema) {
            return null;
        }
        return this.schema.getStats();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.schemaManager.getCacheStats();
    }
}

export default CORECONFClient;
