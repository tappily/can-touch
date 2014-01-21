define(['can/map', './rect', 'can/map/attributes'], function(m, R){
    'use strict';
    return m.extend({

    }, {
        init: function() {
            this.attr('rect', new R());
            return this;
        }
    });
});