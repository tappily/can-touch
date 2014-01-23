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
        distance: function() {
            var xd = this.attr('point.x') - this.attr('origin.x'),
                yd = this.attr('point.y') - this.attr('origin.y');
            return Math.sqrt((xd * xd) + (yd * yd));
        },
        area: function() {
            return new Rect().update(this.attr('origin'), this.attr('point'));
        },
        update: function (touch) {
            this.attr('point', touch);
            return this;
        }
    });
});