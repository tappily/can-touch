define(['can/util/library', 'can/control', './touches', './move', './gesture/control'], function (u, C, T, Mv, G) {
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
            touchModel: null,
            gestureModel: null,
            endOnCancel: false,
            cancelWithin: 0,
            preventDefault: false,
            implementsTouch: ('ontouchstart' in window)
        }
    }, {
        init: function () {
            this.options.touchModel.attr('implementsTouch', this.options.implementsTouch);
        },
        '{touchModel} implementsTouch': function (el, ev, val) {
            if (this.options.implementsTouch) {
                u.extend(this.options, this.constructor.touchEvents);
            } else {
                u.extend(this.options, this.constructor.mouseEvents);
            }
            this.on();
        },
        '{touchModel} type': function (el, ev, val) {
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
            this.options.touchModel.changeTouches('start', ev);
        },
        '{end}': function (el, ev) {
            this.options.touchModel.changeTouches('end', ev);
        },
        '{cancel}': function (el, ev) {
            this.options.touchModel.changeTouches('cancel', ev);
        }
    });
});