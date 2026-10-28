/* Cloudshadow Studios — the opening flight.
   Everything is painted into one canvas and redrawn only when you scroll (and during the short
   load-in), so it stays smooth. The rock shading, snow and cloud detail are painted once at load
   into images, then placed each frame.

   Scrolling flies the camera up a valley: near ridges part and pass, the sun rises from first
   light to day, and a cloud drifts in until it sits above the range with its shadow on the
   mountains below. */
(function () {
  "use strict";

  var flight = document.getElementById("flight");
  var stage = flight && flight.querySelector(".stage");
  var canvas = document.getElementById("scene");
  if (!flight || !stage || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var root = flight.style;
  var nav = document.getElementById("nav");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function tri(stops, l) { // first light, sunrise, day
    var A = stops.map(hex);
    return l < 0.5 ? mixRGB(A[0], A[1], l * 2) : mixRGB(A[1], A[2], (l - 0.5) * 2);
  }
  function css(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a === undefined ? 1 : a) + ")"; }
  function rng(seed) {
    var s = Math.floor(seed * 1e6) >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // value noise
  function hash(ix, iy) {
    var h = (ix * 374761393 + iy * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise2(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm2(x, y, oct) {
    var s = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  function noise1(x) { return noise2(x, 17.3); }
  function ridged1(x) { var n = 1 - Math.abs(2 * noise1(x) - 1); return n * n; }

  var SKY = { top: ["#131b31", "#2b3a63", "#4c86bd"], mid: ["#363c62", "#c78b88", "#9cc7df"], low: ["#5f5374", "#f2c08f", "#e6f1f4"] };
  // rock and snow, lit and shaded, at first light, sunrise and day
  var LOOK = [
    { rockL: "#5a5e86", rockS: "#2f3356", snowL: "#a3a3cb", snowS: "#686b95", forL: "#262f4c", forS: "#1d2440" },
    { rockL: "#b08690", rockS: "#463f60", snowL: "#ffd5c6", snowS: "#958ab0", forL: "#3c4058", forS: "#2c2e45" },
    { rockL: "#aeb2b6", rockS: "#3a4456", snowL: "#fbfdff", snowS: "#aab9cf", forL: "#3f6650", forS: "#2a4a39" }
  ];

  // far to near. The far three are shaded rock, snow and forest; the rest are forest silhouettes.
  var LAYERS = [
    { d: 0.05, side: 0, base: 0.66, amp: 0.2, kind: "alpine", style: "distant", seed: 11.3, haze: 0.5, snow: 0.22 },
    { d: 0.15, side: 0, base: 0.76, amp: 0.46, kind: "alpine", style: "teton", seed: 27.9, haze: 0.1, snow: 0.14 },
    { d: 0.30, side: 0, base: 0.8, amp: 0.018, kind: "forest", seed: 4.4, haze: 0.05, trees: 0.9 },
    { d: 0.50, side: -1, top: 0.50, end: 0.58, seed: 5.2, fill: ["#232d48", "#3a3b52", "#3e6a59"], trees: 0.5 },
    { d: 0.64, side: 1, top: 0.47, end: 0.60, seed: 7.9, fill: ["#1e2740", "#323247", "#365f50"], trees: 0.6 },
    { d: 0.82, side: -1, top: 0.40, end: 0.50, seed: 3.3, fill: ["#18203a", "#29283a", "#2a4d40"], trees: 1 },
    { d: 0.97, side: 1, top: 0.36, end: 0.47, seed: 9.4, fill: ["#121a30", "#211f30", "#203e33"], trees: 1 }
  ];
  var STARS = (function () { var r = rng(0.42), a = []; for (var i = 0; i < 110; i++) a.push([r(), r() * 0.55, 0.5 + r() * 1.1, 0.35 + r() * 0.65]); return a; })();

  var W = 1000, H = 1000, cw = 0, chh = 0, dpr = 1, paths = [], ridges = [], details = [], cloudSprites = null, shadowSprite = null;

  // ---------- terrain ----------
  // Summits with concave flanks, like a real range, plus a little rough edge
  var peakSets = {};
  function peaksFor(L) {
    var key = L.seed + ":" + W;
    if (peakSets[key]) return peakSets[key];
    var r = rng(L.seed * 3.7), list = [], x = -0.3 * H;
    var teton = L.style === "teton", cx = W * 0.47, spread = Math.max(W * 0.3, H * 0.45);
    while (x < W + 0.3 * H) {
      var env = teton ? 0.3 + 0.7 * Math.exp(-Math.pow((x - cx) / spread, 2)) : 0.55 + 0.45 * noise1(x / H * 1.3 + L.seed);
      var h = L.amp * H * env * (0.45 + 0.55 * r());
      var steep = teton ? 0.38 + 0.3 * r() : 0.9 + 0.7 * r(); // width relative to height
      list.push({ x: x, h: h, wl: h * steep * (0.8 + 0.5 * r()), wr: h * steep * (0.8 + 0.5 * r()), kl: teton ? 0.8 + 0.35 * r() : 1.2 + 0.5 * r(), kr: teton ? 0.8 + 0.35 * r() : 1.2 + 0.5 * r() });
      x += H * (teton ? 0.035 + 0.06 * r() : 0.08 + 0.12 * r());
    }
    if (teton) { // the big one, with a shoulder on each side
      var g = L.amp * H;
      list.push({ x: cx, h: g, wl: g * 0.5, wr: g * 0.62, kl: 0.85, kr: 0.92 });
      list.push({ x: cx - g * 0.32, h: g * 0.78, wl: g * 0.42, wr: g * 0.4, kl: 0.9, kr: 0.9 });
      list.push({ x: cx + g * 0.38, h: g * 0.84, wl: g * 0.4, wr: g * 0.55, kl: 0.88, kr: 0.95 });
    }
    peakSets[key] = list;
    return list;
  }
  function alpineHeight(L, x) {
    var list = peaksFor(L), best = 0;
    for (var i = 0; i < list.length; i++) {
      var pk = list[i], d = x - pk.x, w = d < 0 ? pk.wl : pk.wr, kk = d < 0 ? pk.kl : pk.kr;
      d = Math.abs(d);
      if (d < w) { var v = pk.h * Math.pow(1 - d / w, kk); if (v > best) best = v; }
    }
    var u = x / H + L.seed;
    // jagged crests: notches and pinnacles scale with the height of the ridge
    best += best * (0.1 * (ridged1(u * 14) - 0.45) + 0.05 * (noise1(u * 45) - 0.5));
    return best + L.amp * H * (0.03 * (noise1(u * 13) - 0.5) + 0.03);
  }
  function forestHeight(L, x) {
    var u = x / H + L.seed;
    return H * L.amp * (0.7 * noise1(u * 1.6) + 0.3 * noise1(u * 4.3 + 2));
  }
  function ridgeY(L, x) {
    if (L.side === 0) return H * L.base - (L.kind === "alpine" ? alpineHeight(L, x) : forestHeight(L, x));
    var u = x / H;
    var xr = L.side < 0 ? x : W - x;
    var t = clamp(xr / (W * L.end), 0, 1);
    var env = Math.pow(1 - t, 0.75);
    var rough = 0.035 * (noise1(u * 6 + L.seed) - 0.5) * 2 + 0.02 * (noise1(u * 17 + L.seed) - 0.5) * 2;
    return H * (1.02 - (1.02 - L.top) * env) - H * rough * env;
  }

  function buildPaths() {
    ridges = []; paths = [];
    LAYERS.forEach(function (L, li) {
      var r = rng(L.seed), step = 2, p = new Path2D(), minY = H, treeGap = 0;
      var arr = new Float32Array(Math.ceil(W) + 3);
      for (var xi = 0; xi < arr.length; xi++) arr[xi] = ridgeY(L, xi - 1);
      ridges[li] = arr;
      p.moveTo(-step, H);
      for (var x = -step; x <= W + step; x += step) {
        var y = ridgeY(L, x);
        p.lineTo(x, y); if (y < minY) minY = y;
        if (L.trees && y < H * 0.99) {
          treeGap -= step;
          if (treeGap <= 0 && r() < L.trees) {
            var th = H * (0.012 + 0.03 * r()) * (0.5 + L.d), tw = th * (0.36 + 0.12 * r());
            [[0.14, 0.24], [0.04, 0.24], [0.22, 0.48], [0.12, 0.48], [0.3, 0.7], [0.22, 0.7], [0.5, 1], [0.78, 0.7], [0.7, 0.7], [0.88, 0.48], [0.78, 0.48], [0.96, 0.24], [0.86, 0.24], [1, 0]].forEach(function (q) {
              p.lineTo(x + tw * q[0], y - th * q[1]);
            });
            x += tw; treeGap = H * (0.003 + 0.016 * r());
          }
        }
      }
      p.lineTo(W + step, H); p.closePath();
      paths[li] = { land: p, minY: minY };
    });
  }

  // Shaded faces that fan down from each peak, snow on the high slopes running down the gullies.
  // Worked out once per layer, then coloured for first light, sunrise and day.
  function detailJob(li) {
    var L = LAYERS[li], u = chh / H;
    var minY = Math.max(0, paths[li].minY - 6);
    var bw = Math.max(1, Math.round(W * u)), bh = Math.max(1, Math.round((H - minY) * u));
    var R = ridges[li], n = R.length, s = L.seed, alpine = L.kind === "alpine";
    function crest(x) { var xi = clamp(x + 1, 0, n - 2), i0 = xi | 0, f = xi - i0; return R[i0] + (R[i0 + 1] - R[i0]) * f; }
    // crest slope, smoothed over a few widths (+ means the ground falls away to the right)
    var widths = [3, 10, 28, 60], S = widths.map(function (w) {
      var a = new Float32Array(n);
      for (var i = 0; i < n; i++) a[i] = (R[Math.min(n - 1, i + w)] - R[Math.max(0, i - w)]) / (Math.min(n - 1, i + w) - Math.max(0, i - w));
      return a;
    });
    function slopeAt(x, t) {
      var wf = clamp(Math.log(1 + t / 6) / Math.log(12), 0, 0.999) * (widths.length - 1);
      var w0 = wf | 0, ft = wf - w0, xi = clamp(Math.round(x) + 1, 0, n - 1);
      return S[w0][xi] + (S[w0 + 1][xi] - S[w0][xi]) * ft;
    }
    var forA = new Float32Array(bw * bh), shadeA = new Float32Array(bw * bh), snowA = new Float32Array(bw * bh), maskA = new Float32Array(bw * bh), depthA = new Float32Array(bw * bh);
    var P = alpine ? peaksFor(L) : null, baseAlt = H * (1 - L.base);
    function prof(pk, x) { var d = x - pk.x, w = d < 0 ? pk.wl : pk.wr; d = Math.abs(d); return d < w ? pk.h * Math.pow(1 - d / w, d === 0 ? 1 : (x < pk.x ? pk.kl : pk.kr)) : -1; }
    function column(px) {
      var x = px / u;
      var top = crest(x);
      for (var py = 0; py < bh; py++) {
        var y = minY + py / u, i = py * bw + px, t = y - top;
        if (t < -1.2) continue;
        maskA[i] = clamp(t + 1.2, 0, 1.2) / 1.2;
        var tt = Math.max(0, t);
        depthA[i] = tt;
        if (alpine) {
          // which summit this bit of mountainside belongs to; spur lines wander as they descend
          var xd = x - (noise1(y * 0.012 + s * 2 + x * 0.002) - 0.5) * tt * 0.32;
          var best = -1, pk = null;
          for (var q = 0; q < P.length; q++) { var v = prof(P[q], xd); if (v > best) { best = v; pk = P[q]; } }
          if (!pk) { shadeA[i] = -0.3; continue; }
          var dx = xd - pk.x;
          var lit = smooth(dx, -1.5, 1.5); // sun from the right: right-hand faces are lit
          var sh = -0.72 + 1.5 * lit;
          // gullies and buttresses running down the face, and a little shade lower down
          var along = dx * 0.06 - tt * 0.022 * (dx < 0 ? -1 : 1);
          sh += (noise2(along + s, tt * 0.012 + q) - 0.5) * 0.5;
          var fromTop = (baseAlt + pk.h) - (H - y);
          var low = clamp(fromTop / (pk.h + 1), 0, 1);
          sh = sh * (1 - 0.7 * low) - low * 0.3; // faces soften and darken toward the base
          shadeA[i] = clamp(sh, -1, 1);
          // snow: a cap on each summit, lower on the shady side, streaking down the gullies
          var cap = pk.h * (L.snow || 0.4) * (dx < 0 ? 1.15 : 0.85) * (0.75 + 0.5 * noise1(x * 0.045 + s * 5));
          var gully = Math.pow(noise2(along * 2.6 + s * 9, tt * 0.025), 3) * pk.h * (L.style === "teton" ? 0.85 : 0.5);
          var minAlt = baseAlt + L.amp * H * ((L.style === "teton" ? 0.2 : 0.32) + 0.12 * (noise1(x * 0.02 + s) - 0.5));
          snowA[i] = smooth(cap + gully - fromTop, -2, 3) * smooth(H - y - minAlt, -4, 8);
          if (L.style === "teton") { // forest climbs the lower slopes, ragged at the treeline
            var tl = baseAlt + L.amp * H * (0.12 + 0.1 * noise1(x * 0.03 + s) + 0.05 * noise1(x * 0.2 + s * 3));
            forA[i] = smooth(tl - (H - y), -3, 3);
          }
        } else {
          var sl = slopeAt(x, tt);
          shadeA[i] = clamp(Math.tanh(sl * 2.6) * 0.45 + (fbm2(x * 0.05 + s, y * 0.08, 2) - 0.5) * 0.25, -1, 1);
        }
      }
    }
    // colour one light at a time, a band of rows per slice, into a reusable buffer
    var cur = null;
    function colourStep(k, until) {
      if (!cur || cur.k !== k) {
        var look = LOOK[k];
        cur = { k: k, row: 0, img: new ImageData(bw, bh), skyLow: hex(SKY.low[k]),
          rl: hex(alpine ? look.rockL : look.forL), rs: hex(alpine ? look.rockS : look.forS), nl: hex(look.snowL), ns: hex(look.snowS), fl: hex(look.forL), fs: hex(look.forS) };
      }
      var data = cur.img.data, rl = cur.rl, rs = cur.rs, nl = cur.nl, ns = cur.ns, sk = cur.skyLow, hz = L.haze;
      while (cur.row < bh && performance.now() < until) {
        var end = (cur.row + 1) * bw;
        for (var i = cur.row * bw; i < end; i++) {
          var m = maskA[i]; if (m <= 0) continue;
          var f = shadeA[i] * 0.5 + 0.5;
          var r0 = rs[0] + (rl[0] - rs[0]) * f, g0 = rs[1] + (rl[1] - rs[1]) * f, b0 = rs[2] + (rl[2] - rs[2]) * f;
          var sn = snowA[i];
          if (sn > 0) {
            var fs = f * 1.15 > 1 ? 1 : f * 1.15;
            r0 += (ns[0] + (nl[0] - ns[0]) * fs - r0) * sn; g0 += (ns[1] + (nl[1] - ns[1]) * fs - g0) * sn; b0 += (ns[2] + (nl[2] - ns[2]) * fs - b0) * sn;
          }
          var fo = forA[i];
          if (fo > 0) { var fl = cur.fl, fs2 = cur.fs, ff = f * 0.6 + 0.2; r0 += (fs2[0] + (fl[0] - fs2[0]) * ff - r0) * fo; g0 += (fs2[1] + (fl[1] - fs2[1]) * ff - g0) * fo; b0 += (fs2[2] + (fl[2] - fs2[2]) * ff - b0) * fo; }
          var dk = depthA[i] / (H * 0.5); if (dk > 0.3) dk = 0.3;
          r0 += (14 - r0) * dk; g0 += (20 - g0) * dk; b0 += (34 - b0) * dk;
          r0 += (sk[0] - r0) * hz; g0 += (sk[1] - g0) * hz; b0 += (sk[2] - b0) * hz;
          var o = i * 4;
          data[o] = r0; data[o + 1] = g0; data[o + 2] = b0; data[o + 3] = m * 255;
        }
        cur.row++;
      }
      if (cur.row < bh) return null;
      var c = document.createElement("canvas"); c.width = bw; c.height = bh;
      c.getContext("2d").putImageData(cur.img, 0, 0);
      cur = null;
      return c;
    }
    // work in short slices so the page keeps animating while this paints
    var px = 0, looks = [];
    return {
      step: function (until) {
        while (px < bw && performance.now() < until) column(px++);
        if (px < bw) return null;
        if (looks.length < LOOK.length) { var c = colourStep(looks.length, until); if (c) looks.push(c); return null; }
        return { looks: looks, minY: minY };
      }
    };
  }

  // The logo cloud, painted smooth: same outline and puffs as the pixel logo, softened.
  var LOGO_CLOUD = [".............aaaaaa.............", "...........aagggggfaa...........", "..........aagggggfffaa..........", "..........aggggffffffa..........", ".......aaaggggffffffffaaa.......", ".....aaggddgfffffffffddggaaa....", "....aggggffdffffffffdggggffaa...", "...agggfffffdffffffdgggfffffa...", "..aaggffffffddfffffdggfffffffa..", ".aagddffffffedfffeedfffffffdda..", "aggfffdffffeedffeeedffffffdggfaa", "agffffdffeeeedeeeeedfffffdggfffa", "affffedfeeeedeeeeeedfffeedffffea", "aeeeeedeeeeddeeeeeeddeeeedeeeeea", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
  var LOGO_SHADOW = [".............cccccc.............", "..........cccccccccccc..........", ".....ccccccccccccccccccccccc....", "...cccccccccccccccccccccccccc...", "cccccccccccccccccccccccccccccccc", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"];
  var CLOUD = { w: 432, h: 228 };
  function boxBlur(A, w, h, r, passes) {
    var B = new Float32Array(w * h);
    for (var p = 0; p < passes; p++) {
      for (var y = 0; y < h; y++) { var acc = 0, row = y * w; for (var x = -r; x < w + r; x++) { if (x + r < w) acc += A[row + Math.min(w - 1, x + r)]; if (x - r - 1 >= 0) acc -= A[row + x - r - 1]; if (x >= 0) B[row + x] = acc / (2 * r + 1); } }
      for (var x2 = 0; x2 < w; x2++) { var acc2 = 0; for (var y2 = -r; y2 < h + r; y2++) { if (y2 + r < h) acc2 += B[Math.min(h - 1, y2 + r) * w + x2]; if (y2 - r - 1 >= 0) acc2 -= B[(y2 - r - 1) * w + x2]; if (y2 >= 0) A[y2 * w + x2] = acc2 / (2 * r + 1); } }
    }
    return A;
  }
  function gridToField(rows, scale, pad, toneOf) {
    var gw = rows[0].length, gh = rows.length, w = gw * scale + pad * 2, h = gh * scale + pad * 2;
    var M = new Float32Array(w * h), T = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var gx = Math.floor((x - pad) / scale), gy = Math.floor((y - pad) / scale);
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
      var ch = rows[gy].charAt(gx);
      if (ch === ".") continue;
      M[y * w + x] = 1; if (toneOf) T[y * w + x] = toneOf(ch);
    }
    return { w: w, h: h, M: M, T: T };
  }
  function buildClouds() {
    var TONE = { g: 1, f: 0.84, e: 0.6, d: 0.42, a: 0.6 };
    var F = gridToField(LOGO_CLOUD, 12, 24, function (c) { return TONE[c] || 0.6; });
    var w = F.w, h = F.h;
    for (var i = 0; i < w * h; i++) F.T[i] *= F.M[i];
    boxBlur(F.M, w, h, 7, 3); boxBlur(F.T, w, h, 7, 3);
    CLOUD.w = w; CLOUD.h = h;
    var looks = [
      { lit: "#c9c3df", dark: "#5c5f88" },
      { lit: "#fff3e8", dark: "#b18c9d" },
      { lit: "#ffffff", dark: "#a5b5c9" }
    ];
    cloudSprites = looks.map(function (look) {
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d"), img = g.createImageData(w, h), data = img.data;
      var Lc = hex(look.lit), Dc = hex(look.dark);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x, m = F.M[i];
        var a = smooth(m, 0.4, 0.6);
        if (a <= 0) continue;
        var tone = m > 0.01 ? F.T[i] / m : 0.6;
        var lightness = clamp(tone * 1.05 + 0.08 - (y / h) * 0.12, 0, 1);
        var col = mixRGB(Dc, Lc, lightness);
        var o = i * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = a * 252;
      }
      g.putImageData(img, 0, 0);
      return c;
    });
    // the logo's own shadow, a soft stepped mound
    var S = gridToField(LOGO_SHADOW, 3, 8, null);
    boxBlur(S.M, S.w, S.h, 3, 3);
    var s = document.createElement("canvas"); s.width = S.w; s.height = S.h;
    var sg = s.getContext("2d"), simg = sg.createImageData(S.w, S.h), sd = simg.data;
    for (var j = 0; j < S.w * S.h; j++) { sd[j * 4] = 10; sd[j * 4 + 1] = 18; sd[j * 4 + 2] = 34; sd[j * 4 + 3] = smooth(S.M[j], 0.15, 0.7) * 255; }
    sg.putImageData(simg, 0, 0);
    shadowSprite = s;
  }

  // ---------- layout ----------
  var jobId = 0, ready = false;
  function size() {
    var rect = stage.getBoundingClientRect();
    var ncw = Math.max(1, Math.round(rect.width)), nch = Math.max(1, Math.round(rect.height));
    var changed = ncw !== cw || nch !== chh;
    cw = ncw; chh = nch;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    var nw = Math.round(1000 * Math.max(0.4, cw / chh));
    if (nw !== W || !paths.length) { W = nw; buildPaths(); changed = true; }
    if (changed || !details.length) {
      // paint the rock detail in slices; keep showing the old version until the new one is done
      var job = ++jobId, idx = 0, cur = null, fresh = [];
      (function pump() {
        if (job !== jobId) return;
        if (!cloudSprites) { buildClouds(); requestAnimationFrame(pump); return; }
        if (!cur) cur = detailJob(idx);
        var res = cur.step(performance.now() + 7);
        if (res) {
          fresh[idx++] = res; cur = null;
          if (idx > 2) {
            details = fresh;
            if (!ready) { ready = true; loadT = performance.now(); }
            request();
            return;
          }
        }
        requestAnimationFrame(pump); // one slice per frame
      })();
    }
  }

  function progress() {
    if (reduce.matches) return 1;
    var r = flight.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
  }

  // ---------- paint ----------
  var loadT = performance.now();

  function layerTransform(L, p) {
    var s, tx, ty, op = 1;
    if (L.side === 0) { s = 1 + L.d * p * 1.1; tx = 0; ty = p * L.d * 0.14 * chh; }
    else {
      s = 1 + Math.pow(L.d, 2.2) * Math.pow(p, 1.5) * 5.5;
      tx = L.side * Math.pow(p, 1.3) * L.d * 0.72 * cw;
      ty = p * L.d * L.d * 0.3 * chh;
      op = L.d > 0.75 ? 1 - smooth(p, 0.5, 0.86) : 1;
    }
    return { s: s, tx: tx, ty: ty, op: op };
  }
  function applyLayer(T, introY) {
    var u = chh / H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(cw / 2 + T.tx, chh + T.ty + introY);
    ctx.scale(T.s * u, T.s * u);
    ctx.translate(-W / 2, -H);
  }

  function draw(now) {
    var p = progress();
    var still = reduce.matches;
    var l = still ? 1 : 0.2 + 0.8 * smooth(p, 0, 0.82);
    var intro = !ready ? 0 : still ? 1 : clamp((now - loadT) / 1500, 0, 1);
    var skyLow = tri(SKY.low, l);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    var sky = ctx.createLinearGradient(0, 0, 0, chh);
    sky.addColorStop(0, css(tri(SKY.top, l))); sky.addColorStop(0.46, css(tri(SKY.mid, l))); sky.addColorStop(1, css(skyLow));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, chh);
    var sa = clamp(1 - l * 2.2, 0, 1);
    if (sa > 0) {
      ctx.fillStyle = "#fff";
      STARS.forEach(function (s) { ctx.globalAlpha = sa * s[3]; ctx.fillRect(s[0] * cw, s[1] * chh, s[2], s[2]); });
      ctx.globalAlpha = 1;
    }
    // sun
    var sunX = cw * (still ? 0.84 : 0.64 + 0.2 * smooth(p, 0.1, 0.9)), sunY = chh * (still ? 0.2 : 0.76 - 0.56 * smooth(p, 0, 0.85));
    var sr = clamp(cw * 0.035, 26, 54), core = tri(["#ff9f5a", "#ffd39a", "#fff8e6"], l);
    var glow = ctx.createRadialGradient(sunX, sunY, sr * 0.5, sunX, sunY, sr * 7);
    glow.addColorStop(0, css([255, 222, 170], 0.5)); glow.addColorStop(0.3, css([255, 214, 160], 0.16)); glow.addColorStop(1, css([255, 214, 150], 0));
    ctx.fillStyle = glow; ctx.fillRect(sunX - sr * 7, sunY - sr * 7, sr * 14, sr * 14);
    ctx.fillStyle = css(core); ctx.beginPath(); ctx.arc(sunX, sunY, sr, 0, Math.PI * 2); ctx.fill();

    // cloud and shadow placement
    var k = still ? 1 : smooth(p, 0, 0.95);
    var cwid = clamp(cw * 0.22, 190, 360) * (1 + 0.25 * k), chgt = cwid * CLOUD.h / CLOUD.w;
    var ccx = cw * (0.12 + 0.38 * k);
    var ctop = chh * (0.1 - 0.06 * k);
    var shW = cwid * (1.0 + 0.35 * k), shH = shW * (0.16 + 0.1 * k);
    var shX = ccx, shY = chh * (0.56 - 0.09 * k);

    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i], T = layerTransform(L, p);
      var li = clamp(intro * 1.25 - i * 0.06, 0, 1);
      var a = T.op * li;
      if (a > 0.001) {
        applyLayer(T, (1 - easeOut(li)) * chh * 0.09);
        ctx.globalAlpha = a;
        if (L.side === 0) {
          if (details[i]) {
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            var dl = details[i], lo2 = l < 0.5 ? 0 : 1, f2 = l < 0.5 ? l * 2 : (l - 0.5) * 2;
            ctx.drawImage(dl.looks[lo2], 0, dl.minY, W, H - dl.minY);
            if (f2 > 0.004) { ctx.globalAlpha = a * f2; ctx.drawImage(dl.looks[lo2 + 1], 0, dl.minY, W, H - dl.minY); }
          } else {
            ctx.fillStyle = css(hex(LOOK[2].rockS)); ctx.fill(paths[i].land);
          }
        } else {
          var top = tri(L.fill, l);
          var g2 = ctx.createLinearGradient(0, paths[i].minY, 0, H);
          g2.addColorStop(0, css(top)); g2.addColorStop(1, css(mixRGB(top, [10, 18, 32], 0.2 + 0.1 * L.d)));
          ctx.fillStyle = g2; ctx.fill(paths[i].land);
        }
        ctx.globalAlpha = 1;
      }
      if (i === 1) {
        // the cloud's shadow falls on the big ranges
        ctx.save();
        applyLayer(layerTransform(LAYERS[1], p), 0);
        ctx.clip(paths[1].land);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = (0.36 + 0.2 * k) * clamp(intro * 1.4 - 0.3, 0, 1) * (0.55 + 0.45 * l);
        ctx.drawImage(shadowSprite, shX - shW / 2, shY - shH / 2, shW, shH);
        ctx.restore();
      }
      if (i === 2) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        var ca = clamp(intro * 1.4 - 0.2, 0, 1);
        var lo = l < 0.5 ? 0 : 1, t2 = l < 0.5 ? l * 2 : (l - 0.5) * 2;
        ctx.globalAlpha = ca; ctx.drawImage(cloudSprites[lo], ccx - cwid / 2, ctop, cwid, chgt);
        ctx.globalAlpha = ca * t2; ctx.drawImage(cloudSprites[lo + 1], ccx - cwid / 2, ctop, cwid, chgt);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // words
    if (still) {
      root.setProperty("--title-o", "1"); root.setProperty("--title-y", "0px");
      root.setProperty("--arrive-o", "1"); root.setProperty("--arrive-y", "0px"); root.setProperty("--arrive-v", "visible");
      root.setProperty("--cue-o", "0");
    } else {
      root.setProperty("--title-o", (1 - smooth(p, 0.04, 0.22)).toFixed(3));
      root.setProperty("--title-y", (-p * 26).toFixed(2) + "vh");
      var ao = smooth(p, 0.78, 0.95);
      root.setProperty("--arrive-o", ao.toFixed(3));
      root.setProperty("--arrive-y", ((1 - ao) * 20).toFixed(1) + "px");
      root.setProperty("--arrive-v", ao > 0.01 ? "visible" : "hidden");
      root.setProperty("--cue-o", (1 - smooth(p, 0, 0.06)).toFixed(3));
    }
    if (nav) nav.classList.toggle("solid", flight.getBoundingClientRect().bottom <= 72);
    return ready && intro < 1;
  }

  // ---------- draw only when something changed ----------
  var queued = false;
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function (now) {
      queued = false;
      if (draw(now)) request();
    });
  }

  size();
  request();
  window.addEventListener("scroll", request, { passive: true });
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { size(); request(); }, 150); });
  if (reduce.addEventListener) reduce.addEventListener("change", request);
})();
