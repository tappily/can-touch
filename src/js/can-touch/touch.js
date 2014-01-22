define(['can/map', './rect', 'can/map/attributes'], function (M, Rect) {
    'use strict';
    return M.extend({
        attributes: {
            origin: 'point',
            point: 'point',
            'start-time': 'date',
            'end-time': 'date',
            duration: 'number',
            distance: 'distance'
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

            this.attr('rect', new Rect());

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
        },
        update: function (touch) {
            this.attr('point', touch);

            var xd = this.attr('point.x') - this.attr('origin.x'),
                yd = this.attr('point.y') - this.attr('origin.y');

            this.attr('distance', Math.sqrt((xd * xd) + (yd * yd)));
            this.attr('rect').update(this.attr('origin'), this.attr('point'));
        }
    });
});