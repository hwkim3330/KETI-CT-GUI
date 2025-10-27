/**
 * SID Manager - YANG Schema Item iDentifier (RFC 9595)
 *
 * Based on official Microchip Ruby implementation:
 * - velocitydrivesp-support/support/scripts/mup1ct
 * - velocitydrivesp-support/support/scripts/mup1cc
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Well-known SID constants
 * Reference: ietf-constrained-yang-library (RFC 9254, Section 5.1)
 */
export const SID = {
    // ietf-constrained-yang-library:yang-library/checksum
    YANG_LIBRARY_CHECKSUM: 29304,

    // Common YANG modules (examples - actual values depend on .sid files)
    // These will be loaded from .sid files in production
};

/**
 * Encode SID as Base64 URL-safe string for URI paths
 *
 * Ruby reference (mup1ct lines 199-222):
 * ```ruby
 * def sid_encode sid
 *   base64_urlsafe = [
 *     'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
 *     'Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f',
 *     'g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v',
 *     'w','x','y','z','0','1','2','3','4','5','6','7','8','9','-','_']
 * ```
 *
 * @param {number} sid - Schema Item iDentifier
 * @returns {string} Base64 URL-safe encoded string
 */
export function sidEncode(sid) {
    const base64_urlsafe = [
        'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
        'Q','R','S','T','U','V','W','X','Y','Z','a','b','c','d','e','f',
        'g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v',
        'w','x','y','z','0','1','2','3','4','5','6','7','8','9','-','_'
    ];

    let buf = '';
    let save = false;

    // Process 6 bits at a time (64 possible values = 6 bits)
    // Start from bit 60 down to 0 (64-bit integer representation)
    for (let i = 60; i >= 0; i -= 6) {
        const n = (BigInt(sid) >> BigInt(i)) & 0x3Fn;

        if (n !== 0n) {
            save = true; // Start saving after first non-zero data
        }

        if (save) {
            buf += base64_urlsafe[Number(n)];
        }
    }

    return buf || 'A'; // Return 'A' for SID 0
}

/**
 * Decode Base64 URL-safe string back to SID
 *
 * @param {string} encoded - Base64 URL-safe encoded string
 * @returns {number} Schema Item iDentifier
 */
export function sidDecode(encoded) {
    const base64_urlsafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    let sid = 0n;

    for (let i = 0; i < encoded.length; i++) {
        const char = encoded[i];
        const value = base64_urlsafe.indexOf(char);

        if (value === -1) {
            throw new Error(`Invalid character in encoded SID: ${char}`);
        }

        sid = (sid << 6n) | BigInt(value);
    }

    return Number(sid);
}

/**
 * SID Schema Manager
 * Handles loading and mapping of .sid files
 */
export class SIDSchema {
    constructor() {
        this.sidToPath = new Map();  // SID -> YANG path
        this.pathToSid = new Map();  // YANG path -> SID
        this.modules = new Map();    // module name -> module info
    }

    /**
     * Load .sid file (JSON format)
     *
     * .sid file format:
     * {
     *   "assignment-ranges": [{ "entry-point": 20000, "size": 25 }],
     *   "module-name": "toaster",
     *   "module-revision": "2009-11-20",
     *   "items": [
     *     {
     *       "namespace": "module|identity|data",
     *       "identifier": "/toaster:toaster/...",
     *       "status": "stable|unstable",
     *       "sid": 20014
     *     },
     *     ...
     *   ]
     * }
     *
     * @param {string} sidFilePath - Path to .sid JSON file
     */
    loadSIDFile(sidFilePath) {
        try {
            const content = readFileSync(sidFilePath, 'utf8');
            const sidData = JSON.parse(content);

            const moduleName = sidData['module-name'];
            const moduleRevision = sidData['module-revision'];

            this.modules.set(moduleName, {
                name: moduleName,
                revision: moduleRevision,
                assignmentRanges: sidData['assignment-ranges'] || []
            });

            // Process each item
            for (const item of sidData.items || []) {
                const sid = item.sid;
                const path = item.identifier;
                const namespace = item.namespace;
                const status = item.status;

                this.sidToPath.set(sid, {
                    path,
                    namespace,
                    status,
                    module: moduleName
                });

                this.pathToSid.set(path, {
                    sid,
                    namespace,
                    status,
                    module: moduleName
                });
            }

            console.log(`[SIDSchema] Loaded ${sidData.items?.length || 0} items from ${moduleName}@${moduleRevision}`);

        } catch (error) {
            throw new Error(`Failed to load SID file ${sidFilePath}: ${error.message}`);
        }
    }

    /**
     * Get YANG path from SID
     * @param {number} sid
     * @returns {string|null}
     */
    getPath(sid) {
        return this.sidToPath.get(sid)?.path || null;
    }

    /**
     * Get SID from YANG path
     * @param {string} path
     * @returns {number|null}
     */
    getSID(path) {
        return this.pathToSid.get(path)?.sid || null;
    }

    /**
     * Get full info for SID
     * @param {number} sid
     * @returns {object|null}
     */
    getSIDInfo(sid) {
        return this.sidToPath.get(sid) || null;
    }

    /**
     * Get full info for path
     * @param {string} path
     * @returns {object|null}
     */
    getPathInfo(path) {
        return this.pathToSid.get(path) || null;
    }

    /**
     * Get all loaded modules
     * @returns {Array}
     */
    getModules() {
        return Array.from(this.modules.values());
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        return {
            totalSIDs: this.sidToPath.size,
            totalPaths: this.pathToSid.size,
            modules: this.modules.size,
            modulesList: Array.from(this.modules.keys())
        };
    }
}

export default SIDSchema;
