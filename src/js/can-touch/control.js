define(['jquery', 'can/util/library', 'can/control', './gesture'], function ($, u, C, Gesture) {
    'use strict';
    return C.extend({
        touchEvents: {
            start: 'touchstart',
            move: 'touchmove',
            end: 'touchend',
            cancel: 'touchcanel'
        },
        mouseEvents: {
            start: 'mousedown',
            move: 'mousemove',
            end: 'mouseup',
            cancel: 'mouseleave'
        },
        defaults: {
            threshold: 30,
            model: null,
            preventDefault: false,
            status: 'touch', // 'touch' enables the move listener
            implementsTouch: ('ontouchstart' in window)
        }
    }, {
        init: function () {
            u.extend(this.options,
                (this.options.implementsTouch) ? this.constructor.touchEvents : this.constructor.mouseEvents);
            this.on();
        },
        '{model} {status}': function(el, ev, val, oval) {
            if(val) {
                this.gesture = new Gesture(this.element, this.options);
            } else if(oval) {
                this.gesture.destroy();
            }
        },
        '{start}': function (el, ev) {
            this.options.model.attr('touch', ev);
            this.options.model.attr('touch.type', 'start');
            $(ev.target).trigger('onetouchstart', [this.options.model.attr('touch')]);
        },
        '{end}': function (el, ev) {
            this.options.model.attr('touch.type', 'end');
            $(ev.target).trigger('onetouchend', [this.options.model.attr('touch')]);
            this.options.model.removeAttr('touch');
        }
    });
});