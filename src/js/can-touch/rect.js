define(['can/map', 'can/map/attributes'], function(m) {
    'use strict';

    return m.extend({
        attributes: {
            top: 'round',
            right: 'round',
            bottom: 'round',
            left: 'round',
            height: 'round',
            width: 'round'
        },
        convert: {
            round: function(n) {
                return Math.round(n);
            },
            unit: function(u) {
                return u ? String(u) : 'px';
            }
        }
    }, {
        update: function(pt1, pt2) {
            var x1 = pt1.x,
                x2 = pt2.x,
                y1 = pt1.y,
                y2 = pt2.y;

            this.attr({
                top: Math.min(y1, y2),
                left: Math.min(x1, x2),
                bottom: Math.max(y1, y2),
                right: Math.max(x1, x2)
            });

            this.attr('width', this.attr('right') - this.attr('left'));
            this.attr('height', this.attr('bottom') - this.attr('top'));

            return this;
        },
        toStyle: function(unit) {
            unit = this.constructor.convert.unit(unit) + ' ';
            return 'rect( '+ this.top + unit + this.right + unit + this.bottom + unit + this.left + unit + ')';
        }
    });
});