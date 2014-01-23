define(['demo/model', 'demo/view', 'demo/control'], function (M, v, C) {
    'use strict';
    return function (selector) {
        return new C(selector, {
            view: v,
            model: new M()
        });
    };
});