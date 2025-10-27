/**
 * YANG Data Converter
 *
 * Convert between RFC 7951 (JSON) and RFC 9254 (CBOR)
 * Based on velocitydrivesp-support/support/yang-enc/yang-enc.rb
 *
 * References:
 * - RFC 7951: JSON Encoding of YANG Data
 * - RFC 9254: CBOR Encoding of YANG Data (CORECONF)
 */

import { encode, decode } from 'cbor-x';

/**
 * Content-Format constants (CoAP)
 * Ruby reference: mup1ct lines 239-241
 */
export const ContentFormat = {
    YANG_DATA_CBOR: 140,         // application/yang-data+cbor
    YANG_IDENTIFIERS_CBOR: 141,  // application/yang-identifiers+cbor
    YANG_INSTANCES_CBOR: 142,    // application/yang-instances+cbor
};

/**
 * YANGConverter class
 * Handles conversion between JSON (RFC 7951) and CBOR (RFC 9254)
 */
export class YANGConverter {
    constructor(schema) {
        this.schema = schema; // SIDSchema instance
    }

    /**
     * Convert JSON to CBOR based on content format
     *
     * Ruby reference: yang-enc.rb lines 512-539 (json_seq2cbor)
     *
     * @param {object|array} json - JSON data
     * @param {string} contentFormat - 'yang', 'fetch', 'ipatch', 'get', 'put', 'post'
     * @returns {Buffer} - CBOR-encoded binary data
     */
    json2cbor(json, contentFormat = 'yang') {
        const buffers = [];

        switch (contentFormat) {
            case 'fetch':
                // FETCH: Array of instance identifiers or {path: value} pairs
                if (!Array.isArray(json)) {
                    throw new Error('FETCH content must be an Array');
                }
                for (const item of json) {
                    if (typeof item === 'object' && !Array.isArray(item)) {
                        // {path: value} format
                        buffers.push(encode(this._instance2cbor(item, contentFormat)));
                    } else {
                        // Simple instance identifier (path string)
                        const sid = this._path2sid(item);
                        buffers.push(encode(sid));
                    }
                }
                break;

            case 'ipatch':
            case 'post':
                // IPATCH/POST: Array of {path: value} pairs
                if (!Array.isArray(json)) {
                    throw new Error(`${contentFormat.toUpperCase()} content must be an Array`);
                }
                for (const item of json) {
                    buffers.push(encode(this._instance2cbor(item, contentFormat)));
                }
                break;

            case 'yang':
            case 'get':
            case 'put':
                // YANG/GET/PUT: Single YANG data tree
                if (typeof json !== 'object' || Array.isArray(json)) {
                    throw new Error('YANG content must be a Hash/Object');
                }
                buffers.push(encode(this._json2cborData(json, contentFormat)));
                break;

            default:
                throw new Error(`Invalid content format: ${contentFormat}`);
        }

        return Buffer.concat(buffers);
    }

