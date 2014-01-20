define(['can/list', './touch'], function (l, T) {
    'use strict';
    return l.extend({
        reset: function(touches) {
            touches.forEach(function(touch, index, list) {
                list[index] = new T(touch);
            });
            this.replace(touches);
            return this;
        },
        update: function(touches) {
            this.forEach(function(it, i, list) {
                touches.forEach(function(touch, index, changelist) {
                    if(touch.identifier === it.attr('id')) {
                        it.update(touch);
                        changelist.splice(index, 1);
                    }
                });
            });
            return this;
        }
    });
});