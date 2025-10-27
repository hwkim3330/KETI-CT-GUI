/**
 * YANG Schema Manager
 *
 * Manages YANG schemas for CORECONF devices
 * Based on official Microchip Ruby implementation (mup1cc)
 *
 * References:
 * - RFC 9254: CORECONF (YANG-CBOR)
 * - RFC 9595: YANG Schema Item iDentifier (SID)
 * - velocitydrivesp-support/support/scripts/mup1cc
 */

import { encode, decode } from 'cbor-x';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';
import { SID, SIDSchema } from './sid-manager.js';

/**
 * Remote YANG catalog locations
 * Ruby reference: mup1cc lines 92-95
 */
const REMOTE_CATALOGS = [
    'http://mscc-ent-open-source.s3-website-eu-west-1.amazonaws.com/public_root/velocitydrivesp/yang-by-sha',
    'https://artifacts.microchip.com/artifactory/UNGE-generic-local/lmstax/yang-by-sha'
];

/**
 * Local schema cache directory
 * Ruby reference: mup1cc line 107
 */
const LOCAL_SCHEMA_BASE_DIR = join(homedir(), '.velocitydrive-yang-cache');

/**
 * Schema file name
 * Ruby reference: mup1cc line 108
 */
const SCHEMA_FILE = 'yang_schema.json';

/**
 * YANGSchemaManager class
 * Manages YANG schema download, caching, and loading
 */
export class YANGSchemaManager {
    constructor() {
        this.schemaCache = new Map(); // checksum -> schema
        this.ensureCacheDir();
    }

    /**
     * Ensure cache directory exists
     */
    ensureCacheDir() {
        if (!existsSync(LOCAL_SCHEMA_BASE_DIR)) {
            mkdirSync(LOCAL_SCHEMA_BASE_DIR, { recursive: true });
            console.log(`[YANGSchemaManager] Created cache directory: ${LOCAL_SCHEMA_BASE_DIR}`);
        }
    }

    /**
     * Fetch YANG library checksum from device
     *
     * Ruby reference: mup1cc lines 81-89
     * ```ruby
     * def fetch_yang_lib_checksum_from_dut(coap)
     *     sid = CBOR::encode(SID_CHECKSUM)
     *     res = coap.fetch "/c", sid, {:content_type => 141}
     *     raise "Unable to get YANG checksum" if res&.code_class != 2 or res&.code_detail != 5
     *     cbor = CBOR::decode(res.payload_rx)
     *     checksum = cbor.values[0].b.each_byte.map { |b| "%02x" % b }.join
     *     return checksum
     * end
     * ```
     *
     * @param {object} coapClient - CoAP client instance
     * @returns {Promise<string>} - Checksum as hex string
     */
    async fetchYANGLibChecksumFromDevice(coapClient) {
        try {
            console.log('[YANGSchemaManager] Fetching YANG library checksum from device...');

            // Encode SID 29304 (ietf-constrained-yang-library:yang-library/checksum) as CBOR
            const sid = SID.YANG_LIBRARY_CHECKSUM; // 29304
            const cborPayload = encode([sid]); // Array of SIDs for FETCH

            // Execute FETCH request
            // Content-Type: 141 = application/yang-identifiers+cbor (SID array)
            // Expected response Content-Type: 140 = application/yang-data+cbor
            const result = await coapClient.executeCoAP('FETCH', '/c', cborPayload, {
                content_type: 141, // APPL_YANG_IDENTIFIERS_CBOR
                accept: 140         // APPL_YANG_DATA_CBOR
            });

            if (result.codeClass !== 2 || result.codeDetail !== 5) {
                throw new Error(`Unexpected response code: ${result.codeClass}.${result.codeDetail}`);
            }

            if (!result.payload) {
                throw new Error('No payload in FETCH response');
            }

            // Decode CBOR response
            // Response format: Map { 29304 => binary_checksum }
            const cborResponse = decode(result.payload);
            console.log('[YANGSchemaManager] CBOR response:', cborResponse);

            // Extract checksum (16 bytes binary → 32 hex chars)
            let checksum;
            if (cborResponse instanceof Map) {
                const checksumBinary = cborResponse.get(sid);
                if (!checksumBinary) {
                    throw new Error('Checksum not found in response');
                }
                checksum = Buffer.from(checksumBinary).toString('hex');
            } else if (typeof cborResponse === 'object' && cborResponse[sid]) {
                checksum = Buffer.from(cborResponse[sid]).toString('hex');
            } else {
                throw new Error('Unexpected CBOR response format');
            }

            console.log(`[YANGSchemaManager] YANG library checksum: ${checksum}`);
            return checksum;

        } catch (error) {
            throw new Error(`Failed to fetch YANG checksum: ${error.message}`);
        }
    }

    /**
     * Download remote catalog file
     *
     * Ruby reference: mup1cc lines 98-105
     *
     * @param {string} checksum - YANG library checksum
     * @param {string} targetPath - Local file path to save
     * @returns {Promise<boolean>} - Success status
     */
    async downloadRemoteCatalog(checksum, targetPath) {
        for (const catalogUrl of REMOTE_CATALOGS) {
            const url = `${catalogUrl}/${checksum}.tar.gz`;

            try {
                console.log(`[YANGSchemaManager] Trying: ${url}`);

                await this._downloadFile(url, targetPath);

                console.log(`[YANGSchemaManager] ✓ Downloaded from: ${catalogUrl}`);
                return true;

            } catch (error) {
                console.log(`[YANGSchemaManager] ✗ Failed: ${error.message}`);
                continue;
            }
        }

        throw new Error(`Remote catalog not found for checksum: ${checksum}`);
    }

