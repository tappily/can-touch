define(['can/map', 'can/map/attributes'], function(m) {
    'use strict';

    return m.extend({
        attributes: {
            top: 'number',
            right: 'number',
            bottom: 'number',
            left: 'number',
            height: 'number',
            width: 'number',
            center: 'number',
            middle: 'number'
        }
    }, {
        update: function(pt1, pt2) {
            var x1 = pt1.attr('x'),
                x2 = pt2.attr('x'),
                y1 = pt1.attr('y'),
                y2 = pt2.attr('y');

            this.attr({
                top: Math.min(y1, y2),
                left: Math.min(x1, x2),
                bottom: Math.max(y1, y2),
                right: Math.max(x1, x2)
            });

            this.attr('width', this.attr('right') - this.attr('left'));
            this.attr('height', this.attr('bottom') - this.attr('top'));
            this.attr('center', this.attr('width') / 2 + this.attr('left'));
            this.attr('middle', this.attr('height') / 2 + this.attr('top'));

            return this;
        }
    });
});