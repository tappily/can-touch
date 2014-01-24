define(['can/map', './rect', 'can/map/attributes'], function (M, Rect) {
    'use strict';
    return M.extend({
        attributes: {
            origin: 'touch-point',
            point: 'touch-point',
            'start-time': 'date',
            'end-time': 'date',
            duration: 'number'
        },
        convert: {
            'touch-point': function (touch) {
                touch = this.convert.touch(touch);

                return this.convert.point.call(this, [
                    (touch.pageX || touch.clientX),
                    (touch.pageY || touch.clientY)]);
            },
            point: function (a) {
                return {
                    x: this.convert.number(a[0]),
                    y: this.convert.number(a[1])
                };
            },
            touch: function (ev) {
                ev = ev.originalEvent ? ev.originalEvent : ev;

                if (ev.changedTouches) {
                    ev = ev.changedTouches[0];
                }
                return ev;
            }
        }
    }, {
        init: function (touch) {
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
            var len = this.length();
            return this._distance(len.x, len.y);
        },
        length: function() {
            return this.constructor.convert.point.call(this.constructor, [
                this.attr('point.x') - this.attr('origin.x'),
                this.attr('point.y') - this.attr('origin.y')
            ]);
        },
        angle: function () {
            var len = this.length();
            var rad = Math.atan2(len.y, len.x);
            return rad * (180 / Math.PI);
        },
        scale: function() {
            var point = this._distance(this.attr('point.x'), this.attr('point.y')),
                origin = this._distance(this.attr('origin.x'), this.attr('origin.y'));
            return (point / origin);
        },
        cancel: function() {
            this.point = this.origin;
            return this;
        },
        area: function(offset) {

            var origin = this.attr('origin'),
                point = this.attr('point');

            if(offset) {
                var offsetX = offset.left || 0,
                    offsetY = offset.top || 0;

                origin = this.constructor.convert.point.call(this.constructor, [
                    origin.attr('x') - offsetX,
                    origin.attr('y') - offsetY
                ]);

                point = this.constructor.convert.point.call(this.constructor, [
                    point.attr('x') - offsetX,
                    point.attr('y') - offsetY
                ]);
            }

            return new Rect().update(origin, point);
        },
        update: function (touch) {
            this.attr('point', touch);
            return this;
        }
    });
});