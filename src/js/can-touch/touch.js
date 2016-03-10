define(['can/map', './rect', 'can/map/define'], function (M, Rect) {
    'use strict';
    return M.extend({
        define: {
            origin: {
                type: 'touchpoint'
            },
            startTime: {
                type: 'date'
            },
            endTime: {
                type: 'date'
            },
            duration: {
                type: 'number'
            },
            touchpoint: {
                set: function (touch) {
                    touch = this.define.onetouch.set(touch);

                    return this.define.point.set.call(this, [
                        (touch.pageX || touch.clientX),
                        (touch.pageY || touch.clientY)]);
                }
            },
            point: {
                set: function (a) {
                    return {
                        x: this.define.number(a[0]),
                        y: this.define.number(a[1])
                    };
                }
            },
            'oneTouch': {
                set: function (ev) {
                    ev = ev.originalEvent ? ev.originalEvent : ev;

                    if (ev.changedTouches) {
                        ev = ev.changedTouches[0];
                    }

                    return ev;
                }
            }
        }
    }, {
        init: function (touch) {
            this.attr('origin', touch);
            return this;
        },
        start: function () {
            var now = new Date();
            this.attr('startTime', now);
            this.attr('endTime', now);
            this.attr('duration', 0);
            return this;
        },
        end: function () {
            var now = new Date();
            var elapsed = now - this.attr('startTime');
            this.attr('duration', elapsed);
            this.attr('end', now);
            return this;
        },
        _distance: function (xd, yd) {
            return Math.sqrt((xd * xd) + (yd * yd));
        },
        distance: function () {
            var len = this.length();
            return this._distance(len.x, len.y);
        },
        length: function () {
            return this.constructor.define.point.set.call(this.constructor, [
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
            return this;
        },
        area: function (offset) {

            var origin = this.attr('origin'),
                point = this.attr('point');

            if (offset) {
                var offsetX = offset.left || 0,
                    offsetY = offset.top || 0;

                origin = this.constructor.define.point.set.call(this.constructor, [
                    origin.attr('x') - offsetX,
                    origin.attr('y') - offsetY
                ]);

                point = this.constructor.define.point.set.call(this.constructor, [
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
})
;
