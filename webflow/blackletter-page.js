/* ============================================================
   BLACKLETTER — page script (single source, served via jsDelivr)

   Loaded by the tiny before-</body> snippet in Webflow. Push to
   GitHub, purge the jsDelivr cache (links in before-body.html),
   hard-refresh — no more copying code into Webflow.

   Structure:
     1. hero + paper curtain, section intros, footer loop (main)
     2. shop cards conveyor / ritual shuffle
     3. subscribe marquee + form button
     4. footer reveal
   ============================================================ */

import PaperCurtainEffect from "https://cdn.jsdelivr.net/gh/saad-azez/Blackletter@abfefdc/public/BlackletterPaperCurtain.mjs";

if (window.gsap && window.ScrollTrigger) {
  main();
} else {
  console.warn("[Blackletter] GSAP/ScrollTrigger missing — animations disabled.");
}

function main() {
  gsap.registerPlugin(ScrollTrigger);

  /* ============================================================
     1a-0. SMOOTH SCROLL (Lenis)
     One continuous, eased scroll value for the whole page so the
     scroll-driven 3D (the castle vortex) and every ScrollTrigger
     reveal move on an interpolated scroll instead of the browser's
     discrete wheel steps — that stepping is why the castle animation
     reads smoothly on a trackpad locally but janky on a mouse wheel.

     It is PAUSED the instant any paper curtain / section-snap covers
     the screen (see the blackletter:paper-transition handler below),
     so it never fights those components' programmatic window.scrollTo
     glides. Wheel only — touch stays native so mobile and the paper
     snap transitions keep their exact feel and low-power devices
     aren't taxed. Fully disabled under prefers-reduced-motion.
     ============================================================ */
  let lenis = null;
  (function initSmoothScroll() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    // Loaded from the JS bundle (not the before-body snippet) so updating the
    // scroll setup only needs a jsDelivr purge, never a Webflow paste.
    import("https://cdn.jsdelivr.net/npm/lenis@1.1.20/+esm").then((mod) => {
      const Lenis = mod && (mod.default || mod.Lenis);
      if (typeof Lenis !== "function") return;
      lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
      });
      window.__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }).catch(() => { lenis = null; });
  })();

  /* ============================================================
     SCROLL DIAGNOSTICS (TEMPORARY — remove once resolved)
     Logs why the scroll feels the way it does. Prints a compact
     [scroll-debug] "sample" line once per second WHILE scrolling:

       fps         — frame rate that second. <~45 while scrolling =
                     the jank is heavy 3D dropping frames, NOT the
                     scroll library (Lenis can't fix a slow paint).
       scrollEvents/avgDeltaPx/maxDeltaPx — cadence. Small deltas
                     (~2-10px) over many events = smooth/interpolated.
                     Big deltas (~30-120px) over few events = stepped
                     wheel scroll (Lenis not smoothing this stretch).
       lenis       — "inactive" means it never loaded (import blocked /
                     reduced-motion). on:false means it loaded but is
                     PAUSED (a paper transition is holding it).
       paperActive — true means a curtain/snap is covering, so Lenis is
                     intentionally paused; if this is true during the
                     jank, the castle is animating inside a snap glide.
       heroTop     — the castle section's rect.top; watch it move.

     Disable by setting window.__BLACKLETTER_SCROLL_DEBUG__ = false.
     ============================================================ */
  (function scrollDebug() {
    if (window.__BLACKLETTER_SCROLL_DEBUG__ === false) return;
    const TAG = "[scroll-debug]";
    const log = (...a) => console.log(TAG, ...a);

    log("boot", {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      hasGSAP: !!window.gsap,
      hasScrollTrigger: !!window.ScrollTrigger,
      dpr: window.devicePixelRatio,
      viewport: window.innerWidth + "x" + window.innerHeight,
      ua: navigator.userAgent,
    });

    // Did Lenis actually load? (it imports asynchronously)
    setTimeout(() => {
      const L = window.__lenis;
      if (L) log("lenis ACTIVE", { isStopped: !!L.isStopped, duration: L.options && L.options.duration });
      else log("lenis NOT active — import blocked, reduced-motion, or disabled");
    }, 2500);

    // One-time inventory of the 3D islands and whether they've mounted.
    setTimeout(() => {
      const islands = Array.prototype.map.call(
        document.querySelectorAll("code-island"),
        (el, i) => ({
          i,
          host: (el.parentElement && el.parentElement.className) || "?",
          hasShadow: !!el.shadowRoot,
          hasCanvas: !!(el.shadowRoot && el.shadowRoot.querySelector("canvas")),
        })
      );
      log("code-islands", islands.length ? islands : "(none found)");
    }, 1800);

    // Paper transitions pause Lenis; log each so we can see if they fire
    // constantly (which would keep scroll un-smoothed).
    let paperActive = false;
    window.addEventListener("blackletter:paper-transition", (e) => {
      const d = e.detail || {};
      paperActive = d.phase === "start";
      log("paper-transition", d.phase, "towards:", d.towards);
    });

    // Cheap continuous frame counter for FPS.
    let frames = 0;
    (function raf() { frames++; requestAnimationFrame(raf); })();

    // Scroll cadence accumulators.
    let scrollEvents = 0, sumDelta = 0, maxDelta = 0, lastY = window.scrollY, lastScrollT = 0;
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      const dy = Math.abs(y - lastY);
      lastY = y; scrollEvents++; sumDelta += dy; if (dy > maxDelta) maxDelta = dy;
      lastScrollT = performance.now();
    }, { passive: true });

    function heroTop() {
      const el = document.querySelector(".bg-3d") ||
                 document.querySelector(".hero-section") ||
                 document.querySelector("code-island");
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    }

    let winStart = performance.now(), winFrames = 0;
    const intervalId = setInterval(() => {
      const now = performance.now();
      const secs = (now - winStart) / 1000 || 1;
      const fps = Math.round((frames - winFrames) / secs);
      const scrolledRecently = now - lastScrollT < 1100;
      if (scrolledRecently) {
        const L = window.__lenis;
        log("sample", {
          fps,
          scrollEvents,
          avgDeltaPx: scrollEvents ? +(sumDelta / scrollEvents).toFixed(1) : 0,
          maxDeltaPx: maxDelta,
          scrollY: Math.round(window.scrollY),
          heroTop: heroTop(),
          lenis: L ? { on: !L.isStopped, vel: +(Number(L.velocity) || 0).toFixed(1), anim: Math.round(Number(L.animatedScroll) || 0) } : "inactive",
          paperActive,
          experienceStarted: document.body.classList.contains("experience-started"),
        });
      }
      winStart = now; winFrames = frames; scrollEvents = 0; sumDelta = 0; maxDelta = 0;
    }, 1000);
    window.__scrollDebugStop = () => { clearInterval(intervalId); log("stopped"); };

    log("ready — scroll the page; one 'sample' line prints per second while scrolling");
  })();

  /* ============================================================
     1a. SHARED UTILS — defined once, used by every section
     ============================================================ */

  const PAPER_DURATION = 2.2;
  const FRAME_SCALE_START = 0.97;
  const FRAME_SCALE_END = 1;
  const BG3D_COUNTER_SCALE_START = FRAME_SCALE_END / FRAME_SCALE_START;
  const BG3D_COUNTER_SCALE_END = 1;
  const IS_MOBILE = window.matchMedia("(max-width: 767px)").matches;

  // The 3D code islands re-measure on window resize; nudge them after
  // layout-changing moments (curtain reveal, experience start, fonts).
  function refresh3DLayout() {
    window.dispatchEvent(new Event("resize"));
  }

  function refresh3DLayoutBurst() {
    requestAnimationFrame(refresh3DLayout);
    setTimeout(refresh3DLayout, 250);
    setTimeout(refresh3DLayout, 700);
  }

  function toHex(cssValue, fallback) {
    if (!cssValue) return fallback;
    if (/^#[0-9A-Fa-f]{3,8}$/.test(cssValue)) return cssValue;
    try {
      const el = document.createElement("div");
      document.head.appendChild(el);
      el.style.color = cssValue;
      const rgb = getComputedStyle(el).color;
      document.head.removeChild(el);
      const m = rgb.match(/(\d+)/g);
      if (m && m.length >= 3) {
        return "#" + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {}
    return fallback;
  }

  function getCSSColor(cssVar, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    return toHex(raw, fallback);
  }

  // Splits an element's text into chars or words. Idempotent per element.
  function splitText(element, type) {
    if (!element || element.dataset.split === "true") return [];
    const targets = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      const parts = type === "words" ? node.nodeValue.split(/(\s+)/) : Array.from(node.nodeValue);
      parts.forEach((part) => {
        if (!part || /^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        const wrap = document.createElement("span");
        const inner = document.createElement("span");
        wrap.className = type === "words" ? "split-word-wrap" : "split-char-wrap";
        inner.className = type === "words" ? "split-word" : "split-char";
        inner.textContent = part;
        wrap.appendChild(inner);
        fragment.appendChild(wrap);
        targets.push(inner);
      });
      node.parentNode.replaceChild(fragment, node);
    });
    element.dataset.split = "true";
    return targets;
  }

  // Two-row rolling button label. Idempotent per button; returns the word
  // rows so intros can animate them in.
  function setupButtonHover(buttonEl) {
    if (!buttonEl || buttonEl.dataset.hoverReady === "true") return null;
    const textNodes = Array.from(buttonEl.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
    );
    const labelText = textNodes.map((node) => node.nodeValue.trim()).join(" ");
    if (!labelText) return null;
    textNodes.forEach((node) => node.remove());

    const label = document.createElement("span");
    const currentRow = document.createElement("span");
    const nextRow = document.createElement("span");
    label.className = "button-hover-label";
    currentRow.className = "button-text-row button-text-current";
    nextRow.className = "button-text-row button-text-next";

    [currentRow, nextRow].forEach((row) => {
      labelText.split(/\s+/).forEach((word, index, arr) => {
        const wrap = document.createElement("span");
        const inner = document.createElement("span");
        wrap.className = "button-word-wrap";
        inner.className = "button-word";
        inner.textContent = word;
        wrap.appendChild(inner);
        row.appendChild(wrap);
        if (index < arr.length - 1) row.appendChild(document.createTextNode(" "));
      });
    });
    label.appendChild(currentRow);
    label.appendChild(nextRow);
    buttonEl.prepend(label);

    const currentWords = gsap.utils.toArray(currentRow.querySelectorAll(".button-word"));
    const nextWords = gsap.utils.toArray(nextRow.querySelectorAll(".button-word"));
    gsap.set(currentWords, { yPercent: 0 });
    gsap.set(nextWords, { yPercent: 115 });

    const hoverTl = gsap.timeline({ paused: true, defaults: { duration: 0.5, ease: "power3.inOut" } });
    hoverTl.to(currentWords, { yPercent: -115, stagger: 0.04 }, 0);
    hoverTl.to(nextWords, { yPercent: 0, stagger: 0.04 }, 0.04);

    buttonEl.addEventListener("mouseenter", () => hoverTl.play());
    buttonEl.addEventListener("mouseleave", () => hoverTl.reverse());
    buttonEl.dataset.hoverReady = "true";

    return { currentWords, nextWords, hoverTl };
  }

  /* ============================================================
     1b. INTRO SYSTEM
     Each section registers ONE paused timeline. It plays exactly
     once, the first time the section reaches the viewport — via
     normal scroll or via a paper-boundary snap (the snap fires a
     scroll event, so the same trigger catches both). No scrubbing:
     scrubbed animations freeze inside curtain-gated sections
     because scroll never moves there.

     Paper gate: the page glides to the next section while the
     sheet still covers the viewport, which fires these triggers
     too early. Intros triggered during a paper transition are
     held and only play once the sheet has fully cleared.
     ============================================================ */

  let paperTransitionActive = false;
  let paperFailsafeTimer = 0;
  const heldIntros = [];

  function flushHeldIntros() {
    while (heldIntros.length) heldIntros.shift()();
  }

  window.addEventListener("blackletter:paper-transition", (event) => {
    const phase = event.detail && event.detail.phase;
    clearTimeout(paperFailsafeTimer);
    if (phase === "start") {
      paperTransitionActive = true;
      // Lenis is intentionally NOT paused here: the transitions now drive the
      // cross-boundary scroll through Lenis themselves (lenis.scrollTo), so the
      // whole page turn stays one smooth, interpolated motion. Pausing it would
      // freeze that glide.
      // Never hold reveals hostage if an "end" gets lost somehow.
      paperFailsafeTimer = setTimeout(() => {
        paperTransitionActive = false;
        flushHeldIntros();
      }, 10000);
    } else {
      paperTransitionActive = false;
      flushHeldIntros();
    }
  });

  function registerIntro(sectionEl, timeline, start = "top 70%") {
    if (!sectionEl || !timeline) return;
    let played = false;

    const tryPlay = () => {
      if (played) return;
      // Hidden sections (before the experience starts) wait their turn.
      if (sectionEl.getBoundingClientRect().height < 2) return;
      if (paperTransitionActive) {
        if (heldIntros.indexOf(tryPlay) === -1) heldIntros.push(tryPlay);
        return;
      }
      played = true;
      timeline.play();
    };

    ScrollTrigger.create({
      trigger: sectionEl,
      start,
      onEnter: tryPlay,
      onEnterBack: tryPlay,
    });
  }

  /* ============================================================
     1c. HERO + PAPER CURTAIN — load reveal and "Start the
         Experience" page turn
     ============================================================ */

  function initHero() {
    const canvas = document.querySelector("#above-canvas");
    const canvasWrap = document.querySelector(".page-canvas-wrap");
    const heroSection = document.querySelector(".hero-section");
    const startSection = document.querySelector(".start-section");
    const frame = document.querySelector(".frame");
    const logo = document.querySelector(".blackletter-logo");
    const heading = document.querySelector(".hero-heading");
    const para = document.querySelector(".para");
    const button = document.querySelector(".start-section [data-paper-trigger='true']") ||
                   document.querySelector("[data-paper-trigger='true']");
    const decorLines = gsap.utils.toArray(".decor-line");
    const decorImages = gsap.utils.toArray(".decor-line img");
    const bg3d = document.querySelector(".bg-3d");

    const scriptureCard = document.querySelector(".scripture-card");
    const scriptureHead = scriptureCard ? scriptureCard.querySelector(".scripture-head") : null;
    const scriptureLetter = scriptureCard ? scriptureCard.querySelector(".scripture-letter") : null;
    const scripturePara = scriptureCard ? scriptureCard.querySelector(".scripture-para") : null;
    const makersButton = scriptureCard ? scriptureCard.querySelector(".button.makers") : null;

    if (startSection) startSection.style.visibility = "hidden";
    if (!heroSection || !frame || !button) return;

    const paperOne = getCSSColor("--paper-color-one", "#252525");
    const paperTwo = getCSSColor("--paper-color-two", "#ffffff");

    let paperEffect = null;

    function pausePaperEffect() {
      if (!paperEffect) return;
      try {
        if (window.gsap && window.gsap.ticker) {
          window.gsap.ticker.remove(paperEffect._tickHandler);
        } else if (paperEffect._raf) {
          cancelAnimationFrame(paperEffect._raf);
          paperEffect._raf = null;
        }
      } catch (e) {}
    }

    function resumePaperEffect() {
      if (!paperEffect) return;
      try { paperEffect._startTicker(); } catch (e) {}
    }

    function sizeCanvas() {
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (paperEffect) {
        paperEffect.canvasSize = { width: w, height: h };
        try { paperEffect._resize(); } catch (e) {}
      } else {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
      }
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvas, 150);
    });

    function setPaperColors(color, bg) {
      if (!paperEffect) return;
      try { paperEffect.setColors(color, bg); } catch (err) {}
    }

    const logoChars = splitText(logo, "chars");
    const headingChars = splitText(heading, "chars");
    const paraWords = splitText(para, "words");
    const buttonHover = setupButtonHover(button);

    const scriptureHeadChars = splitText(scriptureHead, "chars");
    const scriptureParaWords = splitText(scripturePara, "words");
    const makersButtonHover = setupButtonHover(makersButton);

    if (canvas && canvasWrap) {
      sizeCanvas();
      try {
        paperEffect = new PaperCurtainEffect(canvas, {
          color: paperTwo,
          background: paperOne,
          style: "theatre",
          duration: 2.0,
          showLoader: true,
          loaderColor: paperOne,
          grainOpacity: 1.0,
          warmTint: 0.6,
        });
        sizeCanvas();
      } catch (err) {}
    }

    /* ---------- initial states ---------- */
    gsap.set(frame, { autoAlpha: 0, y: 24, scale: FRAME_SCALE_START });
    gsap.set(bg3d, { autoAlpha: 0, scale: BG3D_COUNTER_SCALE_START, transformOrigin: "center center" });
    gsap.set(logoChars, { yPercent: 120, opacity: 0 });
    gsap.set(decorLines, { scaleX: 0, autoAlpha: 0, transformOrigin: "center center" });
    gsap.set(decorImages, { opacity: 0, scale: 0.9 });
    gsap.set(headingChars, { yPercent: 115, opacity: 0 });
    gsap.set(paraWords, { yPercent: 100, opacity: 0 });
    gsap.set(button, { autoAlpha: 0, y: 18, scale: 0.96, pointerEvents: "none" });
    if (buttonHover) {
      gsap.set(buttonHover.currentWords, { yPercent: 115, opacity: 0 });
      gsap.set(buttonHover.nextWords, { yPercent: 115, opacity: 1 });
    }

    if (scriptureCard) {
      gsap.set(scriptureCard, { autoAlpha: 0, y: 40, scale: 0.96 });
      gsap.set(scriptureHeadChars, { yPercent: 115, opacity: 0 });
      gsap.set(scriptureLetter, { opacity: 0, y: 30, scale: 0.85, rotation: -6 });
      gsap.set(scriptureParaWords, { yPercent: 100, opacity: 0 });
      if (makersButton) {
        gsap.set(makersButton, { autoAlpha: 0, y: 18, scale: 0.96, pointerEvents: "none" });
      }
      if (makersButtonHover) {
        gsap.set(makersButtonHover.currentWords, { yPercent: 115, opacity: 0 });
        gsap.set(makersButtonHover.nextWords, { yPercent: 115, opacity: 1 });
      }
    }

    /* ---------- hero timelines ---------- */
    function animateHeroIn() {
      refresh3DLayoutBurst();
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete() {
          gsap.set(button, { pointerEvents: "auto" });
          refresh3DLayoutBurst();
        }
      });
      tl.to(frame, { autoAlpha: 1, y: 0, scale: FRAME_SCALE_END, duration: 0.8 });
      tl.to(bg3d, { scale: BG3D_COUNTER_SCALE_END, duration: 0.8 }, "<");
      tl.to(bg3d, { autoAlpha: 1, duration: 1 }, "-=0.55");
      tl.to(logoChars, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.035 }, "-=0.65");
      tl.to(decorLines, { scaleX: 1, autoAlpha: 1, duration: 0.75, stagger: 0.1 }, "-=0.45");
      tl.to(decorImages, { opacity: 1, scale: 1, duration: 0.6, stagger: 0.08 }, "-=0.65");
      tl.to(headingChars, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.025 }, "-=0.45");
      tl.to(paraWords, { yPercent: 0, opacity: 1, duration: 0.6, stagger: 0.035 }, "-=0.25");
      tl.to(button, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 }, "-=0.2");
      if (buttonHover) {
        tl.to(buttonHover.currentWords, { yPercent: 0, opacity: 1, duration: 0.55, stagger: 0.045 }, "-=0.38");
      }
    }

    function animateHeroOut(onComplete) {
      const tl = gsap.timeline({
        defaults: { ease: "power3.in" },
        onComplete() {
          if (onComplete) onComplete();
        }
      });
      tl.to(button, { autoAlpha: 0, y: -18, scale: 0.96, duration: 0.3 });
      tl.to(paraWords, { yPercent: -70, opacity: 0, duration: 0.4, stagger: { each: 0.02, from: "end" } }, "-=0.1");
      tl.to(headingChars, { yPercent: -80, opacity: 0, duration: 0.45, stagger: { each: 0.015, from: "end" } }, "-=0.2");
      tl.to(decorImages, { opacity: 0, scale: 0.92, duration: 0.3, stagger: 0.04 }, "-=0.3");
      tl.to(decorLines, { scaleX: 0, autoAlpha: 0, duration: 0.35, stagger: 0.06 }, "-=0.25");
      tl.to(logoChars, { yPercent: -100, opacity: 0, duration: 0.45, stagger: { each: 0.025, from: "end" } }, "-=0.3");
      tl.to(frame, { autoAlpha: 0, y: -24, scale: FRAME_SCALE_START, duration: 0.4 }, "-=0.35");
      tl.to(bg3d, { scale: BG3D_COUNTER_SCALE_START, duration: 0.4 }, "<");
      tl.to(bg3d, { autoAlpha: 0, duration: 0.45 }, "-=0.3");
    }

    function animateScriptureIn() {
      if (!scriptureCard) return;
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete() {
          if (makersButton) gsap.set(makersButton, { pointerEvents: "auto" });
        }
      });
      tl.to(scriptureCard, { autoAlpha: 1, y: 0, scale: 1, duration: 1.0 });
      tl.to(scriptureHeadChars, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.03 }, "-=0.7");
      tl.to(scriptureLetter, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.4)" }, "-=0.5");
      tl.to(scriptureParaWords, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.035 }, "-=0.6");
      if (makersButton) {
        tl.to(makersButton, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 }, "-=0.25");
      }
      if (makersButtonHover) {
        tl.to(makersButtonHover.currentWords, { yPercent: 0, opacity: 1, duration: 0.55, stagger: 0.045 }, "-=0.4");
      }
    }

    /* ---------- preload + load-in reveal ----------
       The loader is genuinely gated: it does NOT auto-complete. The reveal
       only fires once EVERY page asset is in the browser (images decoded,
       3D models + textures fetched, the hero 3D canvas actually mounted)
       plus fonts and the window load event. A safety cap guarantees the
       user is never trapped if a single request hangs. */
    const PRELOAD_SAFETY_MS = 20000;

    function isImageUrl(url) {
      return /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(url);
    }

    // Every URL-ish string anywhere in a code-island's data-props: 3D model
    // files (.glb/.gltf/.bin), backdrops, textures — whatever the island
    // will load. Recursive so nested prop objects are covered too.
    function urlsFromProps(value, out) {
      if (typeof value === "string") {
        const v = value.trim();
        if (v && !v.startsWith("data:") &&
            (/^https?:\/\//i.test(v) ||
             /\.(glb|gltf|bin|jpe?g|png|webp|gif|avif|svg|ktx2?|hdr|exr|basis|mp4|webm)(\?|$)/i.test(v))) {
          out.push(v);
        }
      } else if (value && typeof value === "object") {
        Object.keys(value).forEach((k) => urlsFromProps(value[k], out));
      }
      return out;
    }

    // Force-load and decode an <img> already in the DOM (including lazy ones
    // in not-yet-visible sections). Operating on the real element means zero
    // cache/CORS mismatch with what the browser eventually paints.
    function decodeImageEl(img) {
      return new Promise((resolve) => {
        // Nothing to wait for on an image with no source.
        if (!img.getAttribute("src") && !img.currentSrc && !img.getAttribute("srcset")) {
          resolve();
          return;
        }
        try { if (img.loading === "lazy") img.loading = "eager"; } catch (e) {}
        const done = () => resolve();
        if (img.complete && img.naturalWidth > 0) {
          img.decode ? img.decode().then(done, done) : done();
          return;
        }
        if (img.decode) {
          img.decode().then(done, () => {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        } else {
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }
      });
    }

    // Warm a raw URL into cache. Images decode; everything else (3D models
    // especially) is streamed so the bar can track real bytes and never
    // looks frozen on a big .glb. onFrac reports 0..1 for that one file.
    function warmUrl(url, onFrac) {
      return new Promise((resolve) => {
        if (isImageUrl(url)) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const done = () => resolve();
          img.onload = () => (img.decode ? img.decode().then(done, done) : done());
          img.onerror = done;
          img.src = url;
          return;
        }
        fetch(url, { credentials: "omit" }).then((res) => {
          const len = +(res.headers.get("content-length") || 0);
          if (!res.ok || !res.body || !len) {
            return res.arrayBuffer().then(() => resolve(), () => resolve());
          }
          const reader = res.body.getReader();
          let received = 0;
          const pump = () => reader.read().then(({ done, value }) => {
            if (done) { resolve(); return; }
            received += value.length;
            if (onFrac) onFrac(received / len);
            pump();
          }).catch(() => resolve());
          pump();
        }).catch(() => resolve());
      });
    }

    // Wait until the hero's 3D scene has actually mounted a sized canvas in
    // its shadow root — i.e. the WebGL scene is live, not just its bytes cached.
    function waitForHeroSceneCanvas() {
      return new Promise((resolve) => {
        const island = (bg3d && bg3d.querySelector("code-island")) ||
                       document.querySelector("code-island");
        if (!island) { resolve(); return; }
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          const root = island.shadowRoot;
          const canvas = root && root.querySelector("canvas");
          if ((canvas && canvas.width > 1 && canvas.height > 1) || tries > 120) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    }

    // Build the full task list: one per page <img>, one per unique code-island
    // asset URL, one per inline background image, plus the readiness gates.
    function buildPreloadTasks() {
      const tasks = [];
      const seen = new Set();

      document.querySelectorAll("img").forEach((img) => {
        tasks.push(() => decodeImageEl(img));
      });

      document.querySelectorAll("code-island").forEach((island) => {
        let props;
        try { props = JSON.parse(island.dataset.props || "{}"); } catch (e) { return; }
        urlsFromProps(props, []).forEach((url) => {
          if (seen.has(url)) return;
          seen.add(url);
          tasks.push((onFrac) => warmUrl(url, onFrac));
        });
      });

      document.querySelectorAll('[style*="background-image"]').forEach((el) => {
        const m = /url\((['"]?)([^'")]+)\1\)/i.exec(el.style.backgroundImage || "");
        if (!m) return;
        const url = m[2].trim();
        if (!url || url.startsWith("data:") || seen.has(url)) return;
        seen.add(url);
        tasks.push((onFrac) => warmUrl(url, onFrac));
      });

      // Readiness gates (binary): fonts, the full window load, the live scene.
      if (document.fonts && document.fonts.ready) {
        tasks.push(() => new Promise((res) => document.fonts.ready.then(res, res)));
      }
      tasks.push(() => new Promise((res) => {
        if (document.readyState === "complete") res();
        else window.addEventListener("load", res, { once: true });
      }));
      tasks.push(() => waitForHeroSceneCanvas());

      return tasks;
    }

    function preloadEverything(onProgress, onDone) {
      const tasks = buildPreloadTasks();
      const total = tasks.length || 1;
      const fractions = new Array(total).fill(0);
      let remaining = total;
      let finished = false;

      function report() {
        let sum = 0;
        for (let i = 0; i < total; i++) sum += fractions[i];
        onProgress(Math.min(1, sum / total));
      }

      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(safety);
        onProgress(1);
        onDone();
      }

      const safety = setTimeout(finish, PRELOAD_SAFETY_MS);

      if (!tasks.length) { finish(); return; }

      tasks.forEach((task, i) => {
        const onFrac = (f) => {
          const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
          if (clamped > fractions[i]) { fractions[i] = clamped; report(); }
        };
        const settle = () => {
          fractions[i] = 1;
          report();
          if (--remaining <= 0) finish();
        };
        Promise.resolve()
          .then(() => task(onFrac))
          .then(settle, settle);
      });

      report();
    }

    if (paperEffect && canvasWrap) {
      gsap.set(canvasWrap, { autoAlpha: 1, background: paperOne, pointerEvents: "none" });
      setPaperColors(paperTwo, paperOne);

      preloadEverything(
        (progress) => paperEffect.setLoadProgress(progress),
        () => {
          paperEffect.in();
          gsap.delayedCall(PAPER_DURATION, () => {
            if (startSection) startSection.style.visibility = "visible";
            gsap.set(canvasWrap, { autoAlpha: 0 });
            pausePaperEffect();
            animateHeroIn();
          });
        }
      );
    } else {
      if (startSection) startSection.style.visibility = "visible";
      animateHeroIn();
    }

    /* ---------- "Start the Experience" page turn ---------- */
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (!paperEffect) return;

      gsap.set(button, { pointerEvents: "none" });

      animateHeroOut(() => {
        if (startSection) startSection.style.display = "none";
        if (canvasWrap) gsap.set(canvasWrap, { autoAlpha: 0 });

        paperEffect.setShowLoader(false);
        paperEffect.setGrainOpacity(0);
        setPaperColors(paperOne, paperTwo);
        paperEffect.state.progress = 0;

        resumePaperEffect();
        if (canvasWrap) gsap.set(canvasWrap, { autoAlpha: 1, pointerEvents: "none" });
        paperEffect.in();

        gsap.delayedCall(PAPER_DURATION, () => {
          if (canvasWrap) gsap.set(canvasWrap, { autoAlpha: 0 });
          if (startSection) startSection.remove();
          if (paperEffect) {
            paperEffect.destroy();
            paperEffect = null;
          }
          document.body.classList.add("experience-started");
          // Sections just gained real height — recompute every trigger.
          ScrollTrigger.refresh();
          refresh3DLayoutBurst();
          animateScriptureIn();
        });
      });
    });
  }

  /* ============================================================
     1d. SECTION INTROS
     ============================================================ */

  function initMakersSection() {
    const section = document.querySelector(".makers-section");
    if (!section) return;
    const bgImg = section.querySelector(".bg-img");
    const scriptureWrap = section.querySelector(".makers-scripture");
    const scriptureCard = section.querySelector(".scripture-card");
    const discord = section.querySelector(".discord");
    const rocket = section.querySelector(".rocket-man");
    const makersBtn = section.querySelector(".button.makers");

    setupButtonHover(makersBtn);

    gsap.set(section, { backgroundColor: "#ffffff" });
    if (bgImg) gsap.set(bgImg, { autoAlpha: 0, scale: 1.04 });
    if (scriptureWrap) gsap.set(scriptureWrap, { autoAlpha: 0, y: 30 });
    if (scriptureCard) gsap.set(scriptureCard, { y: 20, scale: 0.98 });
    if (discord) gsap.set(discord, { autoAlpha: 0, x: IS_MOBILE ? 0 : 80 });
    if (rocket) gsap.set(rocket, { autoAlpha: 0, x: IS_MOBILE ? 60 : 120 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
    if (bgImg) tl.to(bgImg, { autoAlpha: 1, scale: 1, duration: 1 }, 0);
    if (scriptureWrap) tl.to(scriptureWrap, { autoAlpha: 1, y: 0, duration: 1 }, 0.35);
    if (scriptureCard) tl.to(scriptureCard, { y: 0, scale: 1, duration: 1 }, 0.35);
    if (discord) tl.to(discord, { autoAlpha: 1, x: 0, duration: 1 }, 0.55);
    if (rocket) tl.to(rocket, { autoAlpha: 1, x: 0, duration: 1 }, 0.65);

    /* rocket idle float + pointer tracking, enabled once the intro ends */
    if (rocket) {
      tl.eventCallback("onComplete", () => {
        let idle = startIdleFloat();
        let tracking = false;
        let resumeCall = null;

        const xTo = gsap.quickTo(rocket, "x", { duration: 0.8, ease: "power3.out" });
        const yTo = gsap.quickTo(rocket, "y", { duration: 0.8, ease: "power3.out" });
        const rTo = gsap.quickTo(rocket, "rotation", { duration: 0.8, ease: "power3.out" });

        function startIdleFloat() {
          return gsap.to(rocket, {
            y: "-=10",
            rotation: 1.5,
            duration: 2.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1
          });
        }

        section.addEventListener("mouseenter", () => {
          tracking = true;
          if (resumeCall) { resumeCall.kill(); resumeCall = null; }
          if (idle) idle.pause();
        });

        section.addEventListener("mousemove", (e) => {
          if (!tracking) return;
          const rect = section.getBoundingClientRect();
          const dx = (e.clientX - rect.left) / rect.width - 0.5;
          const dy = (e.clientY - rect.top) / rect.height - 0.5;
          xTo(dx * 30);
          yTo(dy * 25);
          rTo(dx * 4);
        });

        section.addEventListener("mouseleave", () => {
          tracking = false;
          xTo(0); yTo(0); rTo(0);
          resumeCall = gsap.delayedCall(0.9, () => {
            if (!tracking && idle) {
              idle.kill();
              idle = startIdleFloat();
            }
          });
        });
      });
    }

    registerIntro(section, tl, "top 60%");
  }

  function initBattleSection() {
    const section = document.querySelector(".battle-scene");
    if (!section) return;

    const island = section.querySelector("code-island");

    function getBgImage() {
      if (!island || !island.shadowRoot) return null;
      return island.shadowRoot.querySelector(".scene-viewport > img") ||
             island.shadowRoot.querySelector("img");
    }

    function setup() {
      const bgImg = getBgImage();
      const card = section.querySelector(".scripture-card");
      const head = section.querySelector(".scripture-head");
      const letter = section.querySelector(".scripture-letter");
      const para = section.querySelector(".scripture-para");

      const headChars = splitText(head, "chars");
      const paraWords = splitText(para, "words");

      if (bgImg) gsap.set(bgImg, { opacity: 0 });
      if (card) gsap.set(card, { autoAlpha: 0, y: 40, scale: 0.96 });
      gsap.set(headChars, { yPercent: 115, opacity: 0 });
      if (letter) gsap.set(letter, { opacity: 0, y: 30, scale: 0.85, rotation: -6 });
      gsap.set(paraWords, { yPercent: 100, opacity: 0 });

      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      if (bgImg) tl.to(bgImg, { opacity: 1, duration: 1, ease: "power2.out" }, 0);
      if (card) tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 1 }, 0.15);
      tl.to(headChars, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.03 }, 0.4);
      if (letter) tl.to(letter, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.4)" }, 0.55);
      tl.to(paraWords, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.035 }, 0.65);

      registerIntro(section, tl);
    }

    // The 3D island renders into a shadow root; wait briefly for it.
    if (island && !island.shadowRoot) {
      let tries = 0;
      const wait = setInterval(() => {
        tries++;
        if (island.shadowRoot || tries > 40) {
          clearInterval(wait);
          setup();
        }
      }, 100);
    } else {
      setup();
    }
  }

  function initShopSection() {
    const section = document.querySelector(".shop-section");
    if (!section) return;
    const bgImg = section.querySelector(".bg-img");
    const heading = section.querySelector(".heading-big-v");
    const paragraph = section.querySelector(".paragraph");
    const button = section.querySelector(".button.hero");
    const groupLine = section.querySelector(".group-line");
    const cardsWrap = section.querySelector(".collection-list-wrapper");

    const headingChars = splitText(heading, "chars");
    const paragraphWords = splitText(paragraph, "words");
    setupButtonHover(button);

    if (bgImg) gsap.set(bgImg, { autoAlpha: 0, scale: 1.04 });
    gsap.set(headingChars, { yPercent: 115, opacity: 0 });
    gsap.set(paragraphWords, { yPercent: 100, opacity: 0 });
    if (button) gsap.set(button, { autoAlpha: 0, y: 18, scale: 0.96 });
    if (groupLine) gsap.set(groupLine, { scaleX: 0, autoAlpha: 0 });
    if (cardsWrap) gsap.set(cardsWrap, { autoAlpha: 0, y: 30 });

    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
    if (bgImg) tl.to(bgImg, { autoAlpha: 1, scale: 1, duration: 1, ease: "power2.out" }, 0);
    tl.to(headingChars, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.03 }, 0.15);
    tl.to(paragraphWords, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.035 }, 0.4);
    if (groupLine) tl.to(groupLine, { scaleX: 1, autoAlpha: 1, duration: 0.9 }, 0.5);
    if (cardsWrap) tl.to(cardsWrap, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.6);
    if (button) tl.to(button, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 }, 0.7);

    registerIntro(section, tl, "top 60%");
  }

  /* ============================================================
     1e. FOOTER LOOP — scrolling past the end of the page closes
         the theatre paper curtain (the BlackletterPaperCurtain
         look from "Start the Experience"), returns to the top
         under full cover, and tears open again on the hero. The
         site scrolls in an endless loop.

         Requires the Paper Scroll Transition component to be
         REMOVED from the footer section — this replaces it there.
         Announces itself on blackletter:paper-transition, so all
         section boundaries and reveals hold while it runs.
     ============================================================ */

  function initFooterLoop() {
    const footer = document.querySelector(".footer-section");
    if (!footer) return;

    const CLOSE_DUR = 0.9;   // curtain halves sweeping shut
    const GLIDE_DUR = 0.35;  // scroll gliding home under full cover
    const OPEN_DUR = 1.3;    // the tear-open reveal on the hero
    const COOLDOWN_MS = 600;

    const paperOne = getCSSColor("--paper-color-one", "#252525");
    const paperTwo = getCSSColor("--paper-color-two", "#ffffff");

    let canvas = null;
    let effect = null;
    let running = false;
    let cooldownUntil = 0;
    let pinnedY = 0;

    function ensureEffect() {
      if (effect) return true;
      try {
        canvas = document.createElement("canvas");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.cssText =
          "position:fixed;top:0;left:0;width:100vw;height:100vh;" +
          "opacity:0;pointer-events:none;z-index:200;";
        if (window.CSS && CSS.supports && CSS.supports("height", "100dvh")) {
          canvas.style.height = "100dvh";
        }
        document.body.appendChild(canvas);
        effect = new PaperCurtainEffect(canvas, {
          color: paperTwo,
          background: paperOne,
          backgroundOpacity: 0,
          style: "theatre",
          showLoader: false,
          grainOpacity: 1.0,
          warmTint: 0.6,
          manageContainerBackground: false,
          registerGlobal: false,
        });
        return true;
      } catch (err) {
        effect = null;
        return false;
      }
    }

    window.addEventListener("resize", () => {
      if (!effect || !canvas) return;
      effect.canvasSize = { width: window.innerWidth, height: window.innerHeight };
      try { effect._resize(); } catch (err) {}
    });

    // Move scroll through Lenis when present so the loop's glide-home is one
    // smooth motion in sync with the smooth-scroll instance.
    const setScroll = (y) => {
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    };

    const holdScroll = () => {
      // Lenis drives the position during the loop; only pin in the fallback.
      if (window.__lenis) return;
      if (window.scrollY !== pinnedY) window.scrollTo(0, pinnedY);
    };

    function distanceToEnd() {
      return (
        document.documentElement.scrollHeight -
        (window.innerHeight + window.scrollY)
      );
    }

    function emitLoopPhase(phase) {
      window.dispatchEvent(new CustomEvent("blackletter:paper-transition", {
        detail: { phase: phase, towards: "loop" },
      }));
    }

    // Diagnostic: a directional wipe playing at the page end means a
    // Paper Scroll Transition component is still mounted in the footer.
    window.addEventListener("blackletter:paper-transition", (event) => {
      const detail = event.detail || {};
      if (detail.phase === "start" && detail.towards !== "loop" &&
          distanceToEnd() < window.innerHeight * 1.5) {
        console.warn("[FooterLoop] a Paper Scroll Transition wipe started near the page end (towards: " +
          detail.towards + "). REMOVE the Paper Scroll Transition component from inside .footer-section — " +
          "the footer loop replaces it there.");
      }
    });

    function runLoop() {
      if (running) return;
      if (paperTransitionActive) return;
      if (performance.now() < cooldownUntil) return;
      if (!ensureEffect()) {
        console.warn("[FooterLoop] could not create the curtain effect (WebGL).");
        return;
      }

      running = true;
      pinnedY = window.scrollY;
      window.addEventListener("scroll", holdScroll, { passive: true });
      emitLoopPhase("start");

      // Theatre progress: 1 = torn open (clear), 0 = closed sheet.
      effect.state.progress = 1;
      canvas.style.opacity = "1";

      const scrollProxy = { y: window.scrollY };
      const tl = gsap.timeline({
        onComplete: () => {
          canvas.style.opacity = "0";
          window.removeEventListener("scroll", holdScroll);
          running = false;
          cooldownUntil = performance.now() + COOLDOWN_MS;
          emitLoopPhase("end");
        },
      });

      tl.to(effect.state, { progress: 0, duration: CLOSE_DUR, ease: "power2.inOut" }, 0);
      tl.to(scrollProxy, {
        y: 0,
        duration: GLIDE_DUR,
        ease: "power2.inOut",
        onUpdate: () => {
          pinnedY = Math.round(scrollProxy.y);
          setScroll(pinnedY);
        },
      }, CLOSE_DUR);
      tl.to(effect.state, { progress: 1, duration: OPEN_DUR, ease: "power2.inOut" }, CLOSE_DUR + GLIDE_DUR);
    }

    /* Capture-phase interception: runs BEFORE the Paper Scroll Transition
       components' own listeners, and swallows the event entirely when the
       loop takes over — so the directional wipe can never win the race at
       the page end. `stepPx` is how far the event would scroll: any step
       that would reach the end triggers the loop (predictive, like the
       section boundaries), so aggressive flings are caught too. */
    function intercept(event, goingDown, stepPx) {
      if (running) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!goingDown) return;
      if (!document.body.classList.contains("experience-started")) return;

      const dist = distanceToEnd();
      if (dist > Math.max(2, stepPx)) return; // this step can't reach the end

      event.preventDefault();
      event.stopImmediatePropagation();

      if (dist > 0) setScroll(window.scrollY + dist);
      runLoop();
    }

    window.addEventListener("wheel", (event) => {
      if (event.deltaY === 0) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
      intercept(event, event.deltaY > 0, Math.abs(event.deltaY) * unit);
    }, { passive: false, capture: true });

    let lastTouchY = null;
    window.addEventListener("touchstart", (event) => {
      lastTouchY = event.touches[0] ? event.touches[0].clientY : null;
    }, { passive: true, capture: true });
    window.addEventListener("touchmove", (event) => {
      const y = event.touches[0] ? event.touches[0].clientY : null;
      if (y == null || lastTouchY == null) return;
      const delta = lastTouchY - y;
      lastTouchY = y;
      if (delta !== 0) intercept(event, delta > 0, Math.abs(delta));
    }, { passive: false, capture: true });

    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
      const isDown =
        ["ArrowDown", "PageDown", "End"].includes(event.key) ||
        (event.key === " " && !event.shiftKey);
      const step = event.key === "ArrowDown" ? 120 : window.innerHeight;
      if (isDown) intercept(event, true, step);
    }, { capture: true });

  }

  /* ============================================================
     BOOT — modules run after DOM parse; wire global refresh once
     ============================================================ */

  initHero();
  initMakersSection();
  initBattleSection();
  initShopSection();
  initFooterLoop();

  function onPageSettled() {
    ScrollTrigger.refresh();
    refresh3DLayoutBurst();
  }

  window.addEventListener("load", onPageSettled);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(onPageSettled).catch(() => {});
  }
}

