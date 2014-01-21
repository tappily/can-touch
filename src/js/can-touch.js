define(['can-touch/control', 'can-touch/model'], function (C, M) {
    'use strict';
    return function (selector, options) {
        options.touchModel = new M();
        return new C(selector, options);
    };
});