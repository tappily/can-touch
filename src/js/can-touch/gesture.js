define(['can/control'], function (c) {
    'use strict';
    return c.extend({
        '{move}': function (el, ev) {
            if(this.options.preventDefault) {
                ev.preventDefault();
            }
            this.options.model.attr('events', ev).attr('touches').change(this.options.model.attr('events'));
        },
        '{model.touches} 0.point': function(el, ev, val, oval) {
            this.options.model.attr('area', ev.target.area());
        },
        '{model.touches} 1.point': function(el, ev,  val, oval) {
            this.options.model.attr('area', ev.target.area());
        },
    });
});