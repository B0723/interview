(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const nav = document.querySelector(".nav");
  const hero = document.querySelector(".hero");
  const bar = document.querySelector(".progress");
  const links = [...document.querySelectorAll(".nav-links a")];
  const parts = links.map((a) => document.querySelector(a.getAttribute("href")));

  /* ------------------------------------------------ nav state + progress */
  let ticking = false;
  function update() {
    ticking = false;
    const y = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    nav.classList.toggle("solid", y > hero.offsetHeight - nav.offsetHeight - 1);

    let active = -1;
    parts.forEach((p, i) => {
      if (p && p.getBoundingClientRect().top <= window.innerHeight * 0.4) active = i;
    });
    links.forEach((a, i) => a.classList.toggle("active", i === active));
  }
  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();

  /* ------------------------------------------------ reveal on scroll */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }
  window.addEventListener("beforeprint", () => reveals.forEach((el) => el.classList.add("in")));

  /* ------------------------------------------------ lightbox (figures and example videos) */
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = '<img alt=""><video controls playsinline></video><p class="lb-cap"></p>';
  document.body.appendChild(box);
  const boxImg = box.querySelector("img");
  const boxVideo = box.querySelector("video");
  const boxCap = box.querySelector(".lb-cap");
  const closeBox = () => {
    box.classList.remove("open", "is-video");
    boxVideo.pause();
    boxVideo.removeAttribute("src");
    boxVideo.load();
  };

  document.querySelectorAll(".fig img").forEach((img) => {
    img.addEventListener("click", () => {
      boxImg.src = img.dataset.full || img.currentSrc || img.src;
      boxImg.alt = img.alt;
      box.classList.add("open");
    });
  });

  document.querySelectorAll("[data-video]").forEach((btn) => {
    btn.addEventListener("click", () => {
      boxVideo.src = btn.dataset.video;
      boxCap.textContent = btn.dataset.caption || "";
      box.classList.add("open", "is-video");
      boxVideo.play().catch(() => {});
    });
    // a missing video file leaves the text caption on its own
    const thumb = btn.querySelector("video");
    const markMissing = () => btn.closest(".ex").classList.add("no-media");
    thumb.addEventListener("error", markMissing);
    if (thumb.error || thumb.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) markMissing();
    // first frames are often black; show the frame at ~1s as the thumbnail
    const seekPoster = () => {
      if (thumb.currentTime < 0.5) thumb.currentTime = Math.min(1, thumb.duration / 3 || 0);
    };
    if (thumb.readyState >= 1) seekPoster();
    else thumb.addEventListener("loadedmetadata", seekPoster, { once: true });
  });

  box.addEventListener("click", (e) => {
    if (e.target !== boxVideo) closeBox();
  });

  /* ------------------------------------------------ presenter stepping
     PageDown / Space / → jump to the next section start; a section taller
     than the viewport is paged through first. */
  const stops = () => {
    const off = nav.offsetHeight;
    return [...document.querySelectorAll(".hero, .part-cover, .scene, .footer")].map((el) =>
      Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - off))
    );
  };

  /* Driven by rAF instead of scrollTo({behavior: "smooth"}): repeated
     programmatic smooth scrolls are occasionally dropped by Chromium. */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let target = null;
  let anim = 0;
  function go(top) {
    const max = root.scrollHeight - window.innerHeight;
    target = Math.max(0, Math.min(max, Math.round(top)));
    cancelAnimationFrame(anim);
    const from = window.scrollY;
    const dist = target - from;
    const dur = reduceMotion.matches ? 0 : Math.min(700, 320 + Math.abs(dist) * 0.25);
    const t0 = performance.now();
    root.style.scrollBehavior = "auto";
    const frame = (now) => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      const eased = 1 - Math.pow(1 - p, 3);
      window.scrollTo(0, from + dist * eased);
      if (p < 1) {
        anim = requestAnimationFrame(frame);
      } else {
        target = null;
        root.style.scrollBehavior = "";
      }
    };
    anim = requestAnimationFrame(frame);
  }
  // a wheel / touch scroll takes over from a running animation
  ["wheel", "touchstart"].forEach((type) =>
    window.addEventListener(type, () => {
      if (target !== null) {
        cancelAnimationFrame(anim);
        target = null;
        root.style.scrollBehavior = "";
      }
    }, { passive: true })
  );

  function step(dir) {
    const y = target !== null ? target : window.scrollY;
    const view = window.innerHeight - nav.offsetHeight;
    const list = stops();
    if (dir > 0) {
      const next = list.find((t) => t > y + 4);
      if (next === undefined) return go(root.scrollHeight);
      go(next - y > view * 1.02 ? y + view * 0.86 : next);
    } else {
      const prev = list.reverse().find((t) => t < y - 4);
      if (prev === undefined) return go(0);
      go(y - prev > view * 1.02 ? y - view * 0.86 : prev);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

    if (box.classList.contains("open")) {
      // a focused <video> handles its own space / arrow keys
      if (e.target === boxVideo && e.key !== "Escape") return;
      if (e.key === " " && box.classList.contains("is-video")) {
        e.preventDefault();
        if (boxVideo.paused) boxVideo.play();
        else boxVideo.pause();
        return;
      }
      if (["Escape", " ", "Enter", "PageDown", "PageUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        closeBox();
      }
      return;
    }

    switch (e.key) {
      case "PageDown":
      case "ArrowRight":
        e.preventDefault();
        step(1);
        break;
      case " ":
        e.preventDefault();
        step(e.shiftKey ? -1 : 1);
        break;
      case "PageUp":
      case "ArrowLeft":
        e.preventDefault();
        step(-1);
        break;
      case "f":
      case "F":
        if (document.fullscreenElement) document.exitFullscreen();
        else root.requestFullscreen?.();
        break;
    }
  });
})();
