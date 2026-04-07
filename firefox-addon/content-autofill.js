/**
 * Lightweight content script for right-click autofill typing.
 */
(function () {
  'use strict';

  if (window.__hrscrape2martAutofillLoaded) {
    return;
  }
  window.__hrscrape2martAutofillLoaded = true;

  const ELEMENT_NODE_TYPE = 1;
  const TEXT_NODE_TYPE = 3;
  const DOCUMENT_FRAGMENT_NODE_TYPE = 11;
  let lastContextTarget = null;
  let lastFocusedEditable = null;

  function isEditableInputType_(typeValue) {
    const type = String(typeValue || '').trim().toLowerCase();
    if (!type) return true;
    if (type === 'button' || type === 'checkbox' || type === 'color' || type === 'file') return false;
    if (type === 'hidden' || type === 'image' || type === 'radio' || type === 'range') return false;
    if (type === 'reset' || type === 'submit') return false;
    return true;
  }

  function asElementNode_(node) {
    if (!node) return null;
    if (node.nodeType === ELEMENT_NODE_TYPE) {
      return node;
    }
    if (node.nodeType === TEXT_NODE_TYPE || node.nodeType === DOCUMENT_FRAGMENT_NODE_TYPE) {
      if (node.parentElement) {
        return node.parentElement;
      }
      if (node.host && node.host.nodeType === ELEMENT_NODE_TYPE) {
        return node.host;
      }
    }
    return null;
  }

  function getDeepActiveElement_() {
    let current = document.activeElement || null;
    while (current && current.shadowRoot && current.shadowRoot.activeElement) {
      current = current.shadowRoot.activeElement;
    }
    return current;
  }

  function isEditableElement_(node) {
    const maybeElement = asElementNode_(node);
    if (!maybeElement) {
      return false;
    }
    const el = /** @type {HTMLElement} */ (maybeElement);
    const tagName = String(el.tagName || '').toUpperCase();
    if (tagName === 'TEXTAREA') return true;
    if (tagName === 'INPUT') {
      return isEditableInputType_(el.getAttribute('type') || '');
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function resolveEditableTargetFromNode_(node) {
    let cursor = asElementNode_(node);
    while (cursor) {
      if (isEditableElement_(cursor)) {
        return /** @type {HTMLElement} */ (cursor);
      }
      if (cursor.parentElement) {
        cursor = cursor.parentElement;
        continue;
      }
      const root = typeof cursor.getRootNode === 'function' ? cursor.getRootNode() : null;
      if (root && root.host && root.host.nodeType === ELEMENT_NODE_TYPE) {
        cursor = root.host;
        continue;
      }
      break;
    }
    return null;
  }

  function resolveEditableTarget_(node, event) {
    if (event && typeof event.composedPath === 'function') {
      const path = event.composedPath();
      if (Array.isArray(path)) {
        for (let i = 0; i < path.length; i++) {
          const byPath = resolveEditableTargetFromNode_(path[i]);
          if (byPath) {
            return byPath;
          }
        }
      }
    }

    const directTarget = resolveEditableTargetFromNode_(node);
    if (directTarget) {
      return directTarget;
    }

    const deepActive = getDeepActiveElement_();
    if (isEditableElement_(deepActive)) {
      return /** @type {HTMLElement} */ (deepActive);
    }
    if (isEditableElement_(document.activeElement)) {
      return /** @type {HTMLElement} */ (document.activeElement);
    }
    return null;
  }

  function getLiveTarget_() {
    if (lastContextTarget && lastContextTarget.isConnected && isEditableElement_(lastContextTarget)) {
      return lastContextTarget;
    }
    if (lastFocusedEditable && lastFocusedEditable.isConnected && isEditableElement_(lastFocusedEditable)) {
      return lastFocusedEditable;
    }
    const deepActive = getDeepActiveElement_();
    if (isEditableElement_(deepActive)) {
      return /** @type {HTMLElement} */ (deepActive);
    }
    if (isEditableElement_(document.activeElement)) {
      return /** @type {HTMLElement} */ (document.activeElement);
    }
    return null;
  }

  function rememberEditableTarget_(node, event, resetIfMissing) {
    const target = resolveEditableTarget_(node, event);
    if (target) {
      lastFocusedEditable = target;
      lastContextTarget = target;
      return;
    }
    if (resetIfMissing) {
      lastContextTarget = null;
    }
  }

  function emitInputEvent_(target, data, inputType) {
    try {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: data,
        inputType: inputType || 'insertText'
      }));
      return;
    } catch (error) {
      // Fallback for environments without InputEvent constructor support.
    }
    target.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
  }

  function clearTargetValue_(target) {
    if (!target) return;
    const tagName = String(target.tagName || '').toUpperCase();
    target.focus();

    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      target.value = '';
      emitInputEvent_(target, '', 'deleteContentBackward');
      return;
    }

    if (target.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.deleteContents();
      range.collapse(false);
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      emitInputEvent_(target, '', 'deleteContentBackward');
    }
  }

  function insertCharIntoContentEditable_(target, ch) {
    target.focus();
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, ch);
    } catch (error) {
      inserted = false;
    }
    if (inserted) {
      emitInputEvent_(target, ch, 'insertText');
      return;
    }

    const selection = window.getSelection();
    let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range || !target.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    range.deleteContents();
    range.insertNode(document.createTextNode(ch));
    range.collapse(false);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    emitInputEvent_(target, ch, 'insertText');
  }

  function insertCharIntoInput_(target, ch) {
    target.focus();
    const tagName = String(target.tagName || '').toUpperCase();
    if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
      return;
    }
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : target.value.length;
    try {
      if (typeof target.setRangeText === 'function') {
        target.setRangeText(ch, start, end, 'end');
      } else {
        const before = target.value.slice(0, start);
        const after = target.value.slice(end);
        target.value = before + ch + after;
      }
    } catch (error) {
      target.value = String(target.value || '') + ch;
    }
    emitInputEvent_(target, ch, 'insertText');
  }

  function sleep_(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function typeValueIntoTarget_(target, value, options) {
    const mode = String((options && options.mode) || 'replace').trim().toLowerCase();
    const minDelayMs = Number.isFinite(Number(options && options.minDelayMs))
      ? Math.max(0, Number(options.minDelayMs))
      : 20;
    const maxDelayMs = Number.isFinite(Number(options && options.maxDelayMs))
      ? Math.max(minDelayMs, Number(options.maxDelayMs))
      : 65;
    const text = String(value || '');
    const startedAt = Date.now();

    if (mode === 'replace') {
      clearTargetValue_(target);
    }

    const tagName = String(target.tagName || '').toUpperCase();
    const isInputLike = tagName === 'INPUT' || tagName === 'TEXTAREA';

    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      if (isInputLike) {
        insertCharIntoInput_(target, ch);
      } else if (target.isContentEditable) {
        insertCharIntoContentEditable_(target, ch);
      } else {
        throw new Error('Target is not editable anymore');
      }
      const delayMs = Math.floor(minDelayMs + Math.random() * (maxDelayMs - minDelayMs + 1));
      if (delayMs > 0) {
        await sleep_(delayMs);
      }
    }

    if (isInputLike) {
      target.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
    }

    return {
      success: true,
      mode: mode,
      typedLength: text.length,
      targetTag: tagName || 'UNKNOWN',
      elapsedMs: Date.now() - startedAt
    };
  }

  document.addEventListener('contextmenu', function onContextMenu(event) {
    rememberEditableTarget_(event.target, event, true);
  }, true);

  document.addEventListener('mousedown', function onMouseDown(event) {
    rememberEditableTarget_(event.target, event, false);
  }, true);

  document.addEventListener('focusin', function onFocusIn(event) {
    rememberEditableTarget_(event.target, event, false);
  }, true);

  browser.runtime.onMessage.addListener((request) => {
    if (!request || request.action !== 'autofillTypeIntoLastContextTarget') {
      return false;
    }
    return (async function runAutofill_() {
      const target = getLiveTarget_();
      if (!target) {
        return {
          success: false,
          error: 'No editable target from last right click'
        };
      }
      if (!isEditableElement_(target)) {
        return {
          success: false,
          error: 'Target is not editable'
        };
      }
      try {
        return await typeValueIntoTarget_(target, request.value, {
          mode: request.mode || 'replace',
          minDelayMs: request.minDelayMs,
          maxDelayMs: request.maxDelayMs
        });
      } catch (error) {
        return {
          success: false,
          error: String(error && error.message ? error.message : error),
          targetTag: String(target.tagName || '').toUpperCase()
        };
      }
    })();
  });
})();
