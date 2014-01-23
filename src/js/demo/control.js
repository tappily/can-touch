define(['can/control', 'can-touch'], function (C, t) {
    'use strict';
    return C.extend({
        defaults: {
            view: null,
            model: null
        }
    }, {
        init: function () {
            this.options.touchControl = t(this.element, {
                preventDefault: true
            });

            this.on();
            this.element.append(this.options.view(this.options.model));
        },
        ' onetouchmove': function(el, ev, touch) {
            this.options.model.attr({
                area: touch.area(),
                type: touch.attr('type')
            });

        }
    });
});