(function (global, undefined) {
    'use strict';

    console.log('start main.js');

    var Server = global.Server;
    var Face = global.Face;

    const MBED_URL = 'http://192.168.100.44';
    const PORT = 3000;

    function initializeServer() {
        var server = new Server();
        global.server = server;

        server.setPort(PORT);

        // set mbed related things
        server.addEventListener('mbedRequested', function (req, res, oncomplete) {
            var path = req.path;
            if(req.queryString){
              path = path + '?' + req.queryString;
            }
            var xhr = new XMLHttpRequest();
            xhr.open('GET', MBED_URL + path, true);
            xhr.send();
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.write('ok');
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

        try {
            server.start();
            console.log('Started server on port ' + server.getPort());
        } catch (e) {
            console.error('Error: could not start server');
            console.error(e);
        }
    }

    function initializeFace() {
        var face = new Face(document.getElementById('face'));
        global.face = face;
    }

    window.addEventListener('error', function (evt) {
        console.error(evt.error);
    });

    window.addEventListener('load', function () {
        console.log('window onload');

        screen.mozLockOrientation('landscape-primary');
        initializeServer();
        initializeFace();
    });
}(this));
