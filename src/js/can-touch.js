define(['can-touch/control', 'can-touch/map'], function ($TouchControl, $TouchMap) {
    'use strict';
    return function (selector, options) {
        options.map = new $TouchMap();
        return new $TouchControl(selector, options);
    };
});
