define(['can/map', 'can/map/attributes'], function (m) {
    'use strict';
    return m.extend({
        attributes: {
            x: 'x',
            y: 'y',
            xs: 'x',
            ys: 'y',
            xd: 'number',
            yd: 'number',
            start: 'date',
            end: 'date',
            duration: 'number'
        },
        convert: {
            x: function(touch) {
                return parseFloat(touch.pageX || touch.clientX);
            },
            y: function(touch) {
                return parseFloat(touch.pageY || touch.clientY);
            }
        }
    }, {
        init: function(touch) {
            this.attr('id', touch.identifier);
            this.attr('xs', touch);
            this.attr('ys', touch);

            var now = new Date();
            this.attr('start', now);
            this.attr('end', now);
            this.attr('duration', 0);
            return this;
        },
        end: function() {
            var now = new Date();
            var elapsed = now - this.attr('start');
            this.attr('duration', elapsed);
            this.attr('end', now);
        },
        update: function(touch) {
            this.attr('x', touch);
            this.attr('y', touch);
            this.attr('xd', this.attr('x') - this.attr('xs'));
            this.attr('yd', this.attr('y') - this.attr('ys'));
        }
    });
});