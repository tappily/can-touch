define(['can/list', './touch', 'can/map', './rect'], function (l, T, M, R) {
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
        combine: function() {
            var startX = Infinity,
                startY = Infinity,
                endX = -Infinity,
                endY = -Infinity;

            this.forEach(function(e, i, list) {
                startY = Math.min(startY, e.attr('rect.top'));
                startX = Math.min(startX, e.attr('rect.left'));
                endX = Math.max(endX, e.attr('rect.right'));
                endY = Math.max(endY, e.attr('rect.bottom'));
            });

            var rect = new R().update(new M({ x:startX, y: startY }), new M({ x:endX, y: endY }));
            return rect; //TODO: causing listener to fail????
        },
        lock: function(touches) {
            return this._modify(touches, 1);
        },
        update: function(touches) {
            return this._modify(touches, 0);
        }
    });
});