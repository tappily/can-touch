define(['can/control'], function (C) {
    'use strict';
    return C.extend({
        defaults: {
            gestureModel: null,
            touchModel: null,
            touch1xd: '0.x-distance',
            touch1yd: '0.y-distance',
            touch2xd: '1.x-distance',
            touch2yd: '1.y-distance',
            threshold: 3
        }
    }, {
        init: function() {
            this.options.gestureModel.attr('gesture', 'tap');
        },
        '{touchModel.touches} length': function(el, ev, val) {

        },
        '{move}': function(el, ev) {
            delete this.options.move;
            this.on();
            switch(this.options.touchModel.touches.attr('length')) {
                case 1:
                    break;
                case 2:
                    break;
            }
        },
        '{touchModel.touches} {touch1xd}': function(el, ev, val) {
            if(val) {
                this.options.gestureModel.attr('gesture', 'swipe');
            }
        },
        '{touchModel.touches} {touch1yd}': function(el, ev, val) {
            if(val) {
                this.options.gestureModel.attr('gesture', 'swipe');
            }
        }/* TODO: pinches,
        '{model.touches} {touch2xd}': function(el, ev, val) {

        },
        '{model.touches} {touch2yd}': function(el, ev, val) {

        }
        */
    });
});