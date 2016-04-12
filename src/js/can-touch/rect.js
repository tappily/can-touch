define(['can/map', 'can/map/define'], function(m) {
    'use strict';

    function round(n) {
        return Math.round(n);
    }

    function unit (u) {
        return u ? String(u) : 'px';
    }

    return m.extend({
        define: {
            top: {
                type: round
            },
            right: {
                type: round
            },
            bottom: {
                type: round
            },
            left: {
                type: round
            },
            height: {
                type: round
            },
            width: {
                type: round
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
            unit = unit(unit) + ' ';
            return 'rect( '+ this.top + unit + this.right + unit + this.bottom + unit + this.left + unit + ')';
        }
    });
});
