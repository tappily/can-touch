define(['./gesture/model', './gesture/control'], function (M, C) {
    'use strict';
    return function(element, options) {
        options.gestureModel = new M();
        return new C(element, options);
    };
});