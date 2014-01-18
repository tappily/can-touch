define(['can-touch/control', 'can-touch/model'], function (C, M) {
    'use strict';
    return function(selector) {
      return new C(selector, {
        model: new M()
      });
    };
});