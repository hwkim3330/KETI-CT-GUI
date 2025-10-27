/**
 * CoAP Client Implementation
 *
 * Based on official Ruby implementation from Microchip
 * Reference: velocitydrivesp-support/support/libeasy/handler/coap.rb
 */

import { CoAPFrame } from './coap-frame.js';
import { EventEmitter } from 'events';

/**
 * Single Request with Block-wise Transfer
 * Matches Ruby's ReqBlockWise class
 */
class RequestBlockWise {
    static RETRANSMIT_TIME_SEC = 3;
    static MAX_RETRIES = 5;
    static BLOCK_SIZE = 256;  // Default block size

    constructor(client, method, uri, payload = null, opts = {}) {
        this.client = client;
        this.method = method;
        this.uri = uri;
        this.payloadTx = payload;
        this.payloadRx = Buffer.alloc(0);
        this.opts = opts;
        this.state = 'state_req_tx';

        this.mid = null;
        this.codeClass = null;
        this.codeDetail = null;

        // Request transmission tracking
        this.reqTx = null;      // How much has been sent
        this.reqTxAck = null;   // How much has been ACKed

        // Response reception tracking
        this.resMore = false;
        this.resBs = null;
        this.resNum = null;

        // Retransmission
        this.reqTimer = null;
        this.retry = 0;
        this.lastFrame = null;
    }

    /**
     * Check if request transmission is not done
     */
    reqNotDone() {
        if (this.reqTx === null || (this.reqTx !== this.reqTxAck)) {
            return true;
        }

        if (this.payloadTx && this.reqTx !== this.payloadTx.length) {
            return true;
        }

        return false;
    }

    /**
     * Handle received data
     */
    rxData(frame) {
        if (this.mid === null || frame.msgid !== this.mid) {
            return this.nextStep();
        }

        // Check if it's an ACK for our request
        if (frame.type === CoAPFrame.TYPE_ACK && frame.codeClass === 2) {
            this.reqTxAck = this.reqTx;
        }

        this.mid = null;
        this.reqTimer = null;
        this.codeClass = frame.codeClass;
        this.codeDetail = frame.codeDetail;

        if (frame.payload) {
            this.payloadRx = Buffer.concat([this.payloadRx, frame.payload]);
        }

        // Check if more blocks are coming
        if (frame.block2More && frame.block2More === 1) {
            this.resMore = true;
            this.resBs = frame.block2BlockSize;
            this.resNum = frame.block2Num;
        } else {
            this.resMore = false;
        }

        // Error response - stop
        if (frame.codeClass === 5 || frame.codeClass === 4) {
            return [null, null];
        }

        return this.nextStep();
    }

    /**
     * Next step in request/response state machine
     * Returns [timer, frame] tuple:
     * - [null, null]: Done
     * - [time, frame]: Send frame and set timer
     * - [time, null]: Continue waiting
     */
    nextStep() {
        const ts = Date.now();

        // Handle retransmission timer
        if (this.reqTimer) {
            if (ts >= this.reqTimer) {
                if (this.retry < RequestBlockWise.MAX_RETRIES) {
                    console.log(`[CoAP] Retransmit ${this.retry}`);
                    this.reqTimer = ts + (RequestBlockWise.RETRANSMIT_TIME_SEC * 1000);
                    this.retry++;
                    return [this.reqTimer, this.lastFrame];
                } else {
                    console.warn('[CoAP] Giving up after max retries');
                    this.reqTimer = null;
                    return [null, null];
                }
            } else {
                // Continue waiting
                return [this.reqTimer, null];
            }
        }

        // Build new frame
        const f = new CoAPFrame();
        f.accept = this.opts.accept;
        f.type = CoAPFrame.TYPE_CONFIRMABLE;
        f.codeClass = CoAPFrame.COAP_CLASS_REQ;
        f.codeDetail = this.method;

        // Generate message ID
        this.mid = Math.floor(Math.random() * 0x10000);
        f.msgid = this.mid;

        // Parse URI
        const [pathPart, queryPart] = this.uri.split('?');
        if (pathPart) {
            f.uriPaths = pathPart.split('/').filter(s => s.length > 0);
        }
        if (queryPart) {
            f.uriKeys = queryPart.split('&').filter(s => s.length > 0);
        }

        // Always put block2 option to ask for fragmented response
        f.block2BlockSize = RequestBlockWise.BLOCK_SIZE;
        f.block2More = 0;
        f.block2Num = 0;

        this.retry = 0;

        // Handle request transmission (Block1)
        if (this.reqNotDone()) {
            if (this.reqTx === null) {
                this.reqTx = 0;
            }

            if (this.payloadTx) {
                f.contentType = this.opts.contentType;

                if (this.payloadTx.length > RequestBlockWise.BLOCK_SIZE) {
                    // Need block-wise transfer
                    const start = this.reqTxAck !== null ? this.reqTxAck : 0;
                    const end = Math.min(start + RequestBlockWise.BLOCK_SIZE, this.payloadTx.length);
                    f.payload = this.payloadTx.slice(start, end);

                    f.block1BlockSize = RequestBlockWise.BLOCK_SIZE;
                    f.block1Num = Math.floor(this.reqTx / RequestBlockWise.BLOCK_SIZE);

                    this.reqTx += f.payload.length;
                    f.block1More = this.reqTx < this.payloadTx.length ? 1 : 0;
                } else {
                    // Fits in single packet
                    f.payload = this.payloadTx;
                    this.reqTx = this.payloadTx.length;
                }
            }

            this.lastFrame = f;
            this.reqTimer = ts + (RequestBlockWise.RETRANSMIT_TIME_SEC * 1000);
            return [this.reqTimer, this.lastFrame];
        } else if (this.resMore) {
            // Request next block of response
            f.block2Num = this.resNum + 1;
            this.lastFrame = f;
            this.reqTimer = ts + (RequestBlockWise.RETRANSMIT_TIME_SEC * 1000);
            return [this.reqTimer, this.lastFrame];
        } else {
            // Done
            this.lastFrame = null;
            this.reqTimer = null;
            return [null, null];
        }
    }
}

