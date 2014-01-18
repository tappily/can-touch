define(['can/control'], function ($C) {
  'use strict';
  return $C.extend({
    default: {
      model: null
    }
  }, {
    'mousemove': function(el, ev) {
      this.options.model.update(ev);
    },
    'touchmove': function(el, ev) {
      this.options.model.update(ev);
    }
  });
});