define(['jquery','can/control'], function ($, c) {
    'use strict';
    return c.extend({
        '{events.move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            this.options.model.attr('touch').update(ev);
            this.options.model.attr('touch.type', 'move');
            $(ev.target).trigger('onetouchmove', [this.options.model.attr('touch')]);
        },
        '{events.cancel}': function (el, ev) {
            this.options.model.attr('touch').cancel();
            this.options.model.attr('touch.type', 'cancel');
            $(ev.target).trigger('onetouchcancel', [this.options.model.attr('touch')]);
            this.options.model.removeAttr('touch');
        }
    });
});