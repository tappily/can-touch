define(['can/map', 'can/map/attributes'], function(m) {
    'use strict';

    m.extend({
        attributes: {
            top: 'number',
            left: 'number',
            height: 'number',
            width: 'number',
            'anchor-x': 'number',
            'anchor-y': 'number'
        }
    }, {
        center: function() {
            return this.attr('width') / 2 + this.attr('left');
        },
        middle: function() {
            return this.attr('height') / 2 + this.attr('top');
        },
        top: function() {
            return this.attr('top'); // TODO: decide on anchor support
        },
        right: function() {
            return this.attr('width') + this.attr('left');
        },
        bottom: function() {
            return this.attr('height') + this.attr('top');
        },
        left: function() {
            return this.attr('left'); // TODO: decide on anchor support
        }
    });
});