export default class ElectrumClient {
    constructor(port: any, host: any, protocol: any, { client, version, persistence, options, callbacks }?: {
        client?: string;
        version?: string;
        persistence?: {
            retryPeriod: number;
            maxRetry: number;
            pingPeriod: number;
            callback: any;
        };
    });
    _clientInfo: {
        client: string;
        version: string;
    };
    _persistence: {
        retryPeriod: number;
        maxRetry: number;
        pingPeriod: number;
        callback: any;
    };
    _ensure(timeoutMs?: number): any;
    _ready: any;
    reconnect(): any;
    close(): void;
}
