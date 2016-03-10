define(['jquery', 'can/util/library', 'can/control', './gesture'], function ($, u, C, Gesture) {
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

        return C.extend({
            defaults: {
                threshold: 30,
                map: null,
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
                console.log('map touch is', this.options.map.attr('touch'));
            },
            '{map} {status}': function (el, ev, val) {
                if (val) {
                    this.gesture = new Gesture(this.element, this.options);
                } else if (this.gesture) {
                    this.gesture.destroy();
                }
            },
            '{events.start}': function (el, ev) {
                console.log('model sets touch on', this.options.map);

                console.log('touch mapped as', this.options.map.attr('touch'));

                this.options.map.attr('touch', ev);

                console.log('touch mapped as', this.options.map.attr('touch'));

                $(ev.target).trigger('onetouchstart', [this.options.map.attr('touch')]);
            },
            '{events.end}': function (el, ev) {
                $(ev.target).trigger('onetouchend', [this.options.map.removeAttr('touch')]);
            }
        });
});
