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
            oncomplete();
        });

        // set face related things
        server.addEventListener('faceRequested', function (req, res, oncomplete) {
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
