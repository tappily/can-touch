define(['can-touch/control', 'can-touch/model', 'can-touch/gesture/model'], function (C, M, G) {
    'use strict';
    return function (selector, options) {
        options.touchModel = new M();
        options.gestureModel = new G();
        return new C(selector, options);
    };
});