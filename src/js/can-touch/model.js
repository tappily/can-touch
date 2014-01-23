define(['jquery', 'can/map', './touch', 'can/map/attributes'], function ($, m, T) {
    'use strict';
    return m.extend({
        attributes: {
            touch: 'touch',
            event: 'event'
        },
        convert: {
            'touch': function(ev) {
                return new T(ev);
            }
        }
    }, {
        init: function() {
            this.attr('touch', {});
            return this;
        }
    });
});