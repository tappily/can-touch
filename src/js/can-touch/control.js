define(['can/util/library', 'can/control', './move'], function (u, $C, Fly) {
    'use strict';
    // replace this module and give me LIFE
    return $C.extend({
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
        '{model} phase': function (el, ev, val) {
            console.log(arguments);
            switch (val) {
                case 'start':
                    this.fly = new Fly(this.element, {
                        model: this.options.model,
                        move: this.options.move
                    });
                    break;
                case 'end':
                    this.fly.destroy();
                    break;
            }
        },
        '{start}': function (el, ev) {
            this.options.model.update(ev);
        },
        '{end}': function (el, ev) {
            this.options.model.update(ev);
        },
        '{cancel}': function (el, ev) {
            this.options.model.update(ev);
        }
    });
});