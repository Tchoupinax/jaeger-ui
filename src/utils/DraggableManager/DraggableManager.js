// @flow

// Copyright (c) 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import _get from 'lodash/get';

import updateTypes from './update-types';
import type { DraggableBounds, DraggingUpdate } from './types';

const LEFT_MOUSE_BUTTON = 0;

type DraggableManagerOptions = {
  getBounds: (?string) => DraggableBounds,
  onMouseEnter?: DraggingUpdate => void,
  onMouseLeave?: DraggingUpdate => void,
  onMouseMove?: DraggingUpdate => void,
  onDragStart?: DraggingUpdate => void,
  onDragMove?: DraggingUpdate => void,
  onDragEnd?: DraggingUpdate => void,
  resetBoundsOnResize?: boolean,
  tag?: string,
};

export default class DraggableManager {
  // cache the last known DraggableBounds (invalidate via `#resetBounds())
  _bounds: ?DraggableBounds;
  _isDragging: boolean;
  // optional callbacks for various dragging events
  _onMouseEnter: ?(DraggingUpdate) => void;
  _onMouseLeave: ?(DraggingUpdate) => void;
  _onMouseMove: ?(DraggingUpdate) => void;
  _onDragStart: ?(DraggingUpdate) => void;
  _onDragMove: ?(DraggingUpdate) => void;
  _onDragEnd: ?(DraggingUpdate) => void;
  // whether to reset the bounds on window resize
  _resetBoundsOnResize: boolean;

  /**
   * Get the `DraggableBounds` for the current drag. The returned value is
   * cached until either `#resetBounds()` is called or the window is resized
   * (assuming `_resetBoundsOnResize` is `true`). The `DraggableBounds` defines
   * the range the current drag can span to. It also establishes the left offset
   * to adjust `clientX` by (from the `MouseEvent`s).
   */
  getBounds: (?string) => DraggableBounds;

  // convenience data
  tag: ?string;

  // handlers for integration with DOM elements
  handleMouseEnter: (SyntheticMouseEvent<any>) => void;
  handleMouseMove: (SyntheticMouseEvent<any>) => void;
  handleMouseLeave: (SyntheticMouseEvent<any>) => void;
  handleMouseDown: (SyntheticMouseEvent<any>) => void;

  constructor({ getBounds, tag, resetBoundsOnResize = true, ...rest }: DraggableManagerOptions) {
    this._handleMinorMouseEvent = this._handleMinorMouseEvent.bind(this);
    this._handleDragEvent = this._handleDragEvent.bind(this);

    this.handleMouseDown = this._handleDragEvent;
    this.handleMouseEnter = this._handleMinorMouseEvent;
    this.handleMouseMove = this._handleMinorMouseEvent;
    this.handleMouseLeave = this._handleMinorMouseEvent;
    this.resetBounds = this.resetBounds.bind(this);

    this.getBounds = getBounds;
    this.tag = tag;
    this._isDragging = false;
    this._bounds = undefined;
    this._resetBoundsOnResize = Boolean(resetBoundsOnResize);
    if (this._resetBoundsOnResize) {
      window.addEventListener('resize', this.resetBounds);
    }
    this._onMouseEnter = rest.onMouseEnter;
    this._onMouseLeave = rest.onMouseLeave;
    this._onMouseMove = rest.onMouseMove;
    this._onDragStart = rest.onDragStart;
    this._onDragMove = rest.onDragMove;
    this._onDragEnd = rest.onDragEnd;
  }

  _getBounds(): DraggableBounds {
    if (!this._bounds) {
      this._bounds = this.getBounds(this.tag);
    }
    return this._bounds;
  }

  _getPosition(clientX: number) {
    const { clientXLeft, maxValue, minValue, width } = this._getBounds();
    let x = clientX - clientXLeft;
    let value = x / width;
    if (minValue != null && value < minValue) {
      value = minValue;
      x = minValue * width;
    } else if (maxValue != null && value > maxValue) {
      value = maxValue;
      x = maxValue * width;
    }
    return { value, x };
  }

  _stopDragging() {
    window.removeEventListener('mousemove', this._handleDragEvent);
    window.removeEventListener('mouseup', this._handleDragEvent);
    const style = _get(document, 'body.style');
    if (style) {
      style.userSelect = null;
    }
    this._isDragging = false;
  }

  isDragging() {
    return this._isDragging;
  }

  dispose() {
    if (this._isDragging) {
      this._stopDragging();
    }
    if (this._resetBoundsOnResize) {
      window.removeEventListener('resize', this.resetBounds);
    }
    this._bounds = undefined;
    this._onMouseEnter = undefined;
    this._onMouseLeave = undefined;
    this._onMouseMove = undefined;
    this._onDragStart = undefined;
    this._onDragMove = undefined;
    this._onDragEnd = undefined;
  }

  resetBounds = function resetBounds() {
    this._bounds = undefined;
  };

  _handleMinorMouseEvent = function _handleMinorMouseEvent(event: SyntheticMouseEvent<any>) {
    const { button, clientX, type: eventType } = event;
    if (this._isDragging || button !== LEFT_MOUSE_BUTTON) {
      return;
    }
    let type = '';
    let handler: ?(DraggingUpdate) => void;
    if (eventType === 'mouseenter') {
      type = updateTypes.MOUSE_ENTER;
      handler = this._onMouseEnter;
    } else if (eventType === 'mouseleave') {
      type = updateTypes.MOUSE_LEAVE;
      handler = this._onMouseLeave;
    } else if (eventType === 'mousemove') {
      type = updateTypes.MOUSE_MOVE;
      handler = this._onMouseMove;
    } else {
      throw new Error(`invalid event type: ${eventType}`);
    }
    if (!handler) {
      return;
    }
    const { value, x } = this._getPosition(clientX);
    handler({
      event,
      type,
      value,
      x,
      manager: this,
      tag: this.tag,
    });
  };

  _handleDragEvent = function _handleDragEvent(event: SyntheticMouseEvent<any>) {
    const { button, clientX, type: eventType } = event;
    let type = '';
    let handler: ?(DraggingUpdate) => void;
    if (eventType === 'mousedown') {
      if (this._isDragging || button !== LEFT_MOUSE_BUTTON) {
        return;
      }
      window.addEventListener('mousemove', this._handleDragEvent);
      window.addEventListener('mouseup', this._handleDragEvent);
      const style = _get(document, 'body.style');
      if (style) {
        style.userSelect = 'none';
      }
      this._isDragging = true;

      type = updateTypes.DRAG_START;
      handler = this._onDragStart;
    } else if (eventType === 'mousemove') {
      if (!this._isDragging) {
        return;
      }
      type = updateTypes.DRAG_MOVE;
      handler = this._onDragMove;
    } else if (eventType === 'mouseup') {
      if (!this._isDragging) {
        return;
      }
      this._stopDragging();
      type = updateTypes.DRAG_END;
      handler = this._onDragEnd;
    } else {
      throw new Error(`invalid event type: ${eventType}`);
    }
    if (!handler) {
      return;
    }
    const { value, x } = this._getPosition(clientX);
    handler({
      event,
      type,
      value,
      x,
      manager: this,
      tag: this.tag,
    });
  };
}