define(['can/list', './touch', 'can/map', './rect'], function (l, T, M, R) {
    'use strict';
    return l.extend({
        reset: function(touches) {
            touches.forEach(function(touch, index, list) {
                list[index] = new T(touch).start();
            });
            this.replace(touches);
            return this;
        },
        _modify: function(touches, locked) {
            this.forEach(function(it) {
                touches.forEach(function(touch, index, changelist) {
                    if(touch.identifier === it.attr('id')) {
                        it.update(touch);
                        if(locked > 0) {
                            it.end(touch);
                        }
                        changelist.splice(index, 1);
                    }
                });
            });
            return this;
        },
        area: function() {
            var startX = Infinity,
                startY = Infinity,
                endX = -Infinity,
                endY = -Infinity;

            this.forEach(function(e, i, list) {
                var area = e.area();
                startY = Math.min(startY, area.attr('top'));
                startX = Math.min(startX, area.attr('left'));
                endX = Math.max(endX, area.attr('right'));
                endY = Math.max(endY, area.attr('bottom'));
            });

            return new R().update(new M({ x:startX, y: startY }), new M({ x:endX, y: endY }));

        },
        lock: function(touches) {
            return this._modify(touches, 1);
        },
        change: function(touches) {
            return this._modify(touches, 0);
        }
    });
});