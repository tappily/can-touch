define(['can/util/library', 'can/control', './touches', './move'], function (u, C, T, Mv) {
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
            threshold: 3,
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
        '{model} implementsTouch': function () {
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
                    this.mover = new Mv(this.element, this.options);
                    break;
                case 'end':
                    this.mover.destroy();
                    break;
            }
        },
        '{model.touches} length': function(el, ev, val, oval) {
            if(this.options.model.attr('combinedTouch.width') && (this.options.model.attr('combinedTouch.height'))) {

            }

            if(!val && oval === 1) {
                //console.log('tap');
            }

            console.log(arguments);
            //console.log(arguments);
        },
        '{model.touches} 0.point': function(el, ev) {
            this.options.model.attr('combinedTouch', ev.target.combine());
        },
        '{model.touches} 1.point': function(el, ev) {
            this.options.model.attr('combinedTouch', ev.target.combine());
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