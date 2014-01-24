define(['can/map', './rect', 'can/map/attributes'], function (M, Rect) {
    'use strict';
    return M.extend({
        attributes: {
            origin: 'point',
            point: 'point',
            'start-time': 'date',
            'end-time': 'date',
            duration: 'number'
        },
        convert: {
            point: function(touch) {
                if(touch instanceof M) {
                    return touch;
                }

                touch = touch.originalEvent ? touch.originalEvent : touch;

                if (touch.changedTouches) {
                    touch = touch.changedTouches[0];
                } else {
                    touch.identifier = 0;
                }

                return new M({
                    x: parseFloat(touch.pageX || touch.clientX),
                    y: parseFloat(touch.pageY || touch.clientY)
                });
            }
        }
    }, {
        init: function (touch) {
            this.attr('id', touch.identifier);
            this.attr('origin', touch);
            return this;
        },
        start: function() {
            var now = new Date();
            this.attr('start-time', now);
            this.attr('end-time', now);
            this.attr('duration', 0);
            return this;
        },
        end: function () {
            var now = new Date();
            var elapsed = now - this.attr('start-time');
            this.attr('duration', elapsed);
            this.attr('end', now);
            return this;
        },
        _distance: function(xd, yd) {
            return Math.sqrt((xd * xd) + (yd * yd));
        },
        distance: function() {
            return this._distance(this.attr('point.x') - this.attr('origin.x'),
                                    this.attr('point.y') - this.attr('origin.y'));
        },
        angle: function () {
            var xd = this.attr('point.x') - this.attr('origin.x');
            var yd = this.attr('point.y') - this.attr('origin.y');
            var rad = Math.atan2(yd, xd);
            return rad * (180 / Math.PI);
        },
        scale: function() {
            var point = this._distance(this.attr('point.x'), this.attr('point.y')),
                origin = this._distance(this.attr('origin.x'), this.attr('origin.y'));
            return (point / origin);
        },
        cancel: function() {
            this.attr('point', this.attr('origin'));
            return this;
        },
        area: function(offset) {
            var origin = this.attr('origin'),
                point = this.attr('point');

            if(offset) {
                origin = new M({
                    x: origin.attr('x') - offset.left,
                    y: origin.attr('y') - offset.top
                });
                point = new M({
                    x: point.attr('x') - offset.left,
                    y: point.attr('y') - offset.top
                });
            }

            return new Rect().update(origin, point);
        },
        update: function (touch) {
            this.attr('point', touch);
            return this;
        }
    });
});