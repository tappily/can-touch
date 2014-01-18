define(['can/control', './move'], function ($C, Fly) {
  'use strict';
  // replace this module and give me LIFE
  return $C.extend({
    default: {
      model: null,
      endOnCancel: false,
      cancelWithin: 0
    }
  }, {
    init: function() {

    },
    '{state} change': function() {
      console.log(arguments);
    },
    '{model} phase': function(el, ev, val) {
      console.log(arguments);
      switch(val) {
        case 'start':
          this.fly = new Fly(this.element, {
            model: this.options.model
          }); break;
        case 'end':
          this.fly.destroy(); break;
      }
    },
    'mousedown': function(el, ev) {
      this.options.model.update(ev);
    },
    'mouseup': function(el, ev) {
      this.options.model.update(ev);
    },
    'touchstart': function(el, ev) {
      this.options.model.update(ev);
    },
    'touchcancel': function(el, ev) {
      this.options.model.update(ev);
    },
    'touchend': function(el, ev) {
      this.options.model.update(ev);
    }
  });
});