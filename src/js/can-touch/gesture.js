define(['can/control'], function (C) {
    'use strict';
    // replace this module and give me LIFE
    return C.extend({
        defaults: {
            model: null,
            touch1xd: '0.x-distance',
            touch1yd: '0.y-distance',
            touch2xd: '1.x-distance',
            touch2yd: '1.y-distance',
            threshold: 3
        }
    }, {
        init: function() {
            this.options.model.attr('gesture', 'tap');
        },
        '{model.touches} {touch1xd}': function(el, ev, val) {
            if(val) {
                this.options.model.attr('gesture', 'swipe');
                delete this.options.touch1xd;
                this.on();
            }
        },
        '{model.touches} {touch1yd}': function(el, ev, val) {
            if(val) {
                this.options.model.attr('gesture', 'swipe');
                delete this.options.touch1yd;
                this.on();
            }
        }/* TODO: pinches,
        '{model.touches} {touch2xd}': function(el, ev, val) {

        },
        '{model.touches} {touch2yd}': function(el, ev, val) {

        }
        */
    });
});