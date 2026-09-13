// Runs INSIDE an artboard's sandboxed iframe, injected alongside
// mark-agent.js (see injectPreviewAgent in packages/canvas/src/server/serve.ts).
// Same sandbox, same opaque origin, same restriction: this script's only
// channel to the parent canvas is postMessage, and it never reaches for
// window.parent.document or anything else across the origin boundary.
//
// Its one job: restart this artboard's CSS animations on request, so the
// canvas's "Replay" button can play them again without reloading the iframe
// — reloading would also replay them, but it would throw away anything else
// about the page's current state (a mark-mode listener's hover outline, any
// script-driven state the artboard itself sets up), for a feature that does
// not need any of that thrown away to work.
(function () {
  "use strict";

  function replayAnimations() {
    var elements = document.getElementsByTagName("*");
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (getComputedStyle(el).animationName === "none") continue;
      var previous = el.style.animation;
      // Setting animation to "none", forcing layout to read it back, then
      // restoring the previous value is the standard way to make a browser
      // forget an animation's progress and start it again from 0% — the
      // reflow in between is what makes the restart actually take effect
      // rather than being coalesced away with the property that undoes it.
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = previous;
    }
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.source !== "beziera-canvas" || data.type !== "replay-animations") return;
    replayAnimations();
  });
})();