    /**
     * Convert CBOR to JSON based on content format
     *
     * Ruby reference: yang-enc.rb lines 790-819 (cbor_seq2json)
     *
     * @param {Buffer} cborData - CBOR binary data
     * @param {string} contentFormat - 'yang', 'fetch', 'ipatch', 'get', 'put', 'post'
     * @returns {object|array} - JSON data
     */
    cbor2json(cborData, contentFormat = 'yang') {
        // Decode CBOR sequence (may contain multiple CBOR items)
        const cborArray = this._decodeCBORSequence(cborData);

        switch (contentFormat) {
            case 'fetch':
                // FETCH: Array of instance identifiers or {path: value} pairs
                return cborArray.map(item => {
                    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                        // {SID: value} format (FETCH response)
                        return this._instance2json(item, contentFormat);
                    } else {
                        // SID (FETCH request)
                        return this._sid2path(item);
                    }
                });

            case 'ipatch':
            case 'post':
                // IPATCH/POST: Array of {path: value} pairs
                return cborArray.map(item => this._instance2json(item, contentFormat));

            case 'yang':
            case 'get':
            case 'put':
                // YANG/GET/PUT: Single YANG data tree
                if (cborArray.length !== 1) {
                    throw new Error('YANG content does not support CBOR sequences');
                }
                return this._cbor2jsonData(cborArray[0], contentFormat);

            default:
                throw new Error(`Invalid content format: ${contentFormat}`);
        }
    }

    /**
     * Convert YANG instance {path: value} to CBOR {SID: value}
     * Ruby reference: yang-enc.rb lines 498-509 (instance2cbor)
     * @private
     */
    _instance2cbor(instance, contentFormat) {
        if (typeof instance !== 'object' || Object.keys(instance).length !== 1) {
            throw new Error('YANG instance must be a single-entry object');
        }

        const [path, value] = Object.entries(instance)[0];
        const sid = this._path2sid(path);

        // For now, simple SID → value mapping
        // TODO: Implement delta SID calculation and nested conversion
        return { [sid]: value };
    }

    /**
     * Convert CBOR instance {SID: value} to JSON {path: value}
     * Ruby reference: yang-enc.rb lines 769-786 (instance2json)
     * @private
     */
    _instance2json(cborInstance, contentFormat) {
        if (typeof cborInstance !== 'object' || Object.keys(cborInstance).length !== 1) {
            throw new Error('CBOR instance must be a single-entry object');
        }

        const [sidStr, value] = Object.entries(cborInstance)[0];
        const sid = parseInt(sidStr);
        const path = this._sid2path(sid);

        return { [path]: value };
    }

    /**
     * Convert JSON data tree to CBOR (recursive)
     * Ruby reference: yang-enc.rb lines 207-268 (json2cbor)
     * @private
     */
    _json2cborData(json, contentFormat) {
        // Simplified implementation
        // TODO: Implement full recursive conversion with delta SIDs
        const result = {};

        for (const [key, value] of Object.entries(json)) {
            // Find SID for this key
            const sidInfo = this.schema.pathToSid.get(`/${key}`);
            if (sidInfo) {
                result[sidInfo.sid] = value;
            } else {
                console.warn(`[YANGConverter] No SID found for path: /${key}`);
            }
        }

        return result;
    }

    /**
     * Convert CBOR data tree to JSON (recursive)
     * Ruby reference: yang-enc.rb lines 669-764 (cbor2json)
     * @private
     */
    _cbor2jsonData(cbor, contentFormat) {
        // Simplified implementation
        // TODO: Implement full recursive conversion
        const result = {};

        for (const [sidStr, value] of Object.entries(cbor)) {
            const sid = parseInt(sidStr);
            const sidInfo = this.schema.sidToPath.get(sid);
            if (sidInfo) {
                // Extract just the leaf name from full path
                const pathParts = sidInfo.path.split('/');
                const leafName = pathParts[pathParts.length - 1];
                result[leafName] = value;
            } else {
                console.warn(`[YANGConverter] No path found for SID: ${sid}`);
            }
        }

        return result;
    }

    /**
     * Convert YANG path to SID
     * Ruby reference: yang-enc.rb lines 455-475 (iid2cbor)
     *
     * @param {string} path - YANG instance identifier
     * @returns {number|array} - SID or [SID, ...keys]
     */
    _path2sid(path) {
        // Simple implementation: lookup path directly
        const sidInfo = this.schema.pathToSid.get(path);
        if (sidInfo) {
            return sidInfo.sid;
        }

        // TODO: Implement instance identifier parsing with keys
        // E.g., "/interface[name='eth0']" → [SID, "eth0"]

        throw new Error(`No SID found for path: ${path}`);
    }

    /**
     * Convert SID to YANG path
     * Ruby reference: yang-enc.rb lines 942-961 (iid2json)
     *
     * @param {number|array} sid - SID or [SID, ...keys]
     * @returns {string} - YANG instance identifier
     */
    _sid2path(sid) {
        // Handle array format: [SID, key1, key2, ...]
        if (Array.isArray(sid)) {
            const actualSid = sid[0];
            const keys = sid.slice(1);

            const sidInfo = this.schema.sidToPath.get(actualSid);
            if (!sidInfo) {
                throw new Error(`No path found for SID: ${actualSid}`);
            }

            // TODO: Reconstruct path with keys
            // For now, just return the path without keys
            return sidInfo.path;
        }

        // Simple SID
        const sidInfo = this.schema.sidToPath.get(sid);
        if (sidInfo) {
            return sidInfo.path;
        }

        throw new Error(`No path found for SID: ${sid}`);
    }

    /**
     * Decode CBOR sequence (may contain multiple CBOR items)
     * @private
     */
    _decodeCBORSequence(buffer) {
        const items = [];
        let offset = 0;

        while (offset < buffer.length) {
            try {
                // Try to decode one CBOR item
                const item = decode(buffer.slice(offset));
                items.push(item);

                // Calculate size of encoded item to advance offset
                const encoded = encode(item);
                offset += encoded.length;
            } catch (error) {
                // If decoding fails, we've reached the end
                break;
            }
        }

        return items;
    }
}

/**
 * Helper function: Create converter with schema
 *
 * @param {SIDSchema} schema - Loaded YANG schema
 * @returns {YANGConverter}
 */
export function createConverter(schema) {
    return new YANGConverter(schema);
}

export default YANGConverter;
