define(['demo/view', 'demo/control'], function(v, C) {
  'use strict';
  return function(selector) {
    return new C(selector, {
      view: v
    });
  };
});