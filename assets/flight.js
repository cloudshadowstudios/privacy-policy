/* Cloudshadow Studios — the opening flight.
   Painted mountain ridges are generated as SVG, then scroll moves the camera up the valley:
   near ridges part and pass, the sun rises from first light to day, and a cloud's shadow
   drifts across the far range. */
(function () {
  "use strict";

  var stageEl = document.querySelector(".flight .stage");
  var flight = document.getElementById("flight");
  var range = document.getElementById("range");
  if (!stageEl || !flight || !range) return;

  var root = flight.style;
  var nav = document.getElementById("nav");
  var cloud = stageEl.querySelector(".cloud");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (cloud) {
    cloud.innerHTML = '<svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;overflow:visible">' +
      '<defs><filter id="cf" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>' +
      '<linearGradient id="cg" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="104"><stop offset=".45" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".72"/></linearGradient></defs>' +
      '<g filter="url(#cf)" fill="url(#cg)"><circle cx="92" cy="62" r="34"/><circle cx="140" cy="44" r="44"/><circle cx="196" cy="58" r="36"/>' +
      '<circle cx="236" cy="74" r="24"/><circle cx="58" cy="80" r="22"/><rect x="40" y="70" width="216" height="32" rx="16"/></g></svg>';
  }
  var NS = "http://www.w3.org/2000/svg";

  // ---- colour ----
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return "rgb(" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(",") + ")";
  }
  // three stops: first light, sunrise, day
  function tri(stops, l) { return l < 0.5 ? mix(stops[0], stops[1], l * 2) : mix(stops[1], stops[2], (l - 0.5) * 2); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  var SKY = {
    top: ["#131b31", "#2b3a63", "#4c86bd"],
    mid: ["#363c62", "#c78b88", "#9cc7df"],
    low: ["#5f5374", "#f2c08f", "#e6f1f4"]
  };

  // far to near
  var LAYERS = [
    { d: 0.05, side: 0, base: 0.53, amp: 0.31, kind: "alpine", seed: 1.7, fill: ["#4a5079", "#a77f93", "#8eb0c8"], snow: ["#8d8fb3", "#f3d2cc", "#f6fafb"] },
    { d: 0.15, side: 0, base: 0.63, amp: 0.25, kind: "alpine", seed: 4.1, fill: ["#3b4268", "#7e6782", "#6f93ad"], snow: ["#7a7da4", "#ebc3bf", "#eef4f7"], shadow: true },
    { d: 0.30, side: 0, base: 0.74, amp: 0.10, kind: "rolling", seed: 2.3, fill: ["#2c3654", "#4d5068", "#4f7b70"] },
    { d: 0.50, side: -1, top: 0.50, end: 0.58, seed: 5.2, fill: ["#232d48", "#3a3b52", "#3e6a59"], trees: 0.35 },
    { d: 0.64, side: 1, top: 0.47, end: 0.60, seed: 7.9, fill: ["#1e2740", "#323247", "#365f50"], trees: 0.45 },
    { d: 0.82, side: -1, top: 0.40, end: 0.50, seed: 3.3, fill: ["#18203a", "#29283a", "#2a4d40"], trees: 1 },
    { d: 0.97, side: 1, top: 0.36, end: 0.47, seed: 9.4, fill: ["#121a30", "#211f30", "#203e33"], trees: 1 }
  ];

  function rng(seed) {
    var s = Math.floor(seed * 1e6) >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function peak(x, f, ph, pow) { return Math.pow(1 - Math.abs(Math.sin(x * f + ph)), pow); }

  var W = 1000, H = 1000, layers = [], built = false;

  function ridgeY(L, x) {
    var u = x / H; // mountains keep their size whatever the screen width
    if (L.side === 0) {
      var r = L.kind === "alpine"
        ? 0.62 * peak(u, 4.2, L.seed, 1.9) + 0.30 * peak(u, 9.7, L.seed * 1.7, 2.4) + 0.08 * Math.sin(u * 37 + L.seed)
        : 0.6 * (0.5 + 0.5 * Math.sin(u * 3.1 + L.seed)) + 0.4 * (0.5 + 0.5 * Math.sin(u * 7.3 + L.seed * 2)) + 0.05 * Math.sin(u * 29);
      return H * L.base - H * L.amp * r;
    }
    // valley walls: high at the outside edge, falling to the valley floor
    var xr = L.side < 0 ? x : W - x;
    var endX = W * L.end;
    var t = clamp(xr / endX, 0, 1);
    var env = Math.pow(1 - t, 0.75);
    var rough = 0.035 * Math.sin(u * 13 + L.seed) + 0.02 * Math.sin(u * 31 + L.seed * 3);
    return H * (1.02 - (1.02 - L.top) * env) - H * rough * env;
  }

  function build() {
    var rect = stageEl.getBoundingClientRect();
    H = 1000;
    W = Math.round(1000 * Math.max(0.4, rect.width / Math.max(1, rect.height)));
    range.textContent = "";
    layers = [];
    LAYERS.forEach(function (L, i) {
      var wrap = document.createElement("div");
      wrap.className = "layer";
      var inner = document.createElement("div");
      inner.className = "intro";
      inner.style.position = "absolute";
      inner.style.inset = "0";
      inner.style.setProperty("--i", i);
      var svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("preserveAspectRatio", "none");

      var r = rng(L.seed), step = H * 0.004, pts = [];
      var treeGap = 0;
      for (var x = -step; x <= W + step; x += step) {
        var y = ridgeY(L, x);
        pts.push([x, y]);
        if (L.trees && y < H * 0.99) {
          treeGap -= step;
          if (treeGap <= 0 && r() < L.trees) {
            var th = H * (0.018 + 0.03 * r()) * (0.6 + L.d), tw = th * 0.46;
            // a fir in three tiers
            [[0.12, 0.3], [0.02, 0.3], [0.24, 0.62], [0.14, 0.62], [0.5, 1], [0.86, 0.62], [0.76, 0.62], [0.98, 0.3], [0.88, 0.3], [1, 0]].forEach(function (q) {
              pts.push([x + tw * q[0], y - th * q[1]]);
            });
            x += tw;
            treeGap = H * (0.006 + 0.02 * r());
          }
        }
      }
      var d = "M" + (-step) + "," + H + " L" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L") + " L" + (W + step) + "," + H + " Z";

      var defs = document.createElementNS(NS, "defs");
      var grad = document.createElementNS(NS, "linearGradient");
      grad.id = "g" + i; grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      var s1 = document.createElementNS(NS, "stop"); s1.setAttribute("offset", "0");
      var s2 = document.createElementNS(NS, "stop"); s2.setAttribute("offset", "1");
      grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
      svg.appendChild(defs);

      var land = document.createElementNS(NS, "path");
      land.setAttribute("d", d);
      land.setAttribute("fill", "url(#g" + i + ")");
      svg.appendChild(land);

      var snow = null;
      if (L.snow) {
        var top = [], bottom = [];
        for (var sx = 0; sx <= W; sx += step) {
          var ry = ridgeY(L, sx);
          var line = H * L.base - H * L.amp * (0.5 + 0.06 * Math.sin(sx / H * 41 + L.seed) + 0.04 * Math.sin(sx / H * 97));
          top.push(sx.toFixed(1) + "," + ry.toFixed(1));
          bottom.unshift(sx.toFixed(1) + "," + Math.max(ry, line).toFixed(1));
        }
        snow = document.createElementNS(NS, "path");
        snow.setAttribute("d", "M" + top.join(" L") + " L" + bottom.join(" L") + " Z");
        svg.appendChild(snow);
      }

      var shadow = null;
      if (L.shadow) {
        var clip = document.createElementNS(NS, "clipPath");
        clip.id = "c" + i;
        var cp = document.createElementNS(NS, "path"); cp.setAttribute("d", d); clip.appendChild(cp);
        var filter = document.createElementNS(NS, "filter");
        filter.id = "f" + i; filter.setAttribute("x", "-50%"); filter.setAttribute("y", "-50%"); filter.setAttribute("width", "200%"); filter.setAttribute("height", "200%");
        var blur = document.createElementNS(NS, "feGaussianBlur"); blur.setAttribute("stdDeviation", String(H * 0.018));
        filter.appendChild(blur);
        defs.appendChild(clip); defs.appendChild(filter);
        var g = document.createElementNS(NS, "g"); g.setAttribute("clip-path", "url(#c" + i + ")");
        var blurG = document.createElementNS(NS, "g");
        blurG.setAttribute("filter", "url(#f" + i + ")");
        shadow = document.createElementNS(NS, "g");
        shadow.setAttribute("fill", "#0d1626");
        blurG.appendChild(shadow);
        [[-0.42, 0.1, 0.55, 0.8], [0, -0.12, 0.7, 1], [0.45, 0.06, 0.5, 0.75]].forEach(function (e) {
          var el = document.createElementNS(NS, "ellipse");
          el.setAttribute("cx", String(e[0])); el.setAttribute("cy", String(e[1])); el.setAttribute("rx", String(e[2])); el.setAttribute("ry", String(e[3]));
          shadow.appendChild(el);
        });
        g.appendChild(blurG); svg.appendChild(g);
      }

      inner.appendChild(svg); wrap.appendChild(inner); range.appendChild(wrap);
      layers.push({ L: L, el: wrap, s1: s1, s2: s2, snow: snow, shadow: shadow, blurG: shadow ? shadow.parentNode : null });
      if (i === 2 && cloud) range.appendChild(cloud); // the cloud floats in front of the far ranges
      if (i === 1) {
        // the scroll ends with the cloud resting over this range's highest peak near the middle
        var best = { x: W * 0.6, y: H };
        for (var px = W * 0.3; px <= W * 0.58; px += 2) { var py = ridgeY(L, px); if (py < best.y) best = { x: px, y: py }; }
        L.peak = best;
      }
    });
    if (!built) {
      built = true;
      setTimeout(function () { range.querySelectorAll(".intro").forEach(function (n) { n.classList.remove("intro"); }); }, 2400);
    } else {
      range.querySelectorAll(".intro").forEach(function (n) { n.classList.remove("intro"); });
    }
  }

  var t0 = performance.now(), last = -1, lastT = 0, visible = true;

  function progress() {
    if (reduce.matches) return 0;
    var r = flight.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    return clamp(-r.top / Math.max(1, span), 0, 1);
  }

  function render(now) {
    var p = progress();
    var l = reduce.matches ? 1 : 0.2 + 0.8 * smooth(p, 0, 0.82);
    var vw = window.innerWidth, vh = stageEl.clientHeight;

    root.setProperty("--sky-top", tri(SKY.top, l));
    root.setProperty("--sky-mid", tri(SKY.mid, l));
    root.setProperty("--sky-low", tri(SKY.low, l));
    root.setProperty("--stars", String(clamp(1 - l * 2.2, 0, 1)));
    root.setProperty("--sun-y", (reduce.matches ? 20 : 76 - 56 * smooth(p, 0, 0.85)) + "%");
    root.setProperty("--sun-x", (reduce.matches ? 84 : 64 + 20 * smooth(p, 0.1, 0.9)) + "%");
    root.setProperty("--sun-core", tri(["#ff9f5a", "#ffd39a", "#fff6dc"], l));

    if (reduce.matches) {
      root.setProperty("--title-o", "1"); root.setProperty("--title-y", "0px");
      root.setProperty("--arrive-o", "1"); root.setProperty("--arrive-y", "0px"); root.setProperty("--arrive-v", "visible");
      root.setProperty("--cue-o", "0");
    } else {
      root.setProperty("--title-o", String(1 - smooth(p, 0.04, 0.22)));
      root.setProperty("--title-y", (-p * 26) + "vh");
      var ao = smooth(p, 0.66, 0.88);
      root.setProperty("--arrive-o", String(ao));
      root.setProperty("--arrive-y", ((1 - ao) * 26) + "px");
      root.setProperty("--arrive-v", ao > 0.01 ? "visible" : "hidden");
      root.setProperty("--cue-o", String(1 - smooth(p, 0, 0.06)));
    }

    // the cloud: drifts in from the left and comes to rest over the big peak, casting its shadow
    var unit = H / vh; // px -> svg units
    var k = reduce.matches ? 1 : smooth(p, 0, 0.94);
    var cs = 1 + 0.28 * k;
    var cw = (cloud ? cloud.offsetWidth : 300) * cs, ch = (cloud ? cloud.offsetHeight : 110) * cs;
    var pk = LAYERS[1].peak || { x: W * 0.6, y: H * 0.4 };
    var s1 = 1 + LAYERS[1].d * 1.1, ty1 = LAYERS[1].d * 14 * vh / 100;
    var peakX = vw / 2 + (pk.x / unit - vw / 2) * s1;
    var peakY = vh + (pk.y / unit - vh) * s1 + ty1;
    var endCx = peakX, endTop = Math.max(vh * 0.07, peakY - ch - vh * 0.09);
    var sway = reduce.matches ? 0 : Math.sin((now - t0) / 4200) * 10 * (1 - 0.6 * k);
    var cx = clamp((vw * 0.08 + (endCx - vw * 0.08) * k) - cw / 2 + sway, -cw * 0.4, vw - cw - vw * 0.02);
    var cy = vh * 0.15 + (endTop - vh * 0.15) * k;
    var co = 0.94;
    root.setProperty("--cloud-s", cs.toFixed(3));
    root.setProperty("--cloud-x", cx + "px");
    root.setProperty("--cloud-y", cy + "px");
    root.setProperty("--cloud-o", String(co));
    if (cloud) cloud.style.color = tri(["#8e8fb0", "#f6d6cf", "#ffffff"], l);

    for (var i = 0; i < layers.length; i++) {
      var o = layers[i], L = o.L, d = L.d;
      var s, tx, ty, op = 1;
      if (L.side === 0) {
        s = 1 + d * p * 1.1;
        tx = 0;
        ty = p * d * 14 * vh / 100;
      } else {
        s = 1 + Math.pow(d, 2.2) * Math.pow(p, 1.5) * 5.5;
        tx = L.side * Math.pow(p, 1.3) * d * 0.72 * vw;
        ty = p * d * d * 0.3 * vh;
        if (d > 0.75) op = 1 - smooth(p, 0.5, 0.86);
      }
      o.el.style.transform = "translate3d(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px,0) scale(" + s.toFixed(4) + ")";
      o.el.style.opacity = op < 1 ? op.toFixed(3) : "";
      o.el.style.visibility = op <= 0.001 ? "hidden" : "";
      var top = tri(L.fill, l);
      o.s1.setAttribute("stop-color", top);
      o.s2.setAttribute("stop-color", mix(L.fill[Math.round(l * 2)], "#0a1220", 0.18 + 0.1 * d));
      if (o.snow) o.snow.setAttribute("fill", tri(L.snow, l));
      if (o.shadow) {
        // where the cloud is over this layer, in the layer's own coordinates
        var ox = vw / 2, oy = vh;
        var sxPx = ox + (cx + cw * 0.5 - tx - ox) / s;
        var sx = sxPx * unit;
        var gy = ridgeY(L, sx) + H * 0.06;
        var rx = cw * unit * 0.55 / s, ryy = H * 0.085;
        // the group is a unit shape scaled into place, so the three parts stay together
        o.shadow.setAttribute("transform", "translate(" + sx.toFixed(1) + " " + gy.toFixed(1) + ") scale(" + rx.toFixed(1) + " " + ryy.toFixed(1) + ")");
        o.blurG.setAttribute("opacity", (0.5 * co * (0.55 + 0.45 * l)).toFixed(3));
      }
    }

    if (nav) {
      var solid = flight.getBoundingClientRect().bottom <= 72;
      nav.classList.toggle("solid", solid);
    }
  }

  function loop(now) {
    if (visible && !reduce.matches) render(now);
    requestAnimationFrame(loop);
  }
  window.addEventListener("scroll", function () {
    if (nav) nav.classList.toggle("solid", flight.getBoundingClientRect().bottom <= 72);
  }, { passive: true });

  build();
  render(performance.now());
  requestAnimationFrame(loop);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (!visible) render(performance.now()); }).observe(flight);
  }
  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var rect = stageEl.getBoundingClientRect();
      var nw = Math.round(1000 * Math.max(0.4, rect.width / Math.max(1, rect.height)));
      if (Math.abs(nw - W) > 20) build();
      render(performance.now());
    }, 150);
  });
  if (reduce.addEventListener) reduce.addEventListener("change", function () { render(performance.now()); });
})();
