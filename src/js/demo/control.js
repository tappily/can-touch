define(['can/control', 'can-touch'], function(C, t) {
  'use strict';
  return C.extend({
    defaults: {
      view: null
    }
  }, {
    init: function() {
      this.options.touch = t(this.element);
      this.on();
      this.element.append(this.options.view(this.options.touch.options.model));
    }
  });
});