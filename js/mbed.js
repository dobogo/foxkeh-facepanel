(function (global, undefined) {
    'use strict';

    /**
     * Creates a mbed object.
     * @constructor
     */
    function Mbed() {
        this._url = '';
    }

    Mbed.prototype.getUrl = function () {
        return this._url;
    };

    Mbed.prototype.setUrl = function (url) {
        this._url = url;
    };

    Mbed.prototype.passthrough = function (req) {
        var path = req.path;
        if(req.queryString){
          path = path + '?' + req.queryString;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', this._url + path, true);
        xhr.send();
    };

    Mbed.prototype.setLeftSpeed = function (speed) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', this._url + '/api/motor/left?speed=' + parseInt(speed, 10), true);
        console.log('GET', this._url + '/api/motor/left?speed=' + parseInt(speed, 10));
        xhr.send();
    };

    Mbed.prototype.setRightSpeed = function (speed) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', this._url + '/api/motor/right?speed=' + parseInt(speed, 10), true);
        console.log('GET', this._url + '/api/motor/right?speed=' + parseInt(speed, 10));
        xhr.send();
    };

    Mbed.prototype.forward = function () {
        this.setLeftSpeed(255);
        this.setRightSpeed(255);
    };

    Mbed.prototype.back = function () {
        this.setLeftSpeed(-255);
        this.setRightSpeed(-255);
    };

    Mbed.prototype.stop = function () {
        this.setLeftSpeed(0);
        this.setRightSpeed(0);
    };

    global.Mbed = Mbed;
}(this));
