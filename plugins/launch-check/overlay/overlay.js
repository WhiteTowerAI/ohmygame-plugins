// Runs on the phone, first in the game's page, as OhMyGame's Launch check
// serves it on the local network. It reports what the phone sees to the
// computer that serves the game: errors, frame rate, load and first-frame
// times, audio state, the viewport and the safe area. It changes nothing in
// the game and shows a small line in a corner so the person knows it's there.
(function () {
  "use strict";
  if (window.__launchCheck) return;
  window.__launchCheck = true;
  var ROUTE = "/__launch-check/report";
  var id;
  try {
    id = sessionStorage.getItem("launch-check-id");
    if (!id) sessionStorage.setItem("launch-check-id", (id = Math.random().toString(36).slice(2, 12)));
  } catch (error) {
    id = Math.random().toString(36).slice(2, 12);
  }
  var errors = [];
  var fps = { current: 0, low: 0 };
  var firstFrameMs;
  var contexts = [];

  function remember(message) {
    errors.push(String(message).slice(0, 300));
    if (errors.length > 30) errors.shift();
    soon();
  }
  window.addEventListener("error", function (event) {
    var where = event.filename ? " (" + event.filename.split("/").pop() + ":" + event.lineno + ")" : "";
    if (event.message) remember(event.message + where);
    else if (event.target && event.target !== window) remember("Failed to load " + (event.target.src || event.target.href || event.target.tagName));
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    remember("Unhandled rejection: " + (reason && reason.message ? reason.message : String(reason)));
  });
  var consoleError = console.error;
  console.error = function () {
    try {
      remember(Array.prototype.map.call(arguments, function (part) { return part && part.message ? part.message : String(part); }).join(" "));
    } catch (error) {}
    return consoleError.apply(console, arguments);
  };

  // Audio contexts the game uses, to tell whether sound was unlocked by a tap.
  // Noted as they're used rather than by replacing the constructor, which
  // would break games that extend it.
  ["AudioContext", "webkitAudioContext"].forEach(function (name) {
    var Original = window[name];
    if (typeof Original !== "function") return;
    ["createGain", "createBufferSource", "createOscillator", "decodeAudioData", "resume"].forEach(function (method) {
      var original = Original.prototype[method];
      if (typeof original !== "function") return;
      Original.prototype[method] = function () {
        if (contexts.indexOf(this) < 0 && contexts.length < 10) contexts.push(this);
        return original.apply(this, arguments);
      };
    });
  });

  // Frames each second, and the lowest second since the page opened.
  var frames = 0;
  var windowStart = 0;
  function tick(now) {
    if (firstFrameMs === undefined) firstFrameMs = Math.round(now);
    if (!windowStart) windowStart = now;
    frames += 1;
    if (now - windowStart >= 1000) {
      fps.current = Math.round((frames * 1000) / (now - windowStart));
      // The first seconds load the game; count the low from the third second.
      if (now > 3000) fps.low = fps.low ? Math.min(fps.low, fps.current) : fps.current;
      frames = 0;
      windowStart = now;
      badge();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function safeArea() {
    var probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    (document.body || document.documentElement).appendChild(probe);
    var style = getComputedStyle(probe);
    var area = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
    probe.remove();
    return area;
  }

  function loadMs() {
    var entry = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    return entry && entry.loadEventEnd ? Math.round(entry.loadEventEnd) : undefined;
  }

  function report() {
    var memory = performance.memory && performance.memory.usedJSHeapSize;
    var body = {
      id: id,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1, orientation: screen.orientation ? screen.orientation.type : undefined },
      safeArea: safeArea(),
      secureContext: window.isSecureContext,
      touch: (navigator.maxTouchPoints || 0) > 0,
      fps: fps,
      loadMs: loadMs(),
      firstFrameMs: firstFrameMs,
      audio: contexts.map(function (context) { return context.state; }),
      memoryMb: memory ? memory / 1048576 : undefined,
      errors: errors,
    };
    try {
      fetch(ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "same-origin" }).catch(function () {});
    } catch (error) {}
  }
  var pending;
  function soon() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = undefined;
      report();
      badge();
    }, 300);
  }
  setInterval(report, 2000);
  addEventListener("load", report);
  addEventListener("pagehide", report);

  var line;
  function badge() {
    if (!document.body) return;
    if (!line) {
      line = document.createElement("div");
      line.setAttribute("aria-hidden", "true");
      line.style.cssText = "position:fixed;left:calc(4px + env(safe-area-inset-left));bottom:calc(4px + env(safe-area-inset-bottom));z-index:2147483647;pointer-events:none;font:11px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:4px";
      document.body.appendChild(line);
    }
    line.textContent = "Launch check · " + fps.current + " fps · " + errors.length + (errors.length === 1 ? " error" : " errors");
  }
})();
