/* Cloudshadow Studios — the opening flight.
   The whole scene is painted into one canvas and redrawn only when you scroll (and during the
   short load-in), so it stays smooth. Scrolling flies the camera up the valley: near ridges part
   and pass, the sun rises from first light to day, and a cloud drifts in until it sits above the
   valley with its shadow lying front and centre on the land below. */
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
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mixRGB(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function tri(stops, l) { // first light, sunrise, day
    var A = stops.map(hex);
    return l < 0.5 ? mixRGB(A[0], A[1], l * 2) : mixRGB(A[1], A[2], (l - 0.5) * 2);
  }
  function css(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a === undefined ? 1 : a) + ")"; }
  function darken(c, t) { return mixRGB(c, [10, 18, 32], t); }
  function rng(seed) {
    var s = Math.floor(seed * 1e6) >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function peak(x, f, ph, pow) { return Math.pow(1 - Math.abs(Math.sin(x * f + ph)), pow); }

  var SKY = { top: ["#131b31", "#2b3a63", "#4c86bd"], mid: ["#363c62", "#c78b88", "#9cc7df"], low: ["#5f5374", "#f2c08f", "#e6f1f4"] };
  var LAYERS = [
    { d: 0.05, side: 0, base: 0.53, amp: 0.31, kind: "alpine", seed: 1.7, fill: ["#4a5079", "#a77f93", "#8eb0c8"], snow: ["#8d8fb3", "#f3d2cc", "#f6fafb"] },
    { d: 0.15, side: 0, base: 0.63, amp: 0.25, kind: "alpine", seed: 4.1, fill: ["#3b4268", "#7e6782", "#6f93ad"], snow: ["#7a7da4", "#ebc3bf", "#eef4f7"] },
    { d: 0.30, side: 0, base: 0.74, amp: 0.10, kind: "rolling", seed: 2.3, fill: ["#2c3654", "#4d5068", "#56826f"] },
    { d: 0.50, side: -1, top: 0.50, end: 0.58, seed: 5.2, fill: ["#232d48", "#3a3b52", "#3e6a59"], trees: 0.35 },
    { d: 0.64, side: 1, top: 0.47, end: 0.60, seed: 7.9, fill: ["#1e2740", "#323247", "#365f50"], trees: 0.45 },
    { d: 0.82, side: -1, top: 0.40, end: 0.50, seed: 3.3, fill: ["#18203a", "#29283a", "#2a4d40"], trees: 1 },
    { d: 0.97, side: 1, top: 0.36, end: 0.47, seed: 9.4, fill: ["#121a30", "#211f30", "#203e33"], trees: 1 }
  ];
  var STARS = (function () { var r = rng(0.42), a = []; for (var i = 0; i < 90; i++) a.push([r(), r() * 0.55, 0.5 + r() * 1.1, 0.4 + r() * 0.6]); return a; })();

  var W = 1000, H = 1000, cw = 0, chh = 0, dpr = 1, paths = [], cloudSprites = null, shadowSprite = null;

  function ridgeY(L, x) {
    var u = x / H;
    if (L.side === 0) {
      var r = L.kind === "alpine"
        ? 0.62 * peak(u, 4.2, L.seed, 1.9) + 0.30 * peak(u, 9.7, L.seed * 1.7, 2.4) + 0.08 * Math.sin(u * 37 + L.seed)
        : 0.6 * (0.5 + 0.5 * Math.sin(u * 3.1 + L.seed)) + 0.4 * (0.5 + 0.5 * Math.sin(u * 7.3 + L.seed * 2)) + 0.05 * Math.sin(u * 29);
      return H * L.base - H * L.amp * r;
    }
    var xr = L.side < 0 ? x : W - x;
    var t = clamp(xr / (W * L.end), 0, 1);
    var env = Math.pow(1 - t, 0.75);
    var rough = 0.035 * Math.sin(u * 13 + L.seed) + 0.02 * Math.sin(u * 31 + L.seed * 3);
    return H * (1.02 - (1.02 - L.top) * env) - H * rough * env;
  }

  // ---------- shapes, built once (and again if the window shape changes a lot) ----------
  function buildPaths() {
    paths = LAYERS.map(function (L) {
      var r = rng(L.seed), step = H * 0.004, p = new Path2D(), minY = H, treeGap = 0;
      p.moveTo(-step, H);
      for (var x = -step; x <= W + step; x += step) {
        var y = ridgeY(L, x);
        p.lineTo(x, y); minY = Math.min(minY, y);
        if (L.trees && y < H * 0.99) {
          treeGap -= step;
          if (treeGap <= 0 && r() < L.trees) {
            var th = H * (0.018 + 0.03 * r()) * (0.6 + L.d), tw = th * 0.46;
            [[0.12, 0.3], [0.02, 0.3], [0.24, 0.62], [0.14, 0.62], [0.5, 1], [0.86, 0.62], [0.76, 0.62], [0.98, 0.3], [0.88, 0.3], [1, 0]].forEach(function (q) {
              p.lineTo(x + tw * q[0], y - th * q[1]);
            });
            x += tw; treeGap = H * (0.006 + 0.02 * r());
          }
        }
      }
      p.lineTo(W + step, H); p.closePath();
      var snow = null;
      if (L.snow) {
        snow = new Path2D();
        var bottom = [];
        for (var sx = 0; sx <= W; sx += step) {
          var ry = ridgeY(L, sx);
          var line = H * L.base - H * L.amp * (0.5 + 0.06 * Math.sin(sx / H * 41 + L.seed) + 0.04 * Math.sin(sx / H * 97));
          if (sx === 0) snow.moveTo(sx, ry); else snow.lineTo(sx, ry);
          bottom.push([sx, Math.max(ry, line)]);
        }
        for (var i = bottom.length - 1; i >= 0; i--) snow.lineTo(bottom[i][0], bottom[i][1]);
        snow.closePath();
      }
      return { land: p, snow: snow, minY: minY };
    });
  }

  // The cloud and its shadow are painted small then scaled up, which softens their edges cheaply.
  var PUFFS = [[92, 62, 34], [140, 44, 44], [196, 58, 36], [236, 74, 24], [58, 80, 22]];
  function cloudShape(c, k, base) {
    c.beginPath();
    PUFFS.forEach(function (q) { c.moveTo((q[0] + q[2]) * k, q[1] * k); c.arc(q[0] * k, q[1] * k, q[2] * k, 0, Math.PI * 2); });
    var x = 40 * k, y = 70 * k, w = 216 * k, h = base * k, r = Math.min(16 * k, h / 2);
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function buildSprites() {
    cloudSprites = [["#8e8fb0", "#6f7194"], ["#f6d6cf", "#d9aeb0"], ["#ffffff", "#d9e6ee"]].map(function (cols) {
      var c = document.createElement("canvas"); c.width = 200; c.height = 76;
      var g = c.getContext("2d"), k = 0.66;
      var grad = g.createLinearGradient(0, 20 * k, 0, 104 * k);
      grad.addColorStop(0.45, cols[0]); grad.addColorStop(1, cols[1]);
      g.fillStyle = grad; cloudShape(g, k, 32); g.fill();
      return c;
    });
    var s = document.createElement("canvas"); s.width = 34; s.height = 15;
    var sg = s.getContext("2d"); sg.fillStyle = "#0b1424";
    sg.translate(2, 1); cloudShape(sg, 0.1, 34); sg.fill();
    shadowSprite = s;
  }

  // ---------- layout ----------
  function size() {
    var rect = stage.getBoundingClientRect();
    cw = Math.max(1, Math.round(rect.width)); chh = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    var nw = Math.round(1000 * Math.max(0.4, cw / chh));
    if (nw !== W || !paths.length) { W = nw; buildPaths(); }
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
  // put the canvas into a layer's own shape coordinates
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
    var intro = still ? 1 : clamp((now - loadT) / 1500, 0, 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, chh);
    sky.addColorStop(0, css(tri(SKY.top, l))); sky.addColorStop(0.46, css(tri(SKY.mid, l))); sky.addColorStop(1, css(tri(SKY.low, l)));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, chh);
    // stars
    var sa = clamp(1 - l * 2.2, 0, 1);
    if (sa > 0) {
      ctx.fillStyle = "#fff";
      STARS.forEach(function (s) { ctx.globalAlpha = sa * s[3]; ctx.fillRect(s[0] * cw, s[1] * chh, s[2], s[2]); });
      ctx.globalAlpha = 1;
    }
    // sun
    var sunX = cw * (still ? 0.84 : 0.64 + 0.2 * smooth(p, 0.1, 0.9)), sunY = chh * (still ? 0.2 : 0.76 - 0.56 * smooth(p, 0, 0.85));
    var sr = clamp(cw * 0.04, 30, 60), core = tri(["#ff9f5a", "#ffd39a", "#fff6dc"], l);
    var glow = ctx.createRadialGradient(sunX, sunY, sr * 0.6, sunX, sunY, sr * 4.5);
    glow.addColorStop(0, css([255, 214, 150], 0.35)); glow.addColorStop(1, css([255, 214, 150], 0));
    ctx.fillStyle = glow; ctx.fillRect(sunX - sr * 5, sunY - sr * 5, sr * 10, sr * 10);
    ctx.fillStyle = css(core); ctx.beginPath(); ctx.arc(sunX, sunY, sr, 0, Math.PI * 2); ctx.fill();

    // cloud: drifts in from the left and settles above the middle of the valley
    var k = still ? 1 : smooth(p, 0, 0.95);
    var cwid = clamp(cw * 0.26, 210, 430) * (1 + 0.32 * k), chgt = cwid * 110 / 300;
    var ccx = cw * (0.12 + 0.38 * k);
    var ctop = chh * (0.15 - 0.05 * k);
    // its shadow: first on the far slopes, then front and centre on the valley floor
    var shW = cwid * (0.95 + 0.45 * k), shH = shW * (0.2 + 0.08 * k);
    var shX = ccx, shY = chh * (0.56 + 0.14 * k);

    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i], T = layerTransform(L, p);
      var li = clamp(intro * 1.25 - i * 0.06, 0, 1);
      var a = T.op * li;
      if (a > 0.001) {
        applyLayer(T, (1 - easeOut(li)) * chh * 0.09);
        ctx.globalAlpha = a;
        var top = tri(L.fill, l);
        var grad = ctx.createLinearGradient(0, paths[i].minY, 0, H);
        grad.addColorStop(0, css(top)); grad.addColorStop(1, css(darken(top, 0.2 + 0.1 * L.d)));
        ctx.fillStyle = grad; ctx.fill(paths[i].land);
        if (paths[i].snow) { ctx.fillStyle = css(tri(L.snow, l)); ctx.fill(paths[i].snow); }
        ctx.globalAlpha = 1;
      }
      if (i === 2) {
        // the shadow, kept to the land (the far range's shape reaches down to the valley floor)
        ctx.save();
        applyLayer(layerTransform(LAYERS[0], p), 0);
        ctx.clip(paths[0].land);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = (0.3 + 0.12 * k) * clamp(intro * 1.4 - 0.3, 0, 1) * (0.6 + 0.4 * l);
        ctx.drawImage(shadowSprite, shX - shW / 2, shY - shH / 2, shW, shH);
        ctx.restore();
        // the cloud, in front of the far ranges
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        var ca = clamp(intro * 1.4 - 0.2, 0, 1) * 0.96;
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
    return intro < 1;
  }

  // ---------- draw only when something changed ----------
  var queued = false;
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function (now) {
      queued = false;
      if (draw(now)) request(); // keep going while the load-in plays
    });
  }

  buildSprites();
  size();
  request();
  window.addEventListener("scroll", request, { passive: true });
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { size(); request(); }, 120); });
  if (reduce.addEventListener) reduce.addEventListener("change", request);
})();
