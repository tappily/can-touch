define(['can/map', './rect', 'can/map/define'], function ($Map, $Rect) {
    'use strict';

    function whichEvent(ev) {
        ev = ev.originalEvent ? ev.originalEvent : ev;

        if (ev.changedTouches) {
            ev = ev.changedTouches[0];
        }

        return ev;
    }

    function makePoint() {
        return {
            x: parseFloat(a[0]),
            y: parseFloat(a[1])
        };
    }

    function makeTouchPoint ($touch) {
        var touch = whichEvent($touch);

        return makePoint([
            (touch.pageX || touch.clientX),
            (touch.pageY || touch.clientY)]);
    }

    return $Map.extend({
        define: {
            origin: {
                set: makeTouchPoint
            },
            'start-time': {
                type: 'date'
            },
            'end-time': {
                type: 'date'
            },
            duration: {
                type: 'number'
            },
            'touch-point': {
                set: makeTouchPoint
            },
            point: {
                set: makePoint
            },
            which: {
                set: whichEvent
            }
        }
    }, {
        init: function (touch) {
            this.attr('origin', touch);
            console.log('created touch', this);
        },
        start: function () {
            var now = new Date();
            this.attr('start-time', now);
            this.attr('end-time', now);
            this.attr('duration', 0);
        },
        end: function () {
            var now = new Date();
            var elapsed = now - this.attr('start-time');
            this.attr('duration', elapsed);
            this.attr('end', now);
        },
        _distance: function (xd, yd) {
            return Math.sqrt((xd * xd) + (yd * yd));
        },
        distance: function () {
            var len = this.length();
            return this._distance(len.x, len.y);
        },
        length: function () {
            return makePoint([
                this.attr('point.x') - this.attr('origin.x'),
                this.attr('point.y') - this.attr('origin.y')
            ]);
        },
        angle: function () {
            var len = this.length();
            var rad = Math.atan2(len.y, len.x);
            return rad * (180 / Math.PI);
        },
        scale: function () {
            var point = this._distance(this.attr('point.x'), this.attr('point.y')),
                origin = this._distance(this.attr('origin.x'), this.attr('origin.y'));
            return (point / origin);
        },
        cancel: function () {
            this.point = this.origin;
        },
        area: function (offset) {

            var origin = this.attr('origin'),
                point = this.attr('point');

            if (offset) {
                var offsetX = offset.left || 0,
                    offsetY = offset.top || 0;

                origin = makePoint([
                    origin.attr('x') - offsetX,
                    origin.attr('y') - offsetY
                ]);

                point = makePoint([
                    point.attr('x') - offsetX,
                    point.attr('y') - offsetY
                ]);
            }

            return new $Rect().update(origin, point);
        },
        update: function (touch) {
            this.attr('point', touch);
        }
    });
});
