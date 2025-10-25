/**
 * CoAP Frame Implementation
 *
 * Based on official Ruby implementation from Microchip
 * Reference: velocitydrivesp-support/support/libeasy/frame/coap.rb
 * RFC 7252: The Constrained Application Protocol (CoAP)
 */

export class CoAPFrame {
    // CoAP Types
    static TYPE_CONFIRMABLE = 0;
    static TYPE_NON_CONFIRMABLE = 1;
    static TYPE_ACK = 2;
    static TYPE_RESET = 3;

    // CoAP Code Classes
    static COAP_CLASS_REQ = 0;
    static COAP_CLASS_RES_SUCCESS = 2;
    static COAP_CLASS_RES_CLIENT_ERROR = 4;
    static COAP_CLASS_RES_SERVER_ERROR = 5;

    // CoAP Method Codes
    static CODE_PING = 0;
    static CODE_GET = 1;
    static CODE_POST = 2;
    static CODE_PUT = 3;
    static CODE_DEL = 4;
    static CODE_FETCH = 5;
    static CODE_IPATCH = 7;

    // Content-Format Values
    static CT_UNSPECIFIED = -1;
    static CT_TEXT_PLAIN = 0;
    static CT_APPL_LINK = 40;
    static CT_APPL_XML = 41;
    static CT_APPL_JSON = 50;
    static CT_APPL_CBOR = 60;
    static CT_APPL_YANG_DATA_CBOR = 140;
    static CT_APPL_YANG_IDENTIFIERS_CBOR = 141;
    static CT_APPL_YANG_INSTANCES_CBOR = 142;

    // CoAP Options
    static OPT_IF_MATCH = 1;
    static OPT_URI_HOST = 3;
    static OPT_ETAG = 4;
    static OPT_IF_NONE_MATCH = 5;
    static OPT_URI_PORT = 7;
    static OPT_LOCATION_PATH = 8;
    static OPT_URI_PATH = 11;
    static OPT_CONTENT_FORMAT = 12;
    static OPT_MAX_AGE = 14;
    static OPT_URI_QUERY = 15;
    static OPT_ACCEPT = 17;
    static OPT_LOCATION_QUERY = 20;
    static OPT_BLOCK2 = 23;
    static OPT_BLOCK1 = 27;
    static OPT_PROXY_URI = 35;
    static OPT_PROXY_SCHEME = 39;
    static OPT_SIZE1 = 60;

    constructor(data = null) {
        // Frame properties
        this.type = CoAPFrame.TYPE_CONFIRMABLE;
        this.codeClass = 0;
        this.codeDetail = 0;
        this.msgid = 0;
        this.token = null;

        // Options
        this.uriPaths = [];
        this.uriKeys = [];
        this.contentType = null;
        this.accept = null;

        // Block1 (request fragmentation)
        this.block1BlockSize = null;
        this.block1More = null;
        this.block1Num = null;

        // Block2 (response fragmentation)
        this.block2BlockSize = null;
        this.block2More = null;
        this.block2Num = null;

        // Payload
        this.payload = null;

        // Parse error
        this.parseError = null;

        if (data) {
            this.decode(data);
        }
    }

    /**
     * Decode CoAP frame from buffer
     */
    decode(data) {
        if (data.length < 4) {
            this.parseError = 'Frame too short';
            return;
        }

        // Header: Ver(2) | Type(2) | TKL(4) | Code(8) | MessageID(16)
        const version = (data[0] >> 6) & 0x03;
        if (version !== 1) {
            this.parseError = `Unexpected version: ${version}`;
            return;
        }

        this.type = (data[0] >> 4) & 0x03;
        const tokenLength = data[0] & 0x0F;

        this.codeClass = (data[1] >> 5) & 0x07;
        this.codeDetail = data[1] & 0x1F;

        this.msgid = (data[2] << 8) | data[3];

        let offset = 4;

        // Token
        if (tokenLength > 0) {
            if (data.length < offset + tokenLength) {
                this.parseError = 'Token not present in data';
                return;
            }
            this.token = data.slice(offset, offset + tokenLength);
            offset += tokenLength;
        }

        // Options
        let optNumber = 0;
        while (offset < data.length && data[offset] !== 0xFF) {
            const optHeader = data[offset];
            offset++;

            let optDelta = (optHeader >> 4) & 0x0F;
            let optLength = optHeader & 0x0F;

            // Extended delta
            if (optDelta === 13) {
                if (offset >= data.length) {
                    this.parseError = 'Underflow in option delta';
                    return;
                }
                optDelta = data[offset] + 13;
                offset++;
            } else if (optDelta === 14) {
                if (offset + 1 >= data.length) {
                    this.parseError = 'Underflow in option delta';
                    return;
                }
                optDelta = ((data[offset] << 8) | data[offset + 1]) + 269;
                offset += 2;
            } else if (optDelta === 15) {
                this.parseError = 'Reserved option delta';
                return;
            }

            // Extended length
            if (optLength === 13) {
                if (offset >= data.length) {
                    this.parseError = 'Underflow in option length';
                    return;
                }
                optLength = data[offset] + 13;
                offset++;
            } else if (optLength === 14) {
                if (offset + 1 >= data.length) {
                    this.parseError = 'Underflow in option length';
                    return;
                }
                optLength = ((data[offset] << 8) | data[offset + 1]) + 269;
                offset += 2;
            } else if (optLength === 15) {
                this.parseError = 'Reserved option length';
                return;
            }

            if (offset + optLength > data.length) {
                this.parseError = 'Underflow option value';
                return;
            }

            optNumber += optDelta;
            const optValue = data.slice(offset, offset + optLength);
            offset += optLength;

            // Parse specific options
            switch (optNumber) {
                case CoAPFrame.OPT_URI_PATH:
                    this.uriPaths.push(optValue.toString('utf8'));
                    break;
                case CoAPFrame.OPT_CONTENT_FORMAT:
                    this.contentType = this.decodeUint(optValue);
                    break;
                case CoAPFrame.OPT_URI_QUERY:
                    this.uriKeys.push(optValue.toString('utf8'));
                    break;
                case CoAPFrame.OPT_ACCEPT:
                    this.accept = this.decodeUint(optValue);
                    break;
                case CoAPFrame.OPT_BLOCK1:
                    [this.block1Num, this.block1More, this.block1BlockSize] = this.decodeBlock(optValue);
                    break;
                case CoAPFrame.OPT_BLOCK2:
                    [this.block2Num, this.block2More, this.block2BlockSize] = this.decodeBlock(optValue);
                    break;
            }
        }

        // Payload
        if (offset < data.length) {
            if (data[offset] !== 0xFF) {
                this.parseError = `Unexpected delimiter ${data[offset]}`;
                return;
            }
            offset++;
            if (offset < data.length) {
                this.payload = data.slice(offset);
            }
        }
    }

