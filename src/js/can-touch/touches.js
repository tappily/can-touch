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
        _modify: function(touches, locked) {
            this.forEach(function(it) {
                touches.forEach(function(touch, index, changelist) {
                    if(touch.identifier === it.attr('id')) {
                        it.update(touch);
                        if(locked === 1) {
                            it.end(touch);
                        }
                        changelist.splice(index, 1);
                    }
                });
            });
            return this;
        },
        lock: function(touches) {
            return this._modify(touches, 1);
        },
        update: function(touches) {
            return this._modify(touches, 0);
        }
    });
});