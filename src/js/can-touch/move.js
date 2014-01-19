define(['can/control'], function ($C) {
  'use strict';
  return $C.extend({
    default: {
      model: null,
      move: null
    }
  }, {
    '{move}': function(el, ev) {
      this.options.model.update(ev);
    }
  });
});