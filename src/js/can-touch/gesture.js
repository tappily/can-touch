define(['jquery','can/control'], function ($, c) {
    'use strict';
    return c.extend({
        '{events.move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            var touch = this.options.model.attr('oneTouch');
            if(touch) {
                touch.update(ev);
                $(ev.target).trigger('onetouchmove', [touch]);
            }
        },
        '{events.cancel}': function (el, ev) {
            var touch = this.options.model.attr('oneTouch');
            if(touch) {
                touch.cancel();
                $(ev.target).trigger('onetouchcancel', [this.options.model.removeAttr('oneTouch')]);
            }
        }
    });
});
