// Original code: https://jsfiddle.net/KAngel7/8phy2z6e

function RulerDrag(props) {
    props = props || {};
    var config = {
        callback: props.callback,
        initValue: props.initValue !== undefined ? props.initValue : 50,
        width: props.width !== undefined ? props.width : 80,
        height: props.height !== undefined ? props.height : 480,
        step: props.step !== undefined ? props.step : 1,
        pixelStep: props.pixelStep !== undefined ? props.pixelStep : 18,
        direction: props.direction || 'vertical',
        className: props.className || '',
        rulerRange: props.rulerRange || [0, 20],
        textStyle: props.textStyle,
        weight: props.weight !== undefined ? props.weight : 6,
        type: props.type,
        limit: props.limit || [155, 165],
        smooth: props.smooth !== undefined ? props.smooth : true,
        dragSensitivity: props.dragSensitivity !== undefined ? props.dragSensitivity : 1,
        momentumSensitivity: props.momentumSensitivity !== undefined ? props.momentumSensitivity : 0.12,
        momentumFriction: props.momentumFriction !== undefined ? props.momentumFriction : 3,
        maxMomentumSpeed: props.maxMomentumSpeed !== undefined ? props.maxMomentumSpeed : 0.01,
        tickColor: props.tickColor || '#6f6f6f',
        activeTickColor: props.activeTickColor || '#9b9b9b'
    };
    if (config.direction === 'vertical') {
        var temp = config.width;
        config.width = config.height;
        config.height = temp;
    }
    this.data = {
        showRange: Math.floor(config.width / (config.pixelStep * 10)) + 3
    };
    this.state = {
        value: config.initValue,
        unit: null,
        isMovingMomen: false
    };
    this.config = config;
    this.dragging = false;
    this.lastChangeValue = 0;
    this.dragMomen = this.dragMomen();
}
RulerDrag.prototype.render = function () {
    this.mainDiv = document.createElement("div");
    this.mainDiv.className = 'RulerDrag';
    if (this.config.direction === 'vertical') {
        this.mainDiv.style.width = this.config.height + 'px';
        this.mainDiv.style.height = this.config.width + 'px';
    } else {
        this.mainDiv.style.width = this.config.width + 'px';
        this.mainDiv.style.height = this.config.height + 'px';
    }
    this.mainDiv.innerHTML = '<div class="rulerValue">' + this.state.value.toFixed(1) + '</div>';
    this.mainDiv.innerHTML += this.drawMainSvg();
    this.addEvents();
    if (this.config.type === 'height') {
        return this.makeHeightTab();
    } else if (this.config.type === 'weight') {
        return this.makeWeightTab();
    }
    this.moveRuler(0);
    return this.mainDiv;
}
RulerDrag.prototype.drawMainSvg = function () {
    var transformDirection = this.config.direction === 'vertical' ?
        'transform="translate(0, ' + this.config.width + ') rotate(-90)"' : '';
    return '\
      <svg\
        class="rulerDragSvg"\
        width="100%"\
        height="100%"\
      >\
        <g ' + transformDirection + '>\
          ' + this.drawTicks() + '\
          ' + this.drawDownArrow() + '\
        </g>\
      </svg>';
}
RulerDrag.prototype.drawDownArrow = function () {
    return '\
      <g class="rulerDownArrow" transform="translate(' + (this.config.width / 2) + ', 55)">\
        <path d="M 0,5 -10,25 10,25 z" style="fill: #ff5656;"></path>\
      </g>';
}
RulerDrag.prototype.drawTicks = function () {
    var ticks = '';
    var numbers = '';
    for (var i = 0; i < this.data.showRange * 10; i++) {
        if (i % 10 === 0) {
            if (this.config.direction === 'vertical') {
                numbers += '\
            <text\
              class="rulerNumber"\
              transform="rotate(90)"\
              y="' + (-i * this.config.pixelStep + 5) + '"\
              x="0"\
            >\
            </text>';
            } else {
                numbers += '\
            <text\
              class="rulerNumber"\
              x="' + (i * this.config.pixelStep + 5) + '"\
              y="0"\
            >\
            </text>';
            }
        }
        var tick = '\
        <line\
          class="rulerTick' + (i % 5 === 0 ? ' big' : '') + '"\
          x1="' + (i * this.config.pixelStep) + '"\
          y1="' + (-(i % 5 === 0 ? 40 : 25)) + '"\
          x2="' + (i * this.config.pixelStep) + '"\
          y2="0"\
          stroke="' + this.config.tickColor + '"\
        />';
        ticks += tick;
    }
    return '\
      <g class="movingG">\
        <g transform="translate(-5, -60)">\
          ' + numbers + '\
        </g>\
        <g>\
          ' + ticks + '\
        </g>\
      </g>';
}
RulerDrag.prototype.clampValue = function (value) {
    if (!this.config.limit || this.config.limit.length < 2) {
        return value;
    }
    var min = this.config.limit[0];
    var max = this.config.limit[1];
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return value;
    }
    if (this.state.unit === "inch") {
        min = min / 2.54;
        max = max / 2.54;
    } else if (this.state.unit === "pounds") {
        min = min * 2.20462262;
        max = max * 2.20462262;
    }
    if (min > max) {
        var temp = min;
        min = max;
        max = temp;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}
