define(['jquery', 'can/util/library', 'can/control', './gesture'], function ($, u, C, Gesture) {
    'use strict';

    var events = ('ontouchstart' in this) ? {
            start: 'touchstart',
            move: 'touchmove',
            end: 'touchend',
            cancel: 'touchcanel'
        } : {
            start: 'mousedown',
            move: 'mousemove',
            end: 'mouseup',
            cancel: 'mouseleave'
        };

    return C.extend({
        defaults: {
            threshold: 30,
            model: null,
            preventDefault: false,
            status: 'touch',
            events: events
        }
    }, {
        '{model} {status}': function (el, ev, val) {
            if (val) {
                this.gesture = new Gesture(this.element, this.options);
            } else if (this.gesture) {
                this.gesture.destroy();
            }
        },
        '{events.start}': function (el, ev) {
            this.options.model.attr('touch', ev);
            $(ev.target).trigger('onetouchstart', [this.options.model.attr('touch')]);
        },
        '{events.end}': function (el, ev) {
            $(ev.target).trigger('onetouchend', [this.options.model.removeAttr('touch')]);
        }
    });
});