/* Cloudshadow Studios — pixel landscape renderer.
   Draws sky, layered hills and drifting clouds whose shadows slide across the hills.
   Everything is drawn at low resolution and scaled up with crisp pixels. */
(function () {
  "use strict";

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var PALETTES = {
    day: {
      sky: ["#2a76c9", "#3887d8", "#4b98e2", "#62aaea", "#7fbdf0", "#a3d2f5", "#c3e3f8"],
      skyEnd: 0.66,
      layers: [
        { edge: "#a6cfdb", fill: "#8dbdcc", shade: "#6f9fb6", y: 0.56, amp: 0.07, f: [0.019, 0.047] },
        { edge: "#79c27a", fill: "#5daa64", shade: "#3f8654", y: 0.65, amp: 0.055, f: [0.028, 0.066], trees: 0.07 },
        { edge: "#86d672", fill: "#64be5b", shade: "#3e9244", y: 0.76, amp: 0.045, f: [0.022, 0.058], trees: 0.035 },
        { edge: "#a8e67f", fill: "#7dce61", shade: "#4d9b44", y: 0.88, amp: 0.035, f: [0.017, 0.043] }
      ],
      tree: { crown: "#2e8a46", crownShade: "#216a37", deep: "#18522a", trunk: "#6b4a2e" },
      cloud: { fill: "#ffffff", shade: "#d2e8f7" },
      stars: 0
    },
    night: {
      sky: ["#081428", "#0b1a33", "#10233f", "#162d4d", "#1d385c", "#26456b", "#30527a"],
      skyEnd: 0.66,
      layers: [
        { edge: "#3a5a7a", fill: "#2e4c69", shade: "#253f59", y: 0.56, amp: 0.07, f: [0.019, 0.047] },
        { edge: "#2f5f55", fill: "#244c45", shade: "#1b3c37", y: 0.65, amp: 0.055, f: [0.028, 0.066], trees: 0.07 },
        { edge: "#36705a", fill: "#295a49", shade: "#1f473a", y: 0.76, amp: 0.045, f: [0.022, 0.058], trees: 0.035 },
        { edge: "#43805f", fill: "#33684d", shade: "#26523d", y: 0.88, amp: 0.035, f: [0.017, 0.043] }
      ],
      tree: { crown: "#1b3f33", crownShade: "#14302a", deep: "#0f2620", trunk: "#2e2a26" },
      cloud: { fill: "#8ea3c4", shade: "#6b80a3" },
      stars: 0.0045,
      moon: { fill: "#f3edcc", spot: "#d6cfa8" }
    },
    // Wildline: dusk over red-rock terraces
    dusk: {
      sky: ["#3b2a5c", "#5a3468", "#7f3f6d", "#a8506a", "#d06c5f", "#ec9158", "#f7b867"],
      skyEnd: 0.7,
      layers: [
        { edge: "#a8606e", fill: "#8c4c62", shade: "#723f55", y: 0.55, amp: 0.1, f: [0.03, 0.08], terrace: 5 },
        { edge: "#d07a4a", fill: "#b5603c", shade: "#8f4a33", y: 0.66, amp: 0.09, f: [0.04, 0.09], terrace: 4 },
        { edge: "#e39352", fill: "#c8713f", shade: "#9c5634", y: 0.79, amp: 0.06, f: [0.03, 0.07], terrace: 3, trees: 0.03 },
        { edge: "#f0aa5c", fill: "#d98446", shade: "#a8613a", y: 0.92, amp: 0.025, f: [0.02, 0.05] }
      ],
      tree: { crown: "#4d6a3a", crownShade: "#3b532e", deep: "#2e4224", trunk: "#5a3a26" },
      cloud: { fill: "#f6c7a3", shade: "#d9918a" },
      stars: 0.004,
      sun: { fill: "#ffe39a", x: 0.72, y: 0.52 }
    },
    // Bog Blitz: green bog, river in front
    bog: {
      sky: ["#4f9fb8", "#64afc3", "#7bbfcd", "#94ced6", "#b1dddf", "#cfeae5"],
      skyEnd: 0.6,
      layers: [
        { edge: "#7fae9a", fill: "#6a9b88", shade: "#567f71", y: 0.5, amp: 0.12, f: [0.03, 0.061], peaks: true },
        { edge: "#5b9a5a", fill: "#478447", shade: "#356a39", y: 0.64, amp: 0.05, f: [0.035, 0.08], trees: 0.16 },
        { edge: "#6aa850", fill: "#548f40", shade: "#3f7232", y: 0.74, amp: 0.03, f: [0.03, 0.07], trees: 0.08 },
        { edge: "#9fd8e0", fill: "#4f9cad", shade: "#3c7f8f", y: 0.86, amp: 0, f: [0, 0], water: "#7cc1cf" }
      ],
      tree: { crown: "#2d6b3a", crownShade: "#22542d", deep: "#183f22", trunk: "#4e3a28" },
      cloud: { fill: "#ffffff", shade: "#cfe5e8" },
      stars: 0
    }
  };

  function hexToABGR(h) {
    var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  function Scene(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts || {};
    this.seed = this.opts.seed || 7;
    this.running = false;
    this.last = 0;
    this.acc = 0;
    this.t = 0;
  }

  Scene.prototype.setPalette = function (name) {
    this.paletteName = name;
    this.pal = PALETTES[name];
  };

  Scene.prototype.layout = function () {
    var host = this.opts.host || this.canvas.parentElement;
    var cw = host.clientWidth, ch = host.clientHeight;
    if (this.opts.aspect) ch = Math.round(cw / this.opts.aspect);
    var P = this.opts.pixel ? this.opts.pixel(cw) : Math.max(3, Math.min(6, Math.round(cw / 300)));
    var W = Math.max(40, Math.ceil(cw / P)), H = Math.max(30, Math.ceil(ch / P));
    this.P = P; this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    if (!this.opts.aspect) {
      this.canvas.style.width = W * P + "px";
      this.canvas.style.height = H * P + "px";
    }
    this.img = this.ctx.createImageData(W, H);
    this.out = new Uint32Array(this.img.data.buffer);
    this.buildBase();
    this.buildClouds();
  };

  Scene.prototype.buildBase = function () {
    var pal = this.pal, W = this.W, H = this.H, r = rng(this.seed);
    var colors = [], shadowOf = [];
    function add(hex, shadeIdx) { colors.push(hexToABGR(hex)); shadowOf.push(shadeIdx === undefined ? -1 : shadeIdx); return colors.length - 1; }

    var tall = H / W > 0.9; // portrait screens: push the land down a bit
    var shift = tall ? 0.05 : 0;

    var skyIdx = pal.sky.map(function (c) { return add(c); });
    var starIdx = add("#ffffff"), starDim = add("#9fb8d9");
    var moonIdx = pal.moon ? add(pal.moon.fill) : -1, moonSpot = pal.moon ? add(pal.moon.spot) : -1;
    var sunIdx = pal.sun ? add(pal.sun.fill) : -1;

    var layerIdx = pal.layers.map(function (L) {
      var shade = add(L.shade, undefined);
      var fill = add(L.fill, shade);
      var edge = add(L.edge, shade);
      shadowOf[shade] = shade;
      var water = L.water ? add(L.water, shade) : -1;
      return { fill: fill, edge: edge, shade: shade, water: water };
    });
    var t = pal.tree;
    var deep = add(t.deep); shadowOf[deep] = deep;
    var crownShade = add(t.crownShade, deep);
    var crown = add(t.crown, crownShade);
    var trunk = add(t.trunk); shadowOf[trunk] = trunk;

    var cfill = add(pal.cloud.fill), cshade = add(pal.cloud.shade);
    this.cloudIdx = { fill: cfill, shade: cshade };

    this.colors = Uint32Array.from(colors);
    this.shadowOf = Int16Array.from(shadowOf);
    this.starIdx = starIdx; this.starDim = starDim;

    var base = new Uint8Array(W * H);
    var skyEnd = H * (pal.skyEnd + shift);
    var n = skyIdx.length;
    for (var y = 0; y < H; y++) {
      var f = Math.min(n - 1, (y / skyEnd) * (n - 1));
      var i = Math.floor(f), frac = f - i;
      for (var x = 0; x < W; x++) {
        var k = i;
        if (i < n - 1) {
          if (frac > 0.82) k = i + 1;
          else if (frac > 0.6 && ((x + y) & 1) === 0) k = i + 1;
        }
        base[y * W + x] = skyIdx[k];
      }
    }

    // stars
    this.stars = [];
    if (pal.stars) {
      var count = Math.round(W * H * pal.stars);
      for (var s = 0; s < count; s++) {
        var sx = Math.floor(r() * W), sy = Math.floor(r() * H * 0.5);
        this.stars.push({ x: sx, y: sy, ph: r() * 6.28, sp: 0.6 + r() * 1.6 });
        base[sy * W + sx] = r() < 0.4 ? starIdx : starDim;
      }
    }

    // moon or sun
    function disc(cx, cy, rad, idx) {
      for (var yy = -rad; yy <= rad; yy++) for (var xx = -rad; xx <= rad; xx++) {
        if (xx * xx + yy * yy <= rad * rad + rad * 0.6) {
          var px = cx + xx, py = cy + yy;
          if (px >= 0 && px < W && py >= 0 && py < H) base[py * W + px] = idx;
        }
      }
    }
    if (pal.moon) {
      var mr = Math.max(4, Math.round(H * 0.045));
      var mx = Math.round(W * 0.9), my = Math.round(H * 0.3);
      disc(mx, my, mr, moonIdx);
      disc(mx - Math.round(mr * 0.35), my - Math.round(mr * 0.2), Math.max(1, Math.round(mr * 0.25)), moonSpot);
      disc(mx + Math.round(mr * 0.3), my + Math.round(mr * 0.35), Math.max(1, Math.round(mr * 0.18)), moonSpot);
    }
    if (pal.sun) {
      disc(Math.round(W * pal.sun.x), Math.round(H * pal.sun.y), Math.max(5, Math.round(H * 0.09)), sunIdx);
    }

    // hills, far to near
    var tops = [];
    pal.layers.forEach(function (L, li) {
      var ids = layerIdx[li];
      var ph0 = r() * 6.28, ph1 = r() * 6.28;
      var top = new Int16Array(W);
      for (var x = 0; x < W; x++) {
        var wave = L.amp ? (0.62 * Math.sin(x * L.f[0] + ph0) + 0.38 * Math.sin(x * L.f[1] + ph1)) : 0;
        if (L.peaks) wave = 1 - Math.abs(wave) * 1.6;
        var h = H * (L.y + shift) - H * L.amp * wave;
        if (L.terrace) h = Math.round(h / L.terrace) * L.terrace;
        top[x] = Math.round(h);
      }
      for (x = 0; x < W; x++) {
        for (var y = Math.max(0, top[x]); y < H; y++) {
          var idx = ids.fill;
          if (y === top[x]) idx = ids.edge;
          else if (L.terrace && x > 0 && top[x - 1] > top[x] && y < top[x - 1]) idx = ids.shade; // cliff faces
          if (L.water !== undefined && ids.water >= 0) {
            var d = y - top[x];
            if (d > 0 && ((x * 7 + y * 13) % 23 === 0 || ((x + d * 3) % 17 === 0 && d % 3 === 1))) idx = ids.water;
          }
          base[y * W + x] = idx;
        }
      }
      tops.push(top);

      // trees along the ridge
      if (L.trees) {
        var lastTree = -10;
        for (x = 2; x < W - 2; x++) {
          if (x - lastTree < 5 || r() > L.trees) continue;
          lastTree = x;
          var gy = top[x], tall2 = r() < 0.5;
          var ty = gy - (tall2 ? 4 : 3);
          // crown
          for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > 3) continue;
            var px = x + dx, py = ty + dy;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            base[py * W + px] = (dx > 0 || dy > 0) ? crownShade : crown;
          }
          for (var yy = ty + 3; yy < gy; yy++) if (yy >= 0) base[yy * W + x] = trunk;
        }
      }
    });
    this.tops = tops;
    this.base = base;
    this.shift = shift;
  };

  Scene.prototype.makeCloud = function (r, z, x) {
    var H = this.H, W = this.W;
    var w = Math.round(H * (0.12 + 0.26 * z) * (this.opts.cloudScale || 1));
    w = Math.max(10, Math.min(w, Math.round(W * 0.5)));
    var h = Math.max(5, Math.round(w * 0.42));
    var bumps = [], k = 3 + Math.floor(r() * 2);
    for (var i = 0; i < k; i++) {
      var cx = lerp(0.24, 0.76, k === 1 ? 0.5 : i / (k - 1)) * w + (r() - 0.5) * w * 0.08;
      var rad = w * lerp(0.16, 0.27, r());
      bumps.push([cx, h - rad * 0.95, rad]);
    }
    var mask = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x2 = 0; x2 < w; x2++) {
      var inside = (y >= h * 0.55 && x2 >= w * 0.08 && x2 <= w * 0.92);
      for (var b = 0; !inside && b < bumps.length; b++) {
        var dx = x2 + 0.5 - bumps[b][0], dy = y + 0.5 - bumps[b][1];
        if (dx * dx + dy * dy <= bumps[b][2] * bumps[b][2]) inside = true;
      }
      if (inside) mask[y * w + x2] = 1;
    }
    // bottom rim shading
    for (y = 0; y < h; y++) for (x2 = 0; x2 < w; x2++) {
      if (!mask[y * w + x2]) continue;
      var below = y + 2 < h ? mask[(y + 2) * w + x2] : 0;
      if (!below) mask[y * w + x2] = 2;
    }
    var y0 = lerp(H * (0.4 + this.shift), H * 0.05, z) - h / 2;
    return {
      x: x, y: Math.round(y0), w: w, h: h, z: z, mask: mask,
      speed: lerp(1.0, 3.6, z),
      gy: lerp(H * (0.6 + this.shift), H * 0.97, z),
      wob: r() * 6.28
    };
  };

  Scene.prototype.buildClouds = function () {
    var r = rng(this.seed * 31 + 3), W = this.W;
    var count = this.opts.clouds !== undefined ? this.opts.clouds : Math.round(W / 70) + 2;
    var list = [];
    for (var i = 0; i < count; i++) {
      var z = (i + r() * 0.8) / count;
      list.push(this.makeCloud(r, 0.15 + z * 0.85, Math.round(r() * (W + 40)) - 20));
    }
    list.sort(function (a, b) { return a.z - b.z; });
    this.cloudRng = r;
    this.clouds = list;
  };

  Scene.prototype.draw = function () {
    var W = this.W, H = this.H, base = this.base, out = this.out, colors = this.colors, shadowOf = this.shadowOf;
    var idx = this.idxBuf && this.idxBuf.length === base.length ? this.idxBuf : (this.idxBuf = new Uint8Array(base.length));
    idx.set(base);

    // twinkling stars
    if (this.stars.length && this.animating) {
      for (var s = 0; s < this.stars.length; s++) {
        var st = this.stars[s];
        if (Math.sin(this.t * st.sp + st.ph) > 0.75) idx[st.y * W + st.x] = this.starIdx;
      }
    }

    // cloud shadows on the land
    var clouds = this.clouds;
    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      var cx = Math.floor(cl.x) + cl.w / 2 + (cl.gy - (cl.y + cl.h / 2)) * 0.32;
      var gy = cl.gy;
      var rx = cl.w * (0.5 + 0.25 * cl.z), ry = Math.max(1.6, rx * (0.12 + 0.12 * cl.z));
      var x0 = Math.max(0, Math.floor(cx - rx * 1.4)), x1 = Math.min(W - 1, Math.ceil(cx + rx * 1.4));
      var y0 = Math.max(0, Math.floor(gy - ry * 1.4)), y1 = Math.min(H - 1, Math.ceil(gy + ry * 1.4));
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var ax = (x - (cx - rx * 0.3)) / rx, ay = (y - gy) / ry;
          var bx = (x - (cx + rx * 0.35)) / (rx * 0.8), by = (y - gy - ry * 0.25) / (ry * 0.9);
          var d = Math.min(ax * ax + ay * ay, bx * bx + by * by);
          if (d >= 1) continue;
          if (d > 0.7 && ((x + y) & 1)) continue;
          var p = y * W + x, sh = shadowOf[idx[p]];
          if (sh >= 0) idx[p] = sh;
        }
      }
    }

    // clouds
    var cf = this.cloudIdx.fill, cs = this.cloudIdx.shade;
    for (c = 0; c < clouds.length; c++) {
      cl = clouds[c];
      var ox = Math.floor(cl.x), oy = cl.y + Math.round(Math.sin(this.t * 0.25 + cl.wob) * 0.6);
      for (var my = 0; my < cl.h; my++) {
        var py = oy + my; if (py < 0 || py >= H) continue;
        for (var mx = 0; mx < cl.w; mx++) {
          var m = cl.mask[my * cl.w + mx]; if (!m) continue;
          var px = ox + mx; if (px < 0 || px >= W) continue;
          idx[py * W + px] = m === 2 ? cs : cf;
        }
      }
    }

    for (var i = 0; i < idx.length; i++) out[i] = colors[idx[i]];
    this.ctx.putImageData(this.img, 0, 0);
  };

  Scene.prototype.step = function (dt) {
    this.t += dt;
    var W = this.W;
    for (var c = 0; c < this.clouds.length; c++) {
      var cl = this.clouds[c];
      cl.x += cl.speed * dt;
      if (cl.x > W + 20 + cl.w * 0.6) {
        var fresh = this.makeCloud(this.cloudRng, cl.z, -cl.w * 2 - Math.round(this.cloudRng() * 60));
        this.clouds[c] = fresh;
      }
    }
  };

  Scene.prototype.start = function () {
    if (this.running) return;
    this.running = true; this.animating = true;
    var self = this;
    this.last = performance.now();
    function frame(now) {
      if (!self.running) return;
      var dt = Math.min(0.1, (now - self.last) / 1000);
      self.last = now;
      self.acc += dt;
      if (self.acc >= 1 / 20) { self.step(self.acc); self.acc = 0; self.draw(); }
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };
  Scene.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  window.CloudScene = { Scene: Scene, palettes: PALETTES };

  // ---------- page wiring ----------
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  ready(function () {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var dark = window.matchMedia("(prefers-color-scheme: dark)");

    // Hero
    var heroCanvas = document.getElementById("sky");
    if (heroCanvas) {
      var hero = heroCanvas.parentElement;
      var scene = new Scene(heroCanvas, { host: hero, seed: 11 });
      var pauseBtn = document.getElementById("pause-sky");
      var userPaused = false, visible = true;
      var setPal = function () { scene.setPalette(dark.matches ? "night" : "day"); };
      setPal();
      scene.layout();
      scene.draw();

      var sync = function () {
        var shouldRun = !reduce.matches && !userPaused && visible && !document.hidden;
        if (shouldRun) scene.start(); else { scene.stop(); scene.animating = false; scene.draw(); }
        if (pauseBtn) {
          pauseBtn.hidden = reduce.matches;
          pauseBtn.textContent = userPaused ? "Play clouds" : "Pause clouds";
          pauseBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
        }
      };
      if (pauseBtn) pauseBtn.addEventListener("click", function () { userPaused = !userPaused; sync(); });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (e) { visible = e[0].isIntersecting; sync(); }).observe(hero);
      }
      document.addEventListener("visibilitychange", sync);
      reduce.addEventListener && reduce.addEventListener("change", sync);
      dark.addEventListener && dark.addEventListener("change", function () { setPal(); scene.layout(); scene.draw(); });
      var rt;
      window.addEventListener("resize", function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          var oldW = scene.W;
          scene.layout();
          scene.draw();
        }, 120);
      });
      sync();
    }

    // Static banners for games in development
    var banners = document.querySelectorAll("canvas[data-scene]");
    var drawBanners = function () {
      banners.forEach(function (cv) {
        var s = new Scene(cv, {
          host: cv.parentElement, aspect: 16 / 9, seed: +cv.dataset.seed || 5, clouds: +cv.dataset.clouds || 3,
          pixel: function (w) { return Math.max(3, Math.round(w / 170)); }
        });
        s.setPalette(cv.dataset.scene);
        s.layout();
        s.draw();
      });
    };
    if (banners.length) {
      drawBanners();
      var bt;
      window.addEventListener("resize", function () { clearTimeout(bt); bt = setTimeout(drawBanners, 150); });
    }
  });
})();