/* ============================================================
   2. SHOP CARDS — desktop conveyor / mobile ritual shuffle
      (formerly a page embed; guards keep it single-run even if
      the old embed block is still present in Webflow)
   ============================================================ */

function __initShopCards() {
  if (!window.gsap) {
    setTimeout(__initShopCards, 100);
    return;
  }

  if (window.__cardStackInit) return;
  window.__cardStackInit = true;

  const slides = Array.from(document.querySelectorAll('.collection-item'));
  if (!slides.length) return;

  slides.forEach(c => c.removeAttribute('style'));
  gsap.set(slides, { clearProps: 'all' });
  gsap.set(slides, { opacity: 1, x: 0, y: 0 });

  const mm = gsap.matchMedia();

  mm.add('(min-width: 992px)', () => {
    /* ---- fan geometry ---- */
    const X = [0, 22, 42, 60, 76];
    const S = [1, 0.93, 0.87, 0.81, 0.76];
    const VISIBLE = 5;

    /* ---- deal rhythm ---- */
    const ENTER_FROM = -115;  // xPercent: parked fully behind the group-line
    const EXIT_DUR = 0.8;     // bottom card sliding out of the viewport right
    const ENTER_DUR = 0.7;    // it (or the next card) sliding in from the left
    const SHIFT_DUR = 0.65;   // fan stepping one slot deeper
    const HOLD = 0.55;        // rest between deals
    const FIRST_DELAY = 1.2;  // beat after the section reveal before dealing

    const wrapper = document.querySelector('.collection-list-wrapper');
    const section = document.querySelector('.shop-section');
    const groupLine = section ? section.querySelector('.group-line') : null;

    /* Reveal boundary at the group-line. Hidden elements measure as 0,
       so measurement is skipped until the section actually has layout. */
    function applyClipEdge() {
      if (!wrapper) return;
      const wRect = wrapper.getBoundingClientRect();
      if (wRect.width < 2) return;

      let leftInset = 0;
      if (groupLine) {
        const gRect = groupLine.getBoundingClientRect();
        if (gRect.right > 0) {
          leftInset = Math.max(0, Math.round(gRect.right - wRect.left));
        }
      }

      const rightExtend = Math.round((window.innerWidth - wRect.right) + 300);
      wrapper.style.clipPath =
        'inset(-200px ' + (-rightExtend) + 'px -200px ' + leftInset + 'px)';
    }

    // The conveyor: fan[0] = front. Each deal, the bottom card slides out
    // BENEATH the stack through the right side of the viewport, then the
    // next card in CMS order slides in from behind the group-line.
    let fan = [];
    let cursor = 1 % slides.length;
    let started = false;
    let visible = false;
    let paperActive = false;
    let hovered = false;
    let pending = null;
    let running = false;
    let activeTl = null;

    function stockFan() {
      fan = [slides[0]];
      const tail = slides.slice(1).reverse();
      for (let i = 0; i < VISIBLE - 1 && i < tail.length; i++) fan.push(tail[i]);
    }

    // Vertical centering: yPercent -50 + top 50% anchors each card to
    // the vertical center of the container, regardless of CMS flow.
    function placeAll() {
      stockFan();
      slides.forEach((card) => {
        const depth = fan.indexOf(card);
        const inFan = depth !== -1;
        gsap.set(card, {
          top: '50%',
          x: 0,
          xPercent: inFan ? X[depth] : ENTER_FROM,
          yPercent: -50,
          scale: inFan ? S[depth] : 1,
          rotation: 0,
          opacity: 1,
          zIndex: inFan ? slides.length - depth : 0,
          transformOrigin: 'left center',
        });
      });
    }
    placeAll();
    applyClipEdge();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyClipEdge, 150);
    });

    function queueDeal(delay) {
      if (!visible || paperActive || hovered || running || pending) return;
      pending = gsap.delayedCall(delay, () => {
        pending = null;
        runDeal();
      });
    }

    function runDeal() {
      if (!visible || paperActive || hovered || running || slides.length < 2) return;
      running = true;

      applyClipEdge();
      const incoming = slides[cursor];
      cursor = (cursor + 1) % slides.length;

      const fanIdx = fan.indexOf(incoming);
      if (fanIdx !== -1) fan.splice(fanIdx, 1);
      fan.unshift(incoming);
      const popped = fan.length > VISIBLE ? fan.pop() : null;

      const flyer = fanIdx !== -1 ? incoming : popped;

      const tl = gsap.timeline({
        onComplete: () => {
          activeTl = null;
          running = false;
          queueDeal(HOLD);
        }
      });
      activeTl = tl;

      /* Phase 1 — slide out BENEATH the stack, out the viewport right. */
      let enterAt = 0;
      if (flyer) {
        gsap.set(flyer, { zIndex: 0 });
        const rect = flyer.getBoundingClientRect();
        const travel = (window.innerWidth - rect.left) + rect.width + 60;
        tl.to(flyer, {
          x: '+=' + travel,
          duration: EXIT_DUR,
          ease: 'power2.in',
        }, 0);
        enterAt = EXIT_DUR;
      }

      /* Phase 2 — deal in from behind the group-line; fan steps deeper. */
      tl.set(incoming, {
        x: 0,
        xPercent: ENTER_FROM,
        scale: 1,
        opacity: 1,
        zIndex: slides.length + 1,
      }, enterAt);
      tl.to(incoming, {
        xPercent: X[0],
        duration: ENTER_DUR,
        ease: 'power3.out',
      }, enterAt);
      tl.set(incoming, { zIndex: slides.length });

      fan.forEach((card, depth) => {
        if (card === incoming) return;
        tl.set(card, { zIndex: slides.length - depth }, enterAt);
        tl.to(card, {
          xPercent: X[depth],
          scale: S[depth],
          duration: SHIFT_DUR,
          ease: 'power2.inOut',
        }, enterAt);
      });

      if (flyer && flyer !== incoming) {
        tl.set(flyer, { x: 0, xPercent: ENTER_FROM, scale: 1, zIndex: 0 });
      }
    }

    /* Hover on the TOP card: freeze; resume on unhover. */
    const hoverAbort = new AbortController();
    slides.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        if (fan.indexOf(card) !== 0) return;
        hovered = true;
        if (pending) { pending.kill(); pending = null; }
        if (activeTl && activeTl.isActive()) activeTl.pause();
      }, { signal: hoverAbort.signal });

      card.addEventListener('mouseleave', () => {
        if (!hovered) return;
        hovered = false;
        if (activeTl && activeTl.paused()) {
          activeTl.resume();
        } else {
          queueDeal(HOLD);
        }
      }, { signal: hoverAbort.signal });
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        visible = entry.isIntersecting;
        if (visible) {
          applyClipEdge();
          const delay = started ? HOLD : FIRST_DELAY;
          started = true;
          queueDeal(delay);
        } else if (pending) {
          pending.kill();
          pending = null;
        }
      });
    }, { threshold: 0.35 });
    if (section) io.observe(section);

    const onPaper = (event) => {
      const phase = event.detail && event.detail.phase;
      if (phase === 'start') {
        paperActive = true;
        if (pending) { pending.kill(); pending = null; }
      } else {
        paperActive = false;
        if (started) queueDeal(HOLD);
      }
    };
    window.addEventListener('blackletter:paper-transition', onPaper);

    return () => {
      io.disconnect();
      hoverAbort.abort();
      window.removeEventListener('blackletter:paper-transition', onPaper);
      if (pending) pending.kill();
      if (activeTl) { activeTl.kill(); activeTl = null; }
      if (wrapper) wrapper.style.clipPath = '';
      gsap.killTweensOf(slides);
      gsap.set(slides, { clearProps: 'all' });
    };
  });

  mm.add('(max-width: 991px)', () => {
    /* =====================================================
       MOBILE / TABLET — the ritual shuffle, in two beats:
       Beat 1: the reigning card visibly recedes from the
               center to the inner-right seat, ON TOP, while
               the side cards step around the ring.
       Beat 2: once the center clears, the next card is
               drawn up and over into the front.
       Extra CMS items (6+) rotate in through the hidden
       seat behind the deck.
       ===================================================== */
    const SLOT = [
      { x: 0,   s: 1.00, z: 7 },  // 0 front
      { x: 18,  s: 0.93, z: 6 },  // 1 inner right
      { x: -18, s: 0.93, z: 5 },  // 2 inner left
      { x: 34,  s: 0.86, z: 4 },  // 3 outer right
      { x: -34, s: 0.86, z: 3 },  // 4 outer left
    ];

    const RECEDE = 0.55;    // beat 1: old front gliding back
    const DRAW_AT = 0.5;    // beat 2 starts as the center clears
    const DRAW = 0.8;       // beat 2: new front drawn to the center
    const HOLD_M = 1.5;     // rest on each front card
    const FIRST_DELAY = 1.2;

    const section = document.querySelector('.shop-section');

    // Static fallback for tiny collections.
    if (slides.length < 5) {
      slides.forEach((card, depth) => {
        const d = Math.min(depth, SLOT.length - 1);
        gsap.set(card, {
          left: '50%', top: '50%', margin: 0,
          transformOrigin: 'center center',
          x: 0, y: 0,
          xPercent: -50 + SLOT[d].x, yPercent: -50,
          scale: SLOT[d].s,
          opacity: 1,
          zIndex: SLOT[d].z,
        });
      });
      return () => { gsap.set(slides, { clearProps: 'all' }); };
    }

    let ring = slides.slice(0, 5);      // ring[i] occupies SLOT[i]
    let queue = slides.slice(5);        // hidden, waiting behind the deck
    let started = false;
    let visible = false;
    let paperActive = false;
    let pending = null;
    let running = false;

    function placeAll() {
      ring.forEach((card, i) => {
        gsap.set(card, {
          left: '50%', top: '50%', margin: 0,
          transformOrigin: 'center center',
          x: 0, y: 0, rotation: 0,
          xPercent: -50 + SLOT[i].x, yPercent: -50,
          scale: SLOT[i].s,
          opacity: 1,
          zIndex: SLOT[i].z,
        });
      });
      queue.forEach((card) => {
        gsap.set(card, {
          left: '50%', top: '50%', margin: 0,
          transformOrigin: 'center center',
          x: 0, y: 0, rotation: 0,
          xPercent: -50, yPercent: -50,
          scale: 0.8,
          opacity: 0,
          zIndex: 0,
        });
      });
    }
    placeAll();

    function queueStep(delay) {
      if (!visible || paperActive || running || pending) return;
      pending = gsap.delayedCall(delay, () => {
        pending = null;
        runStep();
      });
    }

    function runStep() {
      if (!visible || paperActive || running) return;
      running = true;

      const f = ring[0], ir = ring[1], il = ring[2], or_ = ring[3], ol = ring[4];

      const tl = gsap.timeline({
        onComplete: () => {
          running = false;
          queueStep(HOLD_M);
        }
      });

      /* Clear the z lanes first (insertion order prevents any ties).
         The old front keeps the TOP z through beat 1, so its whole
         journey back to the inner-right seat is visible. */
      tl.set(or_, { zIndex: 1 }, 0);
      tl.set(ir, { zIndex: 4 }, 0);
      tl.set(il, { zIndex: 6 }, 0);
      tl.set(ol, { zIndex: 5 }, 0);

      /* Beat 1 — the reigning card recedes, fully visible on top. */
      tl.to(f, {
        xPercent: -50 + SLOT[1].x, scale: SLOT[1].s,
        duration: RECEDE, ease: 'power2.inOut',
      }, 0);

      /* The side cards step around the ring with it. */
      tl.to(ir, {
        xPercent: -50 + SLOT[3].x, scale: SLOT[3].s,
        duration: RECEDE, ease: 'power2.inOut',
      }, 0);
      tl.to(ol, {
        xPercent: -50 + SLOT[2].x, scale: SLOT[2].s,
        duration: RECEDE, ease: 'power2.inOut',
      }, 0);

      /* Beat 2 — with the center cleared, the next card is drawn up
         and over into the front: lifted, slightly tilted, settling
         as it lands. */
      tl.set(il, { zIndex: 9 }, DRAW_AT);
      tl.to(il, {
        xPercent: -50, scale: 1,
        duration: DRAW, ease: 'power2.inOut',
      }, DRAW_AT);
      tl.to(il, { y: -16, rotation: -4, duration: DRAW * 0.45, ease: 'power2.out' }, DRAW_AT);
      tl.to(il, { y: 0, rotation: 0, duration: DRAW * 0.55, ease: 'power2.in' }, DRAW_AT + DRAW * 0.45);

      /* Outer-right wraps around BEHIND the deck (or retires into the
         hidden queue when there are more than five relics). */
      let newOuterLeft;
      if (queue.length) {
        tl.to(or_, { xPercent: -50, scale: 0.8, duration: RECEDE, ease: 'power2.in' }, 0);
        tl.set(or_, { opacity: 0 }, RECEDE);

        const inc = queue.shift();
        queue.push(or_);
        tl.set(inc, { xPercent: -50, scale: 0.8, opacity: 1, zIndex: 2, rotation: 0, y: 0 }, 0);
        tl.to(inc, {
          xPercent: -50 + SLOT[4].x, scale: SLOT[4].s,
          duration: DRAW, ease: 'power2.out',
        }, 0.2);
        newOuterLeft = inc;
      } else {
        tl.to(or_, {
          xPercent: -50 + SLOT[4].x, scale: SLOT[4].s,
          duration: DRAW_AT + DRAW, ease: 'power2.inOut',
        }, 0);
        newOuterLeft = or_;
      }

      /* Settle canonical stacking once everything has landed. */
      tl.set(il, { zIndex: SLOT[0].z });
      tl.set(f, { zIndex: SLOT[1].z });
      tl.set(ol, { zIndex: SLOT[2].z });
      tl.set(ir, { zIndex: SLOT[3].z });
      tl.set(newOuterLeft, { zIndex: SLOT[4].z });

      ring = [il, f, ol, ir, newOuterLeft];
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        visible = entry.isIntersecting;
        if (visible) {
          const delay = started ? HOLD_M : FIRST_DELAY;
          started = true;
          queueStep(delay);
        } else if (pending) {
          pending.kill();
          pending = null;
        }
      });
    }, { threshold: 0.35 });
    if (section) io.observe(section);

    const onPaper = (event) => {
      const phase = event.detail && event.detail.phase;
      if (phase === 'start') {
        paperActive = true;
        if (pending) { pending.kill(); pending = null; }
      } else {
        paperActive = false;
        if (started) queueStep(HOLD_M);
      }
    };
    window.addEventListener('blackletter:paper-transition', onPaper);

    return () => {
      io.disconnect();
      window.removeEventListener('blackletter:paper-transition', onPaper);
      if (pending) pending.kill();
      gsap.killTweensOf(slides);
      gsap.set(slides, { clearProps: 'all' });
    };
  });
}