    /**
     * Download file from URL
     * @private
     */
    _downloadFile(url, targetPath) {
        return new Promise((resolve, reject) => {
            const get = url.startsWith('https') ? httpsGet : httpGet;

            const request = get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    const redirectUrl = response.headers.location;
                    console.log(`[YANGSchemaManager] Redirecting to: ${redirectUrl}`);
                    this._downloadFile(redirectUrl, targetPath).then(resolve).catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const fileStream = createWriteStream(targetPath);
                pipeline(response, fileStream)
                    .then(() => resolve())
                    .catch((error) => reject(error));
            });

            request.on('error', (error) => reject(error));
            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * Get YANG schema for given checksum
     *
     * Ruby reference: mup1cc lines 111-142
     *
     * @param {string} checksum - YANG library checksum (hex string)
     * @param {boolean} useCache - Whether to use cached schema (default: true)
     * @returns {Promise<SIDSchema>} - Loaded YANG schema
     */
    async getYANGSchema(checksum, useCache = true) {
        // Check memory cache
        if (useCache && this.schemaCache.has(checksum)) {
            console.log(`[YANGSchemaManager] Using cached schema for ${checksum}`);
            return this.schemaCache.get(checksum);
        }

        const schemaDir = join(LOCAL_SCHEMA_BASE_DIR, checksum);
        const schemaFile = join(schemaDir, SCHEMA_FILE);

        // Check disk cache
        if (useCache && existsSync(schemaFile)) {
            console.log(`[YANGSchemaManager] Loading schema from disk: ${schemaFile}`);
            try {
                const schemaData = JSON.parse(readFileSync(schemaFile, 'utf8'));
                const schema = this._deserializeSchema(schemaData);
                this.schemaCache.set(checksum, schema);
                return schema;
            } catch (error) {
                console.warn(`[YANGSchemaManager] Failed to load cached schema: ${error.message}`);
                // Continue to download
            }
        }

        // Download and build schema
        console.log(`[YANGSchemaManager] Schema not cached, downloading catalog...`);

        if (!existsSync(schemaDir)) {
            mkdirSync(schemaDir, { recursive: true });
        }

        const tmpDir = join(schemaDir, 'tmp');
        if (!existsSync(tmpDir)) {
            mkdirSync(tmpDir, { recursive: true });
        }

        const catalogFile = join(tmpDir, `${checksum}.tar.gz`);

        // Download catalog
        await this.downloadRemoteCatalog(checksum, catalogFile);

        // Extract catalog
        const { execSync } = await import('child_process');
        console.log(`[YANGSchemaManager] Extracting catalog...`);
        execSync(`tar -zxf ${catalogFile} -C ${tmpDir}`);

        // Find .sid files
        const sidFiles = readdirSync(tmpDir).filter(f => f.endsWith('.sid'));
        console.log(`[YANGSchemaManager] Found ${sidFiles.length} .sid files`);

        // Build schema from .sid files
        const schema = new SIDSchema();
        for (const sidFile of sidFiles) {
            const sidPath = join(tmpDir, sidFile);
            schema.loadSIDFile(sidPath);
        }

        // Save schema to disk
        const schemaData = this._serializeSchema(schema);
        writeFileSync(schemaFile, JSON.stringify(schemaData, null, 2));
        console.log(`[YANGSchemaManager] Saved schema to: ${schemaFile}`);

        // Cache in memory
        this.schemaCache.set(checksum, schema);

        return schema;
    }

    /**
     * Serialize SIDSchema for JSON storage
     * @private
     */
    _serializeSchema(schema) {
        return {
            sidToPath: Array.from(schema.sidToPath.entries()),
            pathToSid: Array.from(schema.pathToSid.entries()),
            modules: Array.from(schema.modules.entries())
        };
    }

    /**
     * Deserialize SIDSchema from JSON
     * @private
     */
    _deserializeSchema(data) {
        const schema = new SIDSchema();
        schema.sidToPath = new Map(data.sidToPath);
        schema.pathToSid = new Map(data.pathToSid);
        schema.modules = new Map(data.modules);
        return schema;
    }

    /**
     * Clear local cache for specific checksum
     * @param {string} checksum - Checksum to clear
     */
    async clearCache(checksum) {
        this.schemaCache.delete(checksum);
        const schemaDir = join(LOCAL_SCHEMA_BASE_DIR, checksum);
        if (existsSync(schemaDir)) {
            const { rmSync } = await import('fs');
            rmSync(schemaDir, { recursive: true, force: true });
            console.log(`[YANGSchemaManager] Cleared cache for ${checksum}`);
        }
    }

    /**
     * Get cache statistics
     * @returns {object}
     */
    getCacheStats() {
        const memoryCached = this.schemaCache.size;
        let diskCached = 0;

        if (existsSync(LOCAL_SCHEMA_BASE_DIR)) {
            const entries = readdirSync(LOCAL_SCHEMA_BASE_DIR);
            diskCached = entries.filter(e => {
                const schemaFile = join(LOCAL_SCHEMA_BASE_DIR, e, SCHEMA_FILE);
                return existsSync(schemaFile);
            }).length;
        }

        return {
            memoryCached,
            diskCached,
            cacheDir: LOCAL_SCHEMA_BASE_DIR
        };
    }
}

export default YANGSchemaManager;
