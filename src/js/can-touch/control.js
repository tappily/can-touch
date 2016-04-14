define(['jquery', 'can/util/library', 'can/control', './gesture'], function ($jQuery, $can, $control, Gesture) {
    'use strict';

    var events = ('ontouchstart' in window) ? {
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

        return $control.extend({
            defaults: {
                threshold: 30,
                map: {},
                preventDefault: false,
                status: 'touch',
                events: events,
                sticky: false
            }
        }, {
            init: function() {
                if(this.options.sticky) {
                    delete this.options.events.cancel;
                }
            },
            '{map} {status}': function (el, ev, val) {
                if (val) {
                    this.gesture = new Gesture(this.element, this.options);
                } else if (this.gesture) {
                    this.gesture.destroy();
                }
            },
            '{events.start}': function (el, ev) {
                this.options.map.attr('touch', ev);
                $jQuery(ev.target).trigger('onetouchstart', [this.options.map.attr('touch')]);
            },
            '{events.end}': function (el, ev) {
                $jQuery(ev.target).trigger('onetouchend', [this.options.map.removeAttr('touch')]);
            }
        });
});
