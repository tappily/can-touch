define(['can/map', 'can/map/attributes'], function (m) {
    'use strict';
    return m.extend({
        attributes: {
            x: 'x',
            y: 'y',
            xs: 'x',
            ys: 'y',
            xd: 'number',
            yd: 'number'
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
            return this;
        },
        update: function(touch) {
            this.attr('x', touch);
            this.attr('y', touch);
            this.attr('xd', this.attr('x') - this.attr('xs'));
            this.attr('yd', this.attr('y') - this.attr('ys'));
        }
    });
});