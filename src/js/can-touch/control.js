define(['can/util/library', 'can/control', './touches', './move', './gesture'], function (u, C, T, Mv, G) {
    'use strict';
    // replace this module and give me LIFE
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
            model: null,
            endOnCancel: false,
            cancelWithin: 0,
            preventDefault: false,
            implementsTouch: ('ontouchstart' in window)
        }
    }, {
        init: function () {
            this.options.model.attr('implementsTouch', this.options.implementsTouch);
        },
        '{model} implementsTouch': function (el, ev, val) {
            if (this.options.implementsTouch) {
                u.extend(this.options, this.constructor.touchEvents);
            } else {
                u.extend(this.options, this.constructor.mouseEvents);
            }
            this.on();
        },
        '{model} type': function (el, ev, val) {
            switch (val) {
                case 'start':
                    this.gesture = new G(this.element, this.options);
                    this.mover = new Mv(this.element, this.options);
                    break;
                case 'end':
                    this.gesture.destroy();
                    this.mover.destroy();
                    break;
            }
        },
        '{start}': function (el, ev) {
            this.options.model.changeTouches('start', ev);
        },
        '{end}': function (el, ev) {
            this.options.model.changeTouches('end', ev);
        },
        '{cancel}': function (el, ev) {
            this.options.model.changeTouches('cancel', ev);
        }
    });
});