define(['can/control'], function (c) {
    'use strict';
    return c.extend({
        '{move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            this.options.touchModel.changeTouches('move', ev);
        }
    });
});