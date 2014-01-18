define(['can/map', 'can/map/attributes'], function(model) {
    'use strict';
    return model.extend({
        attributes: {
            message: 'safeString'
        },
        convert: {
            safeString: function(s) {
                return String(s);
            }
        }
    });
});