/**
 * CoAP Handler - manages CoAP over MUP1
 */
export class CoAPClient extends EventEmitter {
    constructor(mup1Protocol, serial) {
        super();
        this.protocol = mup1Protocol;
        this.serial = serial;
        this.currentReq = null;
        this.timeout = null;

        // Method codes
        this.METHODS = {
            GET: CoAPFrame.CODE_GET,
            POST: CoAPFrame.CODE_POST,
            PUT: CoAPFrame.CODE_PUT,
            DELETE: CoAPFrame.CODE_DEL,
            FETCH: CoAPFrame.CODE_FETCH,
            IPATCH: CoAPFrame.CODE_IPATCH
        };
    }

    /**
     * Handle received CoAP frame
     */
    handleCoAPFrame(frame) {
        console.log(`[CoAP RX] ${frame.toString()}`);

        if (this.currentReq) {
            const [timer, frameToSend] = this.currentReq.rxData(frame);
            this.setTimeoutAbs(timer);
            if (frameToSend) {
                this.txFrame(frameToSend);
            }
        }
    }

    /**
     * Send CoAP frame
     */
    txFrame(frame) {
        if (!frame) return;

        console.log(`[CoAP TX] ${frame.toString()}`);

        const coapData = frame.encode();
        const mup1Frame = this.protocol.createCoapFrame(coapData);
        this.serial.write(mup1Frame);
    }

    /**
     * Set absolute timeout
     */
    setTimeoutAbs(absTime) {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (absTime === null) {
            return;
        }

        const delay = absTime - Date.now();
        if (delay > 0) {
            this.timeout = setTimeout(() => {
                this.handleTimeout();
            }, delay);
        } else {
            // Timer already expired
            this.handleTimeout();
        }
    }

    /**
     * Handle timeout event
     */
    handleTimeout() {
        if (!this.currentReq) return;

        const [timer, frame] = this.currentReq.nextStep();
        this.setTimeoutAbs(timer);
        if (frame) {
            this.txFrame(frame);
        }
    }

    /**
     * Check if request is done
     */
    reqDone() {
        return this.timeout === null;
    }

    /**
     * Perform CoAP request
     */
    async request(method, uri, data = null, opts = {}) {
        this.currentReq = new RequestBlockWise(this, method, uri, data, opts);

        const [timer, frame] = this.currentReq.nextStep();
        this.setTimeoutAbs(timer);
        if (frame) {
            this.txFrame(frame);
        }

        // Wait for completion
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (this.reqDone()) {
                    clearInterval(checkInterval);

                    const result = this.currentReq;
                    this.currentReq = null;

                    if (result.codeClass === 2) {
                        resolve({
                            codeClass: result.codeClass,
                            codeDetail: result.codeDetail,
                            payload: result.payloadRx
                        });
                    } else {
                        const error = new Error(`CoAP Error ${result.codeClass}.${result.codeDetail}`);
                        error.codeClass = result.codeClass;
                        error.codeDetail = result.codeDetail;
                        error.payload = result.payloadRx;
                        reject(error);
                    }
                }
            }, 100);

            // Overall timeout (30 seconds)
            setTimeout(() => {
                if (!this.reqDone()) {
                    clearInterval(checkInterval);
                    this.currentReq = null;
                    if (this.timeout) {
                        clearTimeout(this.timeout);
                        this.timeout = null;
                    }
                    reject(new Error('Request timeout (30s)'));
                }
            }, 30000);
        });
    }

    /**
     * GET request
     */
    async get(uri, opts = {}) {
        return this.request(this.METHODS.GET, uri, null, opts);
    }

    /**
     * POST request
     */
    async post(uri, data, opts = {}) {
        opts.contentType = opts.contentType ?? CoAPFrame.CT_APPL_YANG_INSTANCES_CBOR;
        return this.request(this.METHODS.POST, uri, data, opts);
    }

    /**
     * PUT request
     */
    async put(uri, data, opts = {}) {
        opts.contentType = opts.contentType ?? CoAPFrame.CT_APPL_YANG_DATA_CBOR;
        return this.request(this.METHODS.PUT, uri, data, opts);
    }

    /**
     * DELETE request
     */
    async delete(uri, opts = {}) {
        return this.request(this.METHODS.DELETE, uri, null, opts);
    }

    /**
     * FETCH request
     */
    async fetch(uri, data, opts = {}) {
        opts.contentType = opts.contentType ?? CoAPFrame.CT_APPL_YANG_IDENTIFIERS_CBOR;
        return this.request(this.METHODS.FETCH, uri, data, opts);
    }

    /**
     * IPATCH request
     */
    async ipatch(uri, data, opts = {}) {
        opts.contentType = opts.contentType ?? CoAPFrame.CT_APPL_YANG_INSTANCES_CBOR;
        return this.request(this.METHODS.IPATCH, uri, data, opts);
    }
}

export default CoAPClient;
