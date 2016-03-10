define(['can', 'can/control', 'can-touch', 'animation-frame', 'can/util/batch'], function (can, C, t, AFrame) {
    'use strict';
    return C.extend({
        defaults: {
            view: null,
            model: null
        }
    }, {
        init: function () {
            AFrame.shim();

            this.animation = new AFrame();

            this.animation.request(can.proxy(this.animate, this));

            this.options.touchControl = t(this.element, {
                preventDefault: true,
                sticky: true
            });

            this.element.append(this.options.view(this.options.model));
        },
        animate: function() {
            can.batch.stop(true, true);
            this.animation.request(can.proxy(this.animate, this));
        },
        ' onetouchmove': function(el, ev, touch) {
            console.log('touch move');
            this.options.model.attr({
                area: touch.area(),
                type: touch.attr('type')
            });
        }
    });
});
