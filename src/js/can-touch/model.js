define(['can/map', 'can/map/attributes'], function (m) {
    'use strict';
    return m.extend({
        attributes: {
            phase: 'phase',
            x: 'number',
            y: 'number',
            implementsTouch: 'boolean'
        },
        convert: {
            phase: function (i) {
                return i;
            }
        }
    }, {
        start: function (touch) {
            this.removeAttr('x');
            this.removeAttr('y');
            console.log('identifier', touch.identifier);
            this.attr('xs', touch.pageX || touch.clientX);
            this.attr('ys', touch.pageY || touch.clientY);
        },
        move: function (event) {
            this.attr('x', event.pageX);
            this.attr('y', event.pageY);
        },
        update: function (event) {

            switch (event.type) {
                case 'touchstart':
                    this.start(event.originalEvent.touches[0]);
                    this.attr('phase', 'start');
                    break;
                case 'mousedown':
                    this.start(event);
                    this.attr('phase', 'start');
                    break;
                case 'touchend':
                    this.attr('phase', 'end');
                    break;
                case 'mouseup':
                    this.attr('phase', 'end');
                    break;
                case 'touchmove':
                    this.move(event.originalEvent.changedTouches[0]);
                    this.attr('phase', 'move');
                    break;
                case 'mousemove':
                    this.move(event);
                    this.attr('phase', 'move');
                    break;
                case 'touchcancel':
                    //if this options endOnCancel
                    this.attr('phase', 'cancel');
                    break;
            }
        }
    });
});