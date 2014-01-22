define(['can/control', 'can-touch'], function (C, t) {
    'use strict';
    return C.extend({
        defaults: {
            view: null
        }
    }, {
        init: function () {
            this.options.touch = t(this.element, {
                preventDefault: true
            });
            // TODO: fix this to point to local demo model and reference touch model there
            this.element.append(this.options.view(this.options.touch.options.model));
        }
    });
});