if (document.readyState === "complete") {
  __initShopCards();
} else {
  window.addEventListener("load", __initShopCards);
}

/* ============================================================
   3. SUBSCRIBE — marquee loop, form-button rolling hover,
      paper-gated reveal (formerly a page embed)
   ============================================================ */

function __initSubscribe() {
  if (!window.gsap) { setTimeout(__initSubscribe, 100); return; }
  if (window.__subscribeInit) return;
  window.__subscribeInit = true;

  const section = document.querySelector('.subscribe-section');
  if (!section) return;

  /* === 1. MARQUEE — built on first reveal, loops forever === */
  const marquee = section.querySelector('.subscribe-div');
  const MARQUEE_SPEED = 90; // px per second
  let loop = null;

  function buildMarquee() {
    if (!marquee || loop) return;
    const base = marquee.innerHTML;
    let guard = 0;
    while (marquee.scrollWidth < window.innerWidth && guard < 6) {
      marquee.innerHTML += base;
      guard++;
    }
    marquee.innerHTML += marquee.innerHTML; // identical second half
    loop = gsap.to(marquee, {
      xPercent: -50,
      duration: Math.max(marquee.scrollWidth / 2, 400) / MARQUEE_SPEED,
      ease: 'none',
      repeat: -1,
    });
  }

  /* === 2. SUBMIT BUTTON — rolling-words hover on the <input> === */
  function setupFormButtonHover() {
    const input = section.querySelector('input.button-form');
    if (!input || input.dataset.hoverReady === 'true') return;
    const labelText = (input.value || '').trim();
    if (!labelText) return;

    const inputStyles = getComputedStyle(input);

    const wrap = document.createElement('span');
    wrap.className = 'button-form-hover-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const overlay = document.createElement('span');
    overlay.className = 'button-form-overlay';
    overlay.style.font = inputStyles.font;
    overlay.style.letterSpacing = inputStyles.letterSpacing;
    overlay.style.textTransform = inputStyles.textTransform;
    overlay.style.color = inputStyles.color;

    const currentRow = document.createElement('span');
    const nextRow = document.createElement('span');
    currentRow.className = 'button-text-row';
    nextRow.className = 'button-text-row';

    [currentRow, nextRow].forEach((row) => {
      labelText.split(/\s+/).forEach((word, index, arr) => {
        const wordWrap = document.createElement('span');
        const inner = document.createElement('span');
        wordWrap.className = 'button-word-wrap';
        inner.className = 'button-word';
        inner.textContent = word;
        wordWrap.appendChild(inner);
        row.appendChild(wordWrap);
        if (index < arr.length - 1) row.appendChild(document.createTextNode(' '));
      });
    });
    overlay.appendChild(currentRow);
    overlay.appendChild(nextRow);
    wrap.appendChild(overlay);

    input.style.color = 'transparent';

    const currentWords = gsap.utils.toArray(currentRow.querySelectorAll('.button-word'));
    const nextWords = gsap.utils.toArray(nextRow.querySelectorAll('.button-word'));
    gsap.set(currentWords, { yPercent: 0 });
    gsap.set(nextWords, { yPercent: 115 });

    const hoverTl = gsap.timeline({ paused: true, defaults: { duration: 0.5, ease: 'power3.inOut' } });
    hoverTl.to(currentWords, { yPercent: -115, stagger: 0.04 }, 0);
    hoverTl.to(nextWords, { yPercent: 0, stagger: 0.04 }, 0.04);

    wrap.addEventListener('mouseenter', () => hoverTl.play());
    wrap.addEventListener('mouseleave', () => hoverTl.reverse());
    input.dataset.hoverReady = 'true';

    const form = input.closest('form');
    if (form) {
      form.addEventListener('submit', () => {
        overlay.style.display = 'none';
        input.style.color = '';
      });
    }
  }
  setupFormButtonHover();

  /* === 3. INITIAL HIDDEN STATE + REVEAL (inner elements only —
         the section itself is never faded) === */
  const scriptImg = section.querySelector('.script-text-image-div');
  const scriptPara = section.querySelector('.script-text-para');
  const fields = gsap.utils.toArray(section.querySelectorAll('.text-field'));
  const submitWrap = section.querySelector('.button-form-hover-wrap') ||
                     section.querySelector('.button-form');

  if (marquee) gsap.set(marquee, { autoAlpha: 0 });
  if (scriptImg) gsap.set(scriptImg, { autoAlpha: 0, y: 40, scale: 0.96 });
  if (scriptPara) gsap.set(scriptPara, { autoAlpha: 0, y: 30 });
  if (fields.length) gsap.set(fields, { autoAlpha: 0, y: 24 });
  if (submitWrap) gsap.set(submitWrap, { autoAlpha: 0, y: 24, scale: 0.96 });

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    buildMarquee();
    if (loop) loop.pause();

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (marquee) {
      tl.to(marquee, { autoAlpha: 1, duration: 0.8 }, 0);
      tl.call(() => { if (loop) loop.play(); }, null, 0);
    }
    if (scriptImg) tl.to(scriptImg, { autoAlpha: 1, y: 0, scale: 1, duration: 0.9 }, 0.15);
    if (scriptPara) tl.to(scriptPara, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.35);
    if (fields.length) tl.to(fields, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.12 }, 0.55);
    if (submitWrap) tl.to(submitWrap, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 }, 0.85);
  }

  /* === 4. TRIGGERS — reveal on first sight, held during paper
         transitions; marquee sleeps off-screen === */
  let paperActive = false;
  let revealQueued = false;

  window.addEventListener('blackletter:paper-transition', (event) => {
    const phase = event.detail && event.detail.phase;
    paperActive = phase === 'start';
    if (!paperActive && revealQueued) {
      revealQueued = false;
      reveal();
    }
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      if (paperActive) revealQueued = true;
      else reveal();
    });
  }, { threshold: 0.25 });
  io.observe(section);

  const ioMarquee = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!loop || !revealed) return;
      entry.isIntersecting ? loop.play() : loop.pause();
    });
  }, { threshold: 0 });
  ioMarquee.observe(section);
}

