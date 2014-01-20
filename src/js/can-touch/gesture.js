define(['can/util/library', 'can/control', './touches', './move'], function (u, C, T, Fly) {
    'use strict';
    // replace this module and give me LIFE
    return C.extend({
        defaults: {
            model: null,
            touch1xd: '0.xd',
            touch1yd: '0.yd',
            touch2xd: '1.xd',
            touch2yd: '1.yd',
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