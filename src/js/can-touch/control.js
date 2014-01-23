define(['can/util/library', 'can/control', './touches', './gesture'], function (u, C, T, Gesture) {
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
            implementsTouch: ('ontouchstart' in window)
        }
    }, {
        init: function () {
            u.extend(this.options,
                (this.options.implementsTouch) ? this.constructor.touchEvents : this.constructor.mouseEvents);
            this.on();
        },
        '{model.touches} length': function(el, ev, val, oval) {

        },
        '{start}': function (el, ev) {
            this.gesture = new Gesture(this.element, this.options);
            this.options.model.attr('events', ev).attr('touches').reset(this.options.model.attr('events'));
        },
        '{end}': function (el, ev) {
            this.gesture.destroy();
            this.options.model.attr('events', ev).attr('touches').lock(this.options.model.attr('events')).replace();
        },
        '{cancel}': function (el, ev) {
            this.options.model.attr('events', ev).attr('touches').replace();
        }
    });
});