if (document.readyState === "complete") __initSubscribe();
else window.addEventListener("load", __initSubscribe);

/* ============================================================
   4. FOOTER — reveal cascade + CTA rolling hover
      (formerly a page embed)
   ============================================================ */

function __initFooter() {
  if (!window.gsap) { setTimeout(__initFooter, 100); return; }
  if (window.__footerInit) return;
  window.__footerInit = true;

  const section = document.querySelector('.footer-section');
  if (!section) return;

  const head = section.querySelector('.scripture-head');
  const ctaBtn = section.querySelector('.button.hero');
  const ctaPara = section.querySelector('.footer-cta-para:not(.mobile) .footer-para');
  const ctaParaMobile = section.querySelector('.footer-cta-para.mobile .footer-para');
  const logo = section.querySelector('.footer-logo-text');
  const rightsPara = section.querySelector('.footer-right-para .footer-para');
  const socials = gsap.utils.toArray(section.querySelectorAll('.social-logo'));

  /* rolling-words hover on the CTA, same as every other button */
  function setupButtonHover(buttonEl) {
    if (!buttonEl || buttonEl.dataset.hoverReady === 'true') return;
    const textNodes = Array.from(buttonEl.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
    );
    const labelText = textNodes.map((node) => node.nodeValue.trim()).join(' ');
    if (!labelText) return;
    textNodes.forEach((node) => node.remove());

    const label = document.createElement('span');
    const currentRow = document.createElement('span');
    const nextRow = document.createElement('span');
    label.className = 'button-hover-label';
    currentRow.className = 'button-text-row';
    nextRow.className = 'button-text-row';

    [currentRow, nextRow].forEach((row) => {
      labelText.split(/\s+/).forEach((word, index, arr) => {
        const wrap = document.createElement('span');
        const inner = document.createElement('span');
        wrap.className = 'button-word-wrap';
        inner.className = 'button-word';
        inner.textContent = word;
        wrap.appendChild(inner);
        row.appendChild(wrap);
        if (index < arr.length - 1) row.appendChild(document.createTextNode(' '));
      });
    });
    label.appendChild(currentRow);
    label.appendChild(nextRow);
    buttonEl.prepend(label);

    const currentWords = gsap.utils.toArray(currentRow.querySelectorAll('.button-word'));
    const nextWords = gsap.utils.toArray(nextRow.querySelectorAll('.button-word'));
    gsap.set(currentWords, { yPercent: 0 });
    gsap.set(nextWords, { yPercent: 115 });

    const hoverTl = gsap.timeline({ paused: true, defaults: { duration: 0.5, ease: 'power3.inOut' } });
    hoverTl.to(currentWords, { yPercent: -115, stagger: 0.04 }, 0);
    hoverTl.to(nextWords, { yPercent: 0, stagger: 0.04 }, 0.04);

    buttonEl.addEventListener('mouseenter', () => hoverTl.play());
    buttonEl.addEventListener('mouseleave', () => hoverTl.reverse());
    buttonEl.dataset.hoverReady = 'true';
  }
  setupButtonHover(ctaBtn);

  /* initial hidden states */
  if (head) gsap.set(head, { autoAlpha: 0, y: 50 });
  if (ctaBtn) gsap.set(ctaBtn, { autoAlpha: 0, y: 24, scale: 0.96 });
  if (ctaPara) gsap.set(ctaPara, { autoAlpha: 0, y: 30 });
  if (ctaParaMobile) gsap.set(ctaParaMobile, { autoAlpha: 0, y: 30 });
  if (logo) gsap.set(logo, { autoAlpha: 0, scale: 0.6, rotation: -8 });
  if (rightsPara) gsap.set(rightsPara, { autoAlpha: 0, y: 20 });
  if (socials.length) gsap.set(socials, { autoAlpha: 0, y: 20, scale: 0.8 });

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (head) tl.to(head, { autoAlpha: 1, y: 0, duration: 0.9 }, 0);
    if (ctaBtn) tl.to(ctaBtn, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, 0.25);
    if (ctaPara) tl.to(ctaPara, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.35);
    if (ctaParaMobile) tl.to(ctaParaMobile, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.35);
    if (logo) tl.to(logo, { autoAlpha: 1, scale: 1, rotation: 0, duration: 1.0, ease: 'back.out(1.4)' }, 0.45);
    if (rightsPara) tl.to(rightsPara, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.7);
    if (socials.length) tl.to(socials, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(1.6)' }, 0.8);
  }

  /* reveal on first sight, held while a paper transition covers */
  let paperActive = false;
  let revealQueued = false;

  window.addEventListener('blackletter:paper-transition', (event) => {
    const phase = event.detail && event.detail.phase;
    paperActive = phase === 'start';
    if (!paperActive && revealQueued) {
      revealQueued = false;
      reveal();
    }
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      if (paperActive) revealQueued = true;
      else reveal();
    });
  }, { threshold: 0.25 });
  io.observe(section);
}

if (document.readyState === "complete") __initFooter();
else window.addEventListener("load", __initFooter);
