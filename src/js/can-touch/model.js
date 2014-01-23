define(['can/map', './touches', 'can/util/library', 'can/map/attributes'], function (m, Tl, c) {
    'use strict';
    return m.extend({
        attributes: {
            events: 'events'
        },
        convert: {
            'events': function(ev) {
                ev = ev.originalEvent ? ev.originalEvent : ev;
                if (ev.changedTouches) {
                    ev = ev.changedTouches;
                } else {
                    ev.identifier = 0;
                }
                return c.makeArray(ev);
            }
        }
    }, {
        init: function () {
            this.attr('touches', new Tl());
            return this;
        }
    });
});