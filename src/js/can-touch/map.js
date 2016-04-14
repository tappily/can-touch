define(['can/map', './touch', 'can/map/define'], function ($map, $Touch) {
    'use strict';
    return $map.extend({
        define: {
            touch: {
                Type: $Touch,
                value: {}
            }
        }
    });
});
