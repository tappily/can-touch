define(['can/control'], function (C) {
    'use strict';
    return C.extend({
        defaults: {
            gestureModel: null,
            touchModel: null,
            threshold: 3
        }
    }, {
        init: function() {
            this.options.touchModel.attr('gesture', this.options.gestureModel);
            /*
            if(this.options.touchModel.attr('touches').attr('length') > 1) {
                this.options.gestureModel.attr('name', 'swipe');
            } else {
                this.options.gestureModel.attr('name', 'tap');
            }
            */
        },
        '{touchModel.touches} length': function(el, ev, val) {
            if(!val) {
                this.options.gestureModel.removeAttr('name');
            }
        },
        '{touchModel.touches.0} plot': function(el, ev, val) {
            this.options.gestureModel.attr('rect').update(val[0], val[1]);
        }
    });
});