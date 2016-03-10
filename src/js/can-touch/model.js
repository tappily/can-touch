define(['jquery', 'can/map', './touch', 'can/map/define'], function ($, m, T) {
    'use strict';
    return m.extend({
        define: {
            onetouch: {
                set: function(ev) {
                    console.log('setting one touch');
                    return new T(ev);
                },
                value: {}
            }
        }
    }, {});
});
