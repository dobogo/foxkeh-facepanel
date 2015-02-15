(function (global, undefined) {
    'use strict';

    /**
     * Creates a server.
     * @constructor
     */
    function Server() {
        this._httpServer = new HttpServer();
        this._port = 3000;
        this._httpServer.get('/api/heartbeat', function (req, res, oncomplete) {
            res.write('ok');
            oncomplete();
        });
    }

    /**
     * Add event listener.
     * @param {string} type String of event type.
     * @param {function} handler Event listener.
     */
    Server.prototype.addEventListener = function (type, handler) {
        switch (type) {
        case 'mbedRequested':
            this._httpServer.get('/api/motor/right', handler);
            this._httpServer.get('/api/motor/left', handler);
            this._httpServer.get('/api/tail/swing/start', handler);
            this._httpServer.get('/api/tail/swing/end', handler);
            break;
        case 'faceStateRequested':
            this._httpServer.get('/api/face/eye', handler);
            break;
        case 'faceWinkRequested':
            this._httpServer.get('/api/face/eye/wink', handler);
            break;
        }
    };

    /**
     * Gets listening port number.
     * @return {number} Listening port.
     */
    Server.prototype.getPort = function () {
        return this._port;
    };

    /**
     * Sets listening port number.
     * @param {number} port Listening port number.
     */
    Server.prototype.setPort = function (port) {
        this._port = port;
    };

    /**
     * Starts listening.
     */
    Server.prototype.start = function () {
        this._httpServer.start(this._port);
    };

    global.Server = Server;
}(this));
