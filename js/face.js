(function (global, undefined) {
    'use strict';

    /**
     * Creates a face.
     * @constructor
     * @param {HTMLElement} element An HTML element to represent face.
     */
    function Face(element) {
        var this_ = this;

        this.element = element;
        this.index = 0;
        this.availableTypes = [
            'normal',
            'closed',
            'cry',
            'relax'
        ];
        this.setIndex(0);

        // by touching
        window.addEventListener('touchstart', function () {
            this_.setType('closed');
        });
        window.addEventListener('touchend', function () {
            this_.setType('normal');
        });

        // by proximity
        window.addEventListener('userproximity', function (evt) {
            if (evt.near) {
                this_.setType('closed');
            } else {
                this_.setType('normal');
            }
        });

        // auto wink
        setInterval(function () {
            this_.wink();
        }, 3000);
    }

    Face.prototype.getIndex = function () {
        return this.index;
    };

    Face.prototype.setIndex = function (index) {
        this.index = index;
        this.element.className = this.availableTypes[index];
    };

    Face.prototype.next = function () {
        var index = this.index;
        if (index >= this.availableTypes.length - 1) {
            index = 0;
        } else {
            index += 1;
        }
        this.setIndex(index);
    };

    Face.prototype.setType = function (type) {
        var index = this.availableTypes.findIndex(function (element) {
            return element === type;
        });
        if (index === -1) {
            throw new Error('No such face type: ' + type);
        }
        this.setIndex(index);
    };

    Face.prototype.wink = function () {
        var this_ = this;

        // do not wink during abnormal face
        if (this.index !== 0) {
            return;
        }

        function waitAsync(ms) {
            return function () {
                return new Promise(function (resolve, reject) {
                    setTimeout(resolve, ms);
                });
            };
        }

        this.setType('closed');
        waitAsync(50)()
            .then(function () {
                this_.setType('normal');
            })
            .then(waitAsync(50))
            .then(function () {
                this_.setType('closed');
            })
            .then(waitAsync(50))
            .then(function () {
                this_.setType('normal');
            });
    };

    global.Face = Face;
}(this));
