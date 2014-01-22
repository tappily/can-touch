define(['can/map', './touches', 'can/util/library', 'can/map/attributes'], function (m, Tl, c) {
    'use strict';
    return m.extend({
        attributes: {

        }
    }, {
        init: function () {
            this.attr('touches', new Tl());
            this.on();
            return this;
        },
        changeTouches: function (type, ev) {
            // support mouse events
            ev = ev.originalEvent ? ev.originalEvent : ev;
            if (ev.changedTouches) {
                ev = ev.changedTouches;
            } else {
                ev.identifier = 0;
            }

            var list = this.attr('touches'),
                changeList = c.makeArray(ev);

            switch (type) {
                case 'start':
                    list.reset(changeList);
                    break;
                case 'end':
                    list.lock(changeList).replace();
                    break;
                case 'cancel':
                    list.replace();
                    break;
                case 'move':
                    list.update(changeList);
                    break;
            }

            this.attr('type', type);
        }
    });
});