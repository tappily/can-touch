define(['jquery','can/control'], function ($, c) {
    'use strict';
    return c.extend({
        '{events.move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            this.options.model.attr('touch').update(ev);
            $(ev.target).trigger('onetouchmove', [this.options.model.attr('touch')]);
        },
        '{events.cancel}': function (el, ev) {
            this.options.model.attr('touch').cancel();
            $(ev.target).trigger('onetouchcancel', [this.options.model.removeAttr('touch')]);
        }
    });
});