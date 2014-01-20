define(['can/map', 'can/map/attributes'], function (m) {
    'use strict';
    return m.extend({
        attributes: {
            x: 'x',
            y: 'y',
            'x-origin': 'x',
            'y-origin': 'y',
            'x-distance': 'number',
            'y-distance': 'number',
            'start-time': 'date',
            'end-time': 'date',
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
            this.attr('x-origin', touch);
            this.attr('y-origin', touch);

            var now = new Date();
            this.attr('start-time', now);
            this.attr('end-time', now);
            this.attr('duration', 0);
            return this;
        },
        end: function() {
            var now = new Date();
            var elapsed = now - this.attr('start-time');
            this.attr('duration', elapsed);
            this.attr('end', now);
        },
        update: function(touch) {
            this.attr('x', touch);
            this.attr('y', touch);
            this.attr('x-distance', this.attr('x') - this.attr('x-origin'));
            this.attr('y-distance', this.attr('y') - this.attr('y-origin'));
        }
    });
});