RulerDrag.prototype.moveRuler = function (delta) {
    this.state.value += delta;
    var unclampedValue = this.state.value;
    this.state.value = this.clampValue(this.state.value);
    this.hitLimit = unclampedValue !== this.state.value;
    if (this.config.smooth) {
        this.showValue = this.state.value;
    } else {
        this.showValue = Math.floor(this.state.value * 10 / this.config.step) * this.config.step / 10;
    }
    if (this.config.callback) {
        this.config.callback({
            value: this.state.value,
            showValue: this.showValue
        });
    }
    this.updateByValue();
}
RulerDrag.prototype.updateByValue = function () {
    var movingG = this.mainDiv.getElementsByClassName('movingG')[0];
    // Each step unit = 10 ticks. Each tick = pixelStep pixels.
    // So 1 step = 10 * pixelStep pixels.
    var pixelsPerUnit = 10 * this.config.pixelStep / this.config.step;
    var center = this.config.width / 2;

    // The fractional part determines the sub-tick offset within the current step.
    // We use a modulo that handles negatives correctly.
    var fracInStep = ((this.showValue % this.config.step) + this.config.step) % this.config.step;
    var nearestNumber = Math.round((this.showValue - fracInStep) / this.config.step);

    // The nearest number's tick should be at center - fracInStep * pixelsPerUnit.
    // The half-range offset: the first number-text sits at index 0 of the number array,
    // which corresponds to the leftmost visible step label.
    var halfRange = Math.floor((this.data.showRange - 1) / 2);

    // Translate: place the (halfRange)-th step tick group at center, shifted by fraction.
    var translateX = Math.round(center - (halfRange * 10 + fracInStep * 10 / this.config.step) * this.config.pixelStep);
    movingG.setAttribute("transform", "translate(" + translateX + ", " + this.config.height + ")");

    // Update step labels
    var rulerNumbers = this.mainDiv.getElementsByClassName('rulerNumber');
    for (var i = 0; i < rulerNumbers.length; i++) {
        rulerNumbers[i].innerHTML = (nearestNumber - halfRange + i) * this.config.step;
    }

    // Highlight the tick closest to the center indicator
    var rulerTicks = this.mainDiv.getElementsByClassName('rulerTick');
    var indexActiveTick = Math.round(halfRange * 10 + fracInStep * 10 / this.config.step);
    indexActiveTick = Math.max(0, Math.min(indexActiveTick, rulerTicks.length - 1));
    if (this.lastIndexRedTick !== undefined && this.lastIndexRedTick < rulerTicks.length) {
        rulerTicks[this.lastIndexRedTick].setAttribute('stroke', this.config.tickColor);
    }
    if (indexActiveTick < rulerTicks.length) {
        rulerTicks[indexActiveTick].setAttribute('stroke', this.config.activeTickColor);
    }
    this.lastIndexRedTick = indexActiveTick;

    this.mainDiv.getElementsByClassName('rulerValue')[0].innerHTML = this.showValue;
    if (this.config.type === 'height' || this.config.type === 'weight') {
        this.mainDiv.parentElement.getElementsByClassName('value')[0].innerHTML = this.showValue;
    }
}
RulerDrag.prototype.startMoveFrame = function () {
    var last = 0;
    var render = (function (now) {
        if (last === 0) {
            last = now;
            requestAnimationFrame(render);
        } else {
            var deltaTime = now - last;
            this.moveRuler(this.lastSpeed * deltaTime);
            if (this.hitLimit) {
                this.state.isMovingMomen = false;
                return;
            }
            var acceleration = this.config.weight * this.config.momentumFriction / 100000;
            this.lastSpeed += this.lastSpeed > 0 ? -acceleration : acceleration;
            last = now;
            if (Math.abs(this.lastSpeed) <= (acceleration * 1.2)) {
                this.state.isMovingMomen = false;
            } else {
                if (this.state.isMovingMomen) {
                    requestAnimationFrame(render);
                }
            }
        }
    }).bind(this);
    requestAnimationFrame(render);
}
RulerDrag.prototype.moveRulerMomen = function (momen, isMobile) {
    var minMomen = isMobile ? 6 : 24;
    if (!momen || Math.abs(momen) < minMomen) {
        return;
    }
    this.state.isMovingMomen = true;
    var speed = momen * this.config.dragSensitivity * this.config.momentumSensitivity *
        this.config.step / this.config.pixelStep / 1000;
    var maxSpeed = Math.abs(this.config.maxMomentumSpeed);
    if (speed > maxSpeed) {
        speed = maxSpeed;
    } else if (speed < -maxSpeed) {
        speed = -maxSpeed;
    }
    this.lastSpeed = speed;
    this.startMoveFrame();
}
RulerDrag.prototype.addEvents = function () {
    this.mainDiv.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.mainDiv.addEventListener('touchstart', this.onTouchDown.bind(this));
}
RulerDrag.prototype.onMouseDown = function (e) {
    if (!this.dragging) {
        this.dragging = true;
        this.onMouseMoveEvent = this.onMouseMove.bind(this);
        this.onMouseUpEvent = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.onMouseMoveEvent);
        document.addEventListener('mouseup', this.onMouseUpEvent);
        this.dragMomen.start(e.clientX, e.clientY, e.timeStamp);
        this.state.isMovingMomen = false;
        this.lastChangeValue = 0;
    }
    e.preventDefault();
}
RulerDrag.prototype.onMouseMove = function (e) {
    var mouseMoveValue;
    if (this.config.direction === 'vertical') {
        mouseMoveValue = e.movementY;
    } else {
        mouseMoveValue = -e.movementX;
    }
    var changeValue = mouseMoveValue * this.config.step / (this.config.pixelStep * 10) * this.config.dragSensitivity;
    if (changeValue * this.lastChangeValue < 0) {
        this.dragMomen.start(e.clientX, e.clientY, e.timeStamp);
    }
    this.moveRuler(changeValue);
    this.lastChangeValue = changeValue;
    e.preventDefault();
}
RulerDrag.prototype.onMouseUp = function (e) {
    if (this.dragging) {
        this.dragging = false;
        var momen;
        if (this.config.direction === 'vertical') {
            momen = this.dragMomen.end(e.clientX, e.clientY, e.timeStamp).y;
        } else {
            momen = this.dragMomen.end(e.clientX, e.clientY, e.timeStamp).x;
        }
        this.moveRulerMomen(momen, false);
        document.removeEventListener('mousemove', this.onMouseMoveEvent);
        document.removeEventListener('mouseup', this.onMouseUpEvent);
    }
    e.preventDefault();
}
RulerDrag.prototype.onTouchDown = function (e) {
    if (!this.dragging) {
        this.dragging = true;
        this.onTouchMoveEvent = this.onTouchMove.bind(this);
        this.onTouchUpEvent = this.onTouchUp.bind(this);
        document.addEventListener('touchmove', this.onTouchMoveEvent);
        document.addEventListener('touchend', this.onTouchUpEvent);
        this.lastTouchClientX = e.touches[0].clientX;
        this.lastTouchClientY = e.touches[0].clientY;
        this.dragMomen.start(this.lastTouchClientX, this.lastTouchClientY, e.timeStamp);
        this.state.isMovingMomen = false;
        this.lastChangeValue = 0;
    }
    e.preventDefault();
}
RulerDrag.prototype.onTouchMove = function (e) {
    var movement;
    if (this.config.direction === 'vertical') {
        movement = e.touches[0].clientY - this.lastTouchClientY;
    } else {
        movement = -e.touches[0].clientX + this.lastTouchClientX;
    }
    var changeValue = movement * this.config.step / (this.config.pixelStep * 10) * this.config.dragSensitivity;
    if (changeValue * this.lastChangeValue < 0) {
        this.dragMomen.start(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp);
    }
    this.moveRuler(changeValue);
    this.lastChangeValue = changeValue;
    this.lastTouchClientX = e.touches[0].clientX;
    this.lastTouchClientY = e.touches[0].clientY;
}
RulerDrag.prototype.onTouchUp = function (e) {
    if (this.dragging) {
        this.dragging = false;
        var momen;
        if (this.config.direction === 'vertical') {
            momen = this.dragMomen.end(this.lastTouchClientX, this.lastTouchClientY, e.timeStamp).y;
        } else {
            momen = this.dragMomen.end(this.lastTouchClientX, this.lastTouchClientY, e.timeStamp).x;
        }
        this.moveRulerMomen(momen, true);
        document.removeEventListener('touchmove', this.onTouchMoveEvent);
        document.removeEventListener('touchend', this.onTouchUpEvent);
    }
    e.preventDefault();
}
RulerDrag.prototype.dragMomen = function () {
    var howMuch = 40; // change this for greater or lesser momentum
    var minDrift = 1; // minimum drift after a drag move
    var dXa = [0];
    var dYa = [0];
    var dTa = [0];
    var dragMomentum = {};
    dragMomentum.start = function (Xa, Ya, Ta) {
        dXa = Xa;
        dYa = Ya;
        dTa = Ta;
    }; // END dragmomentum.start()
    dragMomentum.end = function (Xb, Yb, Tb) {
        var Xa = dXa;
        var Ya = dYa;
        var Ta = dTa;
        var dDist = Math.sqrt(Math.pow(Xa - Xb, 2) + Math.pow(Ya - Yb, 2));
        var dTime = Tb - Ta;
        var dSpeed = dDist / dTime;
        dSpeed = Math.round(dSpeed * 100) / 100;
        var distX = Math.abs(Xa - Xb);
        var directionX = (Xa - Xb) > 0 ? 1 : -1;
        var directionY = (Ya - Yb) > 0 ? -1 : 1;
        var distY = Math.abs(Ya - Yb);
        var dVelX = (minDrift + (Math.round(distX * dSpeed * howMuch / (distX + distY))));
        var dVelY = (minDrift + (Math.round(distY * dSpeed * howMuch / (distX + distY))));
        return {
            x: dVelX * directionX,
            y: dVelY * directionY
        };
        // $('#' + elemId).animate({ left: newLocX, top: newLocY }, 700, easeType);
    };
    return dragMomentum;
}
// Export to window for access
window.RulerDrag = RulerDrag;