    /**
     * Encode CoAP frame to buffer
     */
    encode() {
        const parts = [];

        // Header
        const tokenLen = this.token ? this.token.length : 0;
        const byte0 = (1 << 6) | (this.type << 4) | tokenLen;
        const byte1 = (this.codeClass << 5) | this.codeDetail;

        parts.push(Buffer.from([
            byte0,
            byte1,
            (this.msgid >> 8) & 0xFF,
            this.msgid & 0xFF
        ]));

        // Token
        if (this.token) {
            parts.push(this.token);
        }

        // Options (must be in order!)
        let optLast = 0;

        // Uri-Path (11)
        if (this.uriPaths && this.uriPaths.length > 0) {
            for (const path of this.uriPaths) {
                if (path.length > 0) {
                    const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_URI_PATH);
                    optLast = newOptLast;
                    parts.push(this.encodeOption(delta, Buffer.from(path, 'utf8')));
                }
            }
        }

        // Content-Format (12)
        if (this.contentType !== null && this.contentType !== undefined) {
            const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_CONTENT_FORMAT);
            optLast = newOptLast;
            parts.push(this.encodeOption(delta, this.encodeUint(this.contentType)));
        }

        // Uri-Query (15)
        if (this.uriKeys && this.uriKeys.length > 0) {
            for (const key of this.uriKeys) {
                if (key.length > 0) {
                    const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_URI_QUERY);
                    optLast = newOptLast;
                    parts.push(this.encodeOption(delta, Buffer.from(key, 'utf8')));
                }
            }
        }

        // Accept (17)
        if (this.accept !== null && this.accept !== undefined) {
            const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_ACCEPT);
            optLast = newOptLast;
            parts.push(this.encodeOption(delta, this.encodeUint(this.accept)));
        }

        // Block2 (23)
        if (this.block2BlockSize !== null && this.block2More !== null && this.block2Num !== null) {
            const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_BLOCK2);
            optLast = newOptLast;
            parts.push(this.encodeOption(delta, this.encodeBlock(this.block2Num, this.block2More, this.block2BlockSize)));
        }

        // Block1 (27)
        if (this.block1BlockSize !== null && this.block1More !== null && this.block1Num !== null) {
            const [newOptLast, delta] = this.calcOptDelta(optLast, CoAPFrame.OPT_BLOCK1);
            optLast = newOptLast;
            parts.push(this.encodeOption(delta, this.encodeBlock(this.block1Num, this.block1More, this.block1BlockSize)));
        }

        // Payload
        if (this.payload && this.payload.length > 0) {
            parts.push(Buffer.from([0xFF]));  // Payload marker
            parts.push(this.payload);
        }

        return Buffer.concat(parts);
    }

    /**
     * Calculate option delta
     */
    calcOptDelta(valLast, valCur) {
        if (valCur < valLast) {
            throw new Error('Wrong option order');
        }
        const delta = valCur - valLast;
        return [valCur, delta];
    }

    /**
     * Encode option value encoding (delta/length can use extended format)
     */
    encodeOptVal(v) {
        if (v < 13) {
            return [v, Buffer.alloc(0)];
        } else if (v <= 268) {
            return [13, Buffer.from([v - 13])];
        } else if (v < 65536) {
            const val = v - 269;
            return [14, Buffer.from([(val >> 8) & 0xFF, val & 0xFF])];
        } else {
            throw new Error('Invalid option value');
        }
    }

    /**
     * Encode single option
     */
    encodeOption(delta, payload) {
        const [d, dExt] = this.encodeOptVal(delta);
        const [pl, plExt] = this.encodeOptVal(payload.length);

        const header = Buffer.from([(d << 4) | pl]);
        return Buffer.concat([header, dExt, plExt, payload]);
    }

    /**
     * Encode unsigned integer (variable length, 0-4 bytes)
     */
    encodeUint(v) {
        if (v === 0) {
            return Buffer.alloc(0);
        } else if (v < 256) {
            return Buffer.from([v]);
        } else if (v < 65536) {
            return Buffer.from([(v >> 8) & 0xFF, v & 0xFF]);
        } else if (v < 16777216) {
            return Buffer.from([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);
        } else {
            return Buffer.from([(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]);
        }
    }

    /**
     * Decode unsigned integer
     */
    decodeUint(v) {
        if (v.length === 0) return 0;
        if (v.length === 1) return v[0];
        if (v.length === 2) return (v[0] << 8) | v[1];
        if (v.length === 3) return (v[0] << 16) | (v[1] << 8) | v[2];
        if (v.length === 4) return (v[0] << 24) | (v[1] << 16) | (v[2] << 8) | v[3];
        throw new Error('Unexpected uint size');
    }

    /**
     * Encode block option (Block1/Block2)
     */
    encodeBlock(num, more, blockSize) {
        let szx;
        switch (blockSize) {
            case 16: szx = 0; break;
            case 32: szx = 1; break;
            case 64: szx = 2; break;
            case 128: szx = 3; break;
            case 256: szx = 4; break;
            case 512: szx = 5; break;
            case 1024: szx = 6; break;
            default: throw new Error(`Invalid block size: ${blockSize}`);
        }

        let val = szx;
        if (more !== 0) {
            val += 8;
        }
        val += (num << 4);

        return this.encodeUint(val);
    }

    /**
     * Decode block option
     */
    decodeBlock(arr) {
        const val = this.decodeUint(arr);
        const szx = val & 0x7;
        const m = (val >> 3) & 1;
        const num = val >> 4;
        const blockSize = Math.pow(2, szx + 4);
        return [num, m, blockSize];
    }

    /**
     * Convert frame to string (for debugging)
     */
    toString() {
        if (this.parseError) {
            return `ERROR: ${this.parseError}`;
        }

        let s = '';

        // Type
        switch (this.type) {
            case CoAPFrame.TYPE_CONFIRMABLE: s += 'CON'; break;
            case CoAPFrame.TYPE_NON_CONFIRMABLE: s += 'NON'; break;
            case CoAPFrame.TYPE_ACK: s += 'ACK'; break;
            case CoAPFrame.TYPE_RESET: s += 'RST'; break;
            default: s += `T${this.type}`;
        }

        s += ` [MID=0x${this.msgid.toString(16).padStart(4, '0')}]`;

        // Code
        if (this.codeClass === CoAPFrame.COAP_CLASS_REQ) {
            let uri = '';
            if (this.uriPaths && this.uriPaths.length > 0) {
                uri += this.uriPaths.map(p => `/${p}`).join('');
            }
            if (this.uriKeys && this.uriKeys.length > 0) {
                uri += '?' + this.uriKeys.join('&');
            }
            if (uri.length > 0) {
                uri = ' ' + uri;
            }

            switch (this.codeDetail) {
                case CoAPFrame.CODE_PING: s += ` PING${uri}`; break;
                case CoAPFrame.CODE_GET: s += ` GET${uri}`; break;
                case CoAPFrame.CODE_POST: s += ` POST${uri}`; break;
                case CoAPFrame.CODE_PUT: s += ` PUT${uri}`; break;
                case CoAPFrame.CODE_DEL: s += ` DEL${uri}`; break;
                case CoAPFrame.CODE_FETCH: s += ` FETCH${uri}`; break;
                case CoAPFrame.CODE_IPATCH: s += ` IPATCH${uri}`; break;
                default: s += ` ${this.codeClass}.${this.codeDetail.toString().padStart(2, '0')}`;
            }
        } else {
            s += ` ${this.codeClass}.${this.codeDetail.toString().padStart(2, '0')}`;
        }

        if (this.token) {
            s += ` Token=0x${this.token.toString('hex')}`;
        }

        if (this.accept !== null) s += ` ac=${this.accept}`;
        if (this.contentType !== null) s += ` ct=${this.contentType}`;

        if (this.block1Num !== null) {
            s += ` 1:${this.block1Num}/${this.block1More}/${this.block1BlockSize}`;
        }

        if (this.block2Num !== null) {
            s += ` 2:${this.block2Num}/${this.block2More}/${this.block2BlockSize}`;
        }

        if (this.payload && this.payload.length > 0) {
            s += ` PAYLOAD=${this.payload.toString('hex').substring(0, 32)}${this.payload.length > 16 ? '...' : ''}`;
        }

        return s;
    }
}

export default CoAPFrame;
