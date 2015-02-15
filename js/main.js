(function (global, undefined) {
    'use strict';

    console.log('start main.js');

    var Server = global.Server;
    var Face = global.Face;

    const MBED_URL = 'http://127.0.0.1:5000';
    const PORT = 3000;

    function initializeServer() {
        var server = new Server();
        global.server = server;

        server.setPort(PORT);

        // set mbed related things
        server.addEventListener('mbedRequested', function (req, res, oncomplete) {
            var path = req.path + '?' + req.queryString;
            var xhr = new XMLHttpRequest();
            xhr.open('GET', MBED_URL + path, true);
            try {
                xhr.send();
            } catch (e) {
                console.error(e);
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            oncomplete();
        });

        // set face related things
        server.addEventListener('faceStateRequested', function (req, res, oncomplete) {
            var state = req.queryString.match(/state=(.*)/)[1];
            try {
                global.face.setType(state);
                res.write('ok');
            } catch (e) {
                res.write('Error: No such state: ' + state);
            }
            res.setHeader('Access-Control-Allow-Origin', '*');
            oncomplete();
        });
        server.addEventListener('faceWinkRequested', function (req, res, oncomplete) {
            global.face.wink();
            res.write('ok');
            oncomplete();
        });

        if (server.start()) {
            console.log('Started server on port ' + server.getPort());
        }
    }

    function initializeFace() {
        var face = new Face(document.getElementById('face'));
        global.face = face;
    }

    window.addEventListener('load', function () {
        console.log('window onload');

        screen.mozLockOrientation('landscape-primary');
        initializeServer();
        initializeFace();
    });
}(this));
