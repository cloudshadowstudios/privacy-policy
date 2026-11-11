/* Cloudshadow Studios — the opening flight over the Tetons.

   The mountains are real: the terrain is built from USGS elevation data for the Teton Range
   (Mount Moran in the north to Buck Mountain in the south, about 16 by 24 km), with finer rock
   detail added on top. It is drawn in WebGL.

   Scrolling flies the camera in from Jackson Hole toward the Grand Teton while the sun comes up
   behind you: first light catches the summits, the lit line slides down the range, the valley
   mist burns off, and a cloud drifts in until its shadow lies across the east face.

   If WebGL isn't available the still image behind the canvas stays in place. */
(function () {
  "use strict";

  var flight = document.getElementById("flight");
  var stage = flight && flight.querySelector(".stage");
  var canvas = document.getElementById("scene");
  if (!flight || !stage || !canvas) return;
  var root = flight.style;
  var nav = document.getElementById("nav");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(x, a, b) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function keys(stops, l) { // evenly spaced colour stops
    var n = stops.length - 1, f = clamp(l, 0, 1) * n, i = Math.min(n - 1, f | 0);
    return mix3(stops[i], stops[i + 1], f - i);
  }
  function progress() {
    if (reduce.matches) return 1;
    var r = flight.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
  }

  // ---------- words (work with or without WebGL) ----------
  function words(p, still) {
    if (still) {
      root.setProperty("--title-o", "1"); root.setProperty("--title-y", "0px");
      root.setProperty("--arrive-o", "1"); root.setProperty("--arrive-y", "0px"); root.setProperty("--arrive-v", "visible");
      root.setProperty("--cue-o", "0");
    } else {
      root.setProperty("--title-o", (1 - smooth(p, 0.04, 0.22)).toFixed(3));
      root.setProperty("--title-y", (-p * 26).toFixed(2) + "vh");
      var ao = smooth(p, 0.8, 0.96);
      root.setProperty("--arrive-o", ao.toFixed(3));
      root.setProperty("--arrive-y", ((1 - ao) * 20).toFixed(1) + "px");
      root.setProperty("--arrive-v", ao > 0.01 ? "visible" : "hidden");
      root.setProperty("--cue-o", (1 - smooth(p, 0, 0.06)).toFixed(3));
    }
    if (nav) nav.classList.toggle("solid", flight.getBoundingClientRect().bottom <= 72);
  }

  var gl = null;
  try {
    var opts = { antialias: true, alpha: false, powerPreference: "high-performance" };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  } catch (e) { gl = null; }
  var uintIdx = gl && gl.getExtension("OES_element_index_uint");
  if (!gl || !uintIdx) {
    // no 3D: the still image stays, the words still work
    var plain = function () { words(progress(), reduce.matches); };
    plain(); window.addEventListener("scroll", plain, { passive: true }); window.addEventListener("resize", plain);
    return;
  }

  // ---------- the land ----------
  // 80 x 130 samples, west to east and north to south, 4 m steps above 1800 m, row-delta coded
  var DEM = "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";
  var KX = 16.146, KZ = 24.111;  // size of the data in km
  var EX = 1.45;                 // vertical stretch
  var TW = 1024, TH = 2048;       // baked height + shadow map

  // Runs in a worker. Returns the height map with two baked sun shadows, and the mesh heights.
  function bake(DEM, TW, TH, KX, KZ, EX, MW, MH, SUNS) {
    var DW = 80, DH = 130, bin = atob(DEM), dem = new Float32Array(DW * DH), p = 0;
    for (var y = 0; y < DH; y++) {
      var prev = (bin.charCodeAt(p) << 8) | bin.charCodeAt(p + 1); p += 2;
      dem[y * DW] = 1800 + 4 * prev;
      for (var x = 1; x < DW; x++) { var dl = bin.charCodeAt(p++); if (dl > 127) dl -= 256; prev += dl; dem[y * DW + x] = 1800 + 4 * prev; }
    }
    function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
    function sm(x, a, b) { var t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
    function cub(a, b, c, d, t) { return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))); }
    function D(ix, iy) { return dem[cl(iy, 0, DH - 1) * DW + cl(ix, 0, DW - 1)]; }
    function demAt(gx, gy) {
      var ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, r = [0, 0, 0, 0];
      for (var j = 0; j < 4; j++) r[j] = cub(D(ix - 1, iy - 1 + j), D(ix, iy - 1 + j), D(ix + 1, iy - 1 + j), D(ix + 2, iy - 1 + j), fx);
      return cub(r[0], r[1], r[2], r[3], fy);
    }
    function hash(ix, iy) {
      var h = (ix * 374761393 + iy * 668265263) | 0;
      h = (h ^ (h >>> 13)) * 1274126177 | 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function noise(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      var a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    function ridged(x, y, oct) {
      var s = 0, a = 0.5, f = 1, n = 0;
      for (var i = 0; i < oct; i++) { var v = 1 - Math.abs(2 * noise(x * f + i * 7.1, y * f - i * 3.3) - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.07; }
      return s / n;
    }
    // base shape at half resolution first, so the slope is cheap to look up
    var BW = TW / 2, BH = TH / 2, base = new Float32Array(BW * BH);
    for (var by = 0; by < BH; by++) for (var bx = 0; bx < BW; bx++) base[by * BW + bx] = demAt((bx + 0.5) / BW * (DW - 1), (by + 0.5) / BH * (DH - 1));
    function B(ix, iy) { return base[cl(iy, 0, BH - 1) * BW + cl(ix, 0, BW - 1)]; }
    var cellX = KX * 1000 / BW, cellZ = KZ * 1000 / BH;
    // real shape plus rock detail: gullies and ribs that run down the fall line, stronger where it is steep and high
    function heightAt(u, v) {
      var gx = u * (DW - 1), gy = v * (DH - 1), h = demAt(gx, gy);
      var bx = Math.round(u * BW - 0.5), by2 = Math.round(v * BH - 0.5);
      var sx = (B(bx + 2, by2) - B(bx - 2, by2)) / (4 * cellX), sz = (B(bx, by2 + 2) - B(bx, by2 - 2)) / (4 * cellZ);
      var sl = Math.sqrt(sx * sx + sz * sz), X = u * KX, Z = v * KZ;
      var high = sm(h, 2150, 2800), steep = sm(sl, 0.12, 0.5), amt = high * (0.3 + 0.7 * steep);
      var det = 0;
      if (amt > 0.002) {
        var dx = sx / (sl + 1e-4), dz = sz / (sl + 1e-4);
        var across = X * -dz + Z * dx, down = X * dx + Z * dz;
        det = (ridged(across * 1.9, down * 1.0, 5) - 0.4) * 150 + (ridged(X * 7 + 3, Z * 7, 3) - 0.4) * 40;
        det *= amt;
      }
      return h + det + (noise(X * 1.3, Z * 1.3) - 0.5) * 14 * (1 - high) + (noise(X * 9, Z * 9) - 0.5) * 3;
    }
    var Hm = new Float32Array(TW * TH), lo = 1700, span = 2700;
    for (var ty = 0; ty < TH; ty++) for (var tx = 0; tx < TW; tx++) Hm[ty * TW + tx] = heightAt((tx + 0.5) / TW, (ty + 0.5) / TH);
    // soft shadows cast by the peaks, for a low sun and a high sun, at half resolution
    function Hs(x, z) { return Hm[cl(z | 0, 0, TH - 1) * TW + cl(x | 0, 0, TW - 1)]; }
    var px = KX * 1000 / TW, pz = KZ * 1000 / TH, shadows = [];
    for (var si = 0; si < SUNS.length; si++) {
      var S = SUNS[si], hl = Math.sqrt(S[0] * S[0] + S[2] * S[2]), dirx = S[0] / hl, dirz = S[2] / hl, rise = S[1] / hl;
      var sh = new Float32Array(BW * BH);
      for (var y2 = 0; y2 < BH; y2++) for (var x2 = 0; x2 < BW; x2++) {
        var wx = (x2 * 2 + 1) * px, wz = (y2 * 2 + 1) * pz, h0 = Hm[(y2 * 2 + 1) * TW + x2 * 2 + 1] * EX + 30, lit = 1;
        for (var t = 160; t < 9000; t *= 1.13) {
          var qx = wx + dirx * t, qz = wz + dirz * t;
          if (qx < 0 || qz < 0 || qx > KX * 1000 || qz > KZ * 1000) break;
          var clear = (h0 + rise * t - Hs(qx / px, qz / pz) * EX) / t;
          if (clear < 0) { lit = 0; break; }
          var pen = clear * 7; if (pen < lit) lit = pen;
        }
        sh[y2 * BW + x2] = lit;
      }
      // soften
      var tmp = new Float32Array(BW * BH);
      for (var pass = 0; pass < 2; pass++) {
        for (var yy = 0; yy < BH; yy++) for (var xx = 0; xx < BW; xx++) { var i5 = yy * BW + xx; tmp[i5] = (sh[i5] * 2 + sh[yy * BW + cl(xx - 1, 0, BW - 1)] + sh[yy * BW + cl(xx + 1, 0, BW - 1)]) / 4; }
        for (var yy2 = 0; yy2 < BH; yy2++) for (var xx2 = 0; xx2 < BW; xx2++) { var i6 = yy2 * BW + xx2; sh[i6] = (tmp[i6] * 2 + tmp[cl(yy2 - 1, 0, BH - 1) * BW + xx2] + tmp[cl(yy2 + 1, 0, BH - 1) * BW + xx2]) / 4; }
      }
      shadows.push(sh);
    }
    var tex = new Uint8Array(TW * TH * 4);
    for (var y3 = 0; y3 < TH; y3++) for (var x3 = 0; x3 < TW; x3++) {
      var i = y3 * TW + x3, q = Math.round(cl((Hm[i] - lo) / span, 0, 1) * 65535), o = i * 4;
      // shadows upsampled from half resolution
      var fx = cl(x3 / 2 - 0.25, 0, BW - 1.001), fy = cl(y3 / 2 - 0.25, 0, BH - 1.001), ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, j = iy * BW + ix;
      tex[o] = q >> 8; tex[o + 1] = q & 255;
      for (var c = 0; c < 2; c++) {
        var A = shadows[c];
        tex[o + 2 + c] = 255 * ((A[j] * (1 - ax) + A[j + 1] * ax) * (1 - ay) + (A[j + BW] * (1 - ax) + A[j + BW + 1] * ax) * ay);
      }
    }
    // mesh heights: the data, with the valley floor carried on to the east
    var mesh = new Float32Array(MW * MH);
    for (var my = 0; my < MH; my++) for (var mx = 0; mx < MW; mx++) {
      var fu = cl(mx / (MW - 1) * 1.75 - 0.05, 0, 1) * TW - 0.5, fv = my / (MH - 1) * TH - 0.5;
      var ux = cl(fu, 0, TW - 1.001), uy = cl(fv, 0, TH - 1.001), i0 = ux | 0, j0 = uy | 0, a2 = ux - i0, b2 = uy - j0, k = j0 * TW + i0;
      mesh[my * MW + mx] = (Hm[k] * (1 - a2) + Hm[k + 1] * a2) * (1 - b2) + (Hm[k + TW] * (1 - a2) + Hm[k + TW + 1] * a2) * b2;
    }
    return { tex: tex, mesh: mesh };
  }

  // sun from the east-southeast, low, and from the southeast, higher (x east, y up, z south)
  function sunDir(az, el) { az *= Math.PI / 180; el *= Math.PI / 180; return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]; }
  var SUN_A = sunDir(112, 9), SUN_B = sunDir(156, 31);
  var MW = 300, MH = 280;

  // ---------- shaders ----------
  var NOISE = [
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+7.1;a*=.5;}return s/.9375;}"
  ].join("\n");

  var SKY_VS = "attribute vec2 aP;varying vec2 vN;void main(){vN=aP;gl_Position=vec4(aP,.9999,1.);}";
  var SKY_FS = [
    "precision highp float;varying vec2 vN;",
    "uniform vec3 uF,uR,uU,uLow,uBand,uTop;uniform vec2 uTan;uniform float uStars;",
    NOISE,
    "void main(){",
    " vec3 d=normalize(uF+uR*vN.x*uTan.x+uU*vN.y*uTan.y);",
    " float e=d.y;",
    " vec3 c=mix(uLow,uBand,smoothstep(-.01,.085,e));",
    " c=mix(c,uTop,smoothstep(.06,.5,e));",
    " if(uStars>.01){vec2 s=vec2(atan(d.z,d.x),e)*260.;vec2 g=floor(s);float h=hash(g);",
    "  float st=step(.965,h)*smoothstep(.28,.0,length(fract(s)-.5-(vec2(hash(g+3.1),hash(g+9.7))-.5)*.4));",
    "  c+=st*uStars*smoothstep(.08,.35,e)*(.5+.5*hash(g+1.7));}",
    " c+=(hash(gl_FragCoord.xy)-.5)/255.;", // dither, so the gradient doesn't band
    " gl_FragColor=vec4(c,1.);}"
  ].join("\n");

  var LAND_VS = [
    "attribute vec3 aP;uniform mat4 uVP;varying vec3 vP;",
    "void main(){vP=aP;gl_Position=uVP*vec4(aP,1.);}"
  ].join("\n");
  var LAND_FS = [
    "precision highp float;varying vec3 vP;",
    "uniform sampler2D uH,uCloud;",
    "uniform vec3 uCam,uSun,uSunCol,uAmb,uFog,uMistCol,uShDir;",
    "uniform float uShMix,uLine,uMist,uFogD,uEX,uCloudY,uTime;",
    "uniform vec4 uCl[3];",
    "const vec2 K=vec2(" + KX.toFixed(3) + "," + KZ.toFixed(3) + ");",
    "const vec2 TX=vec2(" + (1 / TW) + "," + (1 / TH) + ");",
    NOISE,
    "float hAt(vec2 uv){vec4 t=texture2D(uH,uv);return (t.r*65280.+t.g*255.)/65535.*2.7;}", // km above 1700 m
    "void main(){",
    " vec2 uv=clamp(vP.xz/K,vec2(.001),vec2(.999));",
    " float dist=length(vP-uCam);",
    " vec4 t0=texture2D(uH,uv);",
    " float alt=1700.+(t0.r*65280.+t0.g*255.)/65535.*2700.;",
    // two normals from the height map: a broad one decides what grows where, a fine one takes the light
    " vec2 e=TX*(1.5+clamp(dist*.2,0.,4.));",
    " float hx=hAt(uv+vec2(e.x,0.))-hAt(uv-vec2(e.x,0.));",
    " float hz=hAt(uv+vec2(0.,e.y))-hAt(uv-vec2(0.,e.y));",
    " vec3 N=normalize(vec3(-hx*uEX/(2.*e.x*K.x),1.,-hz*uEX/(2.*e.y*K.y)));",
    " vec2 eb=TX*9.;",
    " float bx=hAt(uv+vec2(eb.x,0.))-hAt(uv-vec2(eb.x,0.));",
    " float bz=hAt(uv+vec2(0.,eb.y))-hAt(uv-vec2(0.,eb.y));",
    " vec3 Nb=normalize(vec3(-bx*uEX/(2.*eb.x*K.x),1.,-bz*uEX/(2.*eb.y*K.y)));",
    // fine rock grain up close
    " float near=1.-smoothstep(3.,14.,dist);",
    " vec2 w=vP.xz+vP.y*vec2(.53,.37);vec2 gp=w*34.;float g0=noise(gp),g1=noise(w*11.);",
    " vec3 Nd=normalize(N+vec3(g0-noise(gp+vec2(.35,0.)),0.,g0-noise(gp+vec2(0.,.35)))*.45*near",
    "  +vec3(g1-noise(w*11.+vec2(.25,0.)),0.,g1-noise(w*11.+vec2(0.,.25)))*.4);",
    " float slope=mix(1.-Nb.y,1.-N.y,.35);",
    " float n1=fbm(vP.xz*.9+3.),n2=fbm(w*5.),n3=noise(w*19.);",
    // what's on the ground
    " vec3 sage=mix(vec3(.42,.40,.27),vec3(.31,.35,.21),n1);",
    " sage=mix(sage,vec3(.52,.47,.32),smoothstep(.5,.75,n2)*.5);",
    " vec3 forest=mix(vec3(.06,.12,.085),vec3(.10,.17,.10),n2)*(.86+.26*n3*near+.14*(1.-near));",
    " vec3 rock=mix(vec3(.42,.40,.40),vec3(.60,.56,.53),n2*.7+n3*.15+.1);",
    " rock*=mix(1.06,.8,smoothstep(.2,.5,slope));",
    " float tree=smoothstep(2040.,2110.,alt+n1*80.)*(1.-smoothstep(2780.,2980.,alt+n1*240.+n2*120.))*(1.-smoothstep(.3,.46,slope));",
    " tree=max(tree,smoothstep(.56,.64,fbm(vP.xz*.55+11.)+n3*.05)*(1.-smoothstep(2090.,2150.,alt))*.92);", // stands of trees on the valley floor
    " float rk=smoothstep(.2,.36,slope)+smoothstep(2750.,3000.,alt+n1*200.);",
    " vec3 alb=mix(sage,rock,clamp(rk,0.,1.));",
    " alb=mix(alb,forest,tree);",
    " float north=-Nb.z;",
    // snow: high ground, holding on ledges and in gullies, bare on the steep faces
    " float sn=smoothstep(2950.,3300.,alt+n1*260.+north*520.-n2*160.)*(1.-smoothstep(.36,.56,slope-n2*.06));",
    " sn=max(sn,smoothstep(.48,.7,n2)*smoothstep(2750.,3150.,alt+north*450.)*(1.-smoothstep(.44,.6,slope))*.85);",
    " alb=mix(alb,vec3(.92,.94,1.),sn);",
    // light
    " float ndl=clamp((dot(normalize(mix(Nb,Nd,.6)),uSun)+.12)/1.12,0.,1.);",
    " float shd=mix(t0.b,t0.a,uShMix);",
    " float lit=smoothstep(uLine-90.,uLine+260.,alt);", // the lit line coming down the range at sunrise
    " float cs=0.;",
    " vec3 q=vP+uShDir*((uCloudY-vP.y)/uShDir.y);",
    " for(int i=0;i<3;i++){vec2 c=(q.xz-uCl[i].xy)/vec2(uCl[i].z*.62,uCl[i].z);",
    "  vec2 cu=vec2(c.y,c.x)*.5+.5;",
    "  float a=texture2D(uCloud,cu).r*step(abs(c.x),1.)*step(abs(c.y),1.);cs=max(cs,a*uCl[i].w);}",
    " float direct=ndl*shd*lit;",
    " vec3 col=alb*(uAmb*(.5+.5*N.y)*(1.-.42*cs)+uSunCol*1.25*direct*(1.-.94*cs));",
    " col+=uSunCol*sn*pow(ndl,3.)*shd*lit*(1.-cs)*.1;", // snow glints toward the sun
    " col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);", // gentle film curve so the snow keeps its shape
    // air
    " float f=1.-exp(-dist*uFogD);",
    " col=mix(col,uFog,f);",
    " float m=uMist*exp(-max(alt-2035.,0.)/(38.+60.*fbm(vP.xz*.7+uTime*.01)))*(1.-exp(-dist*.3));",
    " col=mix(col,uMistCol,clamp(m,0.,.92));",
    " col+=(hash(gl_FragCoord.xy)-.5)/255.;",
    " gl_FragColor=vec4(col,1.);}"
  ].join("\n");

  var CLOUD_VS = [
    "attribute vec2 aP;uniform mat4 uVP;uniform vec3 uC,uR,uU;uniform vec2 uS;varying vec2 vT;",
    "void main(){vT=aP*.5+.5;vT.y=1.-vT.y;gl_Position=uVP*vec4(uC+uR*aP.x*uS.x+uU*aP.y*uS.y,1.);}"
  ].join("\n");
  var CLOUD_FS = [
    "precision highp float;varying vec2 vT;uniform sampler2D uT;uniform vec3 uLit,uDark,uFog;uniform float uA,uHaze;",
    "void main(){vec4 t=texture2D(uT,vT);vec3 c=mix(uDark,uLit,t.r);c=mix(c,uFog,uHaze);gl_FragColor=vec4(c,t.a*uA);}"
  ].join("\n");

  function program(vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "aP"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name.replace("[0]", ""); u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }

  var sky, land, cloud, quad, landBuf, landIdx, idxCount = 0, hTex, cTex, sTex, ready = false, loadT = 0, cloudAspect = 0.5;
  try {
    sky = program(SKY_VS, SKY_FS); land = program(LAND_VS, LAND_FS); cloud = program(CLOUD_VS, CLOUD_FS);
  } catch (e) {
    if (window.console) console.warn("Cloudshadow scene: " + e.message);
    canvas.style.display = "none";
    var plain2 = function () { words(progress(), reduce.matches); };
    plain2(); window.addEventListener("scroll", plain2, { passive: true });
    return;
  }
  quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  // ---------- the cloud: round puffs laid out like the logo cloud, lit as one soft shape ----------
  var PUFFS = [
    [15.6, 5.4, 5.3], [9.2, 7.9, 4.4], [22.4, 7.8, 4.7], [4.2, 10.9, 3.5], [27.6, 10.8, 3.7],
    [7.6, 11.9, 3.5], [12.8, 12.4, 3.8], [18.6, 12.5, 3.8], [23.8, 11.9, 3.6], [15.6, 9.6, 4.6]
  ];
  function boxBlur(A, w, h, r, passes) {
    var B = new Float32Array(w * h);
    for (var p = 0; p < passes; p++) {
      for (var y = 0; y < h; y++) { var acc = 0, row = y * w; for (var x = -r; x < w + r; x++) { if (x + r < w) acc += A[row + Math.min(w - 1, x + r)]; if (x - r - 1 >= 0) acc -= A[row + x - r - 1]; if (x >= 0) B[row + x] = acc / (2 * r + 1); } }
      for (var x2 = 0; x2 < w; x2++) { var acc2 = 0; for (var y2 = -r; y2 < h + r; y2++) { if (y2 + r < h) acc2 += B[Math.min(h - 1, y2 + r) * w + x2]; if (y2 - r - 1 >= 0) acc2 -= B[(y2 - r - 1) * w + x2]; if (y2 >= 0) A[y2 * w + x2] = acc2 / (2 * r + 1); } }
    }
    return A;
  }
  function tex2d(w, h, fmt, data, mip) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }
  function buildCloud() {
    // The logo cloud's layout with a smaller billow on each puff, then softened: the outline is
    // pushed around by gentle turbulence and fades out at the edge, like a real fair-weather cloud.
    var seed = 4321;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function h2(ix, iy) { var h = (ix * 374761393 + iy * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
    function vn(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      var a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    var all = PUFFS.map(function (q) { return [q[0], q[1], q[2]]; });
    for (var i = 0; i < PUFFS.length; i++) {
      var q = PUFFS[i], ang = -Math.PI * (0.1 + 0.8 * rnd()), r = q[2] * (0.42 + 0.2 * rnd()), d = q[2] * (0.55 + 0.25 * rnd());
      all.push([q[0] + Math.cos(ang) * d, q[1] + Math.sin(ang) * d * 0.9, r]);
    }
    var w = 512, h = 320, sc = 14, offX = -2.3, offY = -3.0;
    var alphaA = new Float32Array(w * h), Z = new Float32Array(w * h), kk = 1.5;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var ux = x / sc + offX, uy = y / sc + offY;
      var wx = ux + (vn(ux * 0.62, uy * 0.62) - 0.5) * 1.5 + (vn(ux * 1.7 + 9, uy * 1.7) - 0.5) * 0.5;
      var wy = uy + (vn(ux * 0.62 + 31, uy * 0.62 + 5) - 0.5) * 1.5 + (vn(ux * 1.7, uy * 1.7 + 17) - 0.5) * 0.5;
      var cover = 0, sum = 0;
      for (var k = 0; k < all.length; k++) {
        var p = all[k], dx = (wx - p[0]) / p[2], dy = (wy - p[1]) / p[2], d2 = dx * dx + dy * dy;
        if (d2 >= 1.3) continue;
        var c = smooth(1 - Math.sqrt(d2), -0.12, 0.22);
        if (c > cover) cover = c;
        if (d2 < 1) sum += Math.exp(kk * p[2] * Math.sqrt(1 - d2));
      }
      alphaA[y * w + x] = cover; Z[y * w + x] = sum > 0 ? Math.log(sum) / kk : 0;
    }
    boxBlur(Z, w, h, 4, 2);
    var data = new Uint8Array(w * h * 4), LX = 0.45, LY = -0.75, LZ = 0.5, st = 2 / sc;
    for (var y2 = 1; y2 < h - 1; y2++) for (var x2 = 1; x2 < w - 1; x2++) {
      var j = y2 * w + x2, a = alphaA[j]; if (a <= 0) continue;
      var gx = (Z[j + 1] - Z[j - 1]) / st, gy = (Z[j + w] - Z[j - w]) / st, nl = Math.sqrt(gx * gx + gy * gy + 1);
      var uy2 = y2 / sc + offY;
      var light = clamp(0.58 + (-gx * LX - gy * LY + LZ) / nl * 0.46 - (y2 / h) * 0.2 - smooth(uy2, 10.5, 15.5) * 0.15, 0, 1), o = j * 4;
      data[o] = data[o + 1] = data[o + 2] = light * 255; data[o + 3] = a * 255;
    }
    cTex = tex2d(w, h, gl.RGBA, data, false);
    cloudAspect = h / w;
    // the shadow's footprint: the cloud's own outline, softened
    var fw = 128, fh = 64, F = new Float32Array(fw * fh), bx = w / fw, by = h / fh;
    for (var i3 = 0; i3 < w * h; i3++) F[Math.min(fh - 1, ((i3 / w | 0) / by) | 0) * fw + Math.min(fw - 1, ((i3 % w) / bx) | 0)] += alphaA[i3] / (bx * by);
    boxBlur(F, fw, fh, 2, 2);
    var sd = new Uint8Array(fw * fh);
    for (var i4 = 0; i4 < fw * fh; i4++) sd[i4] = smooth(F[i4], 0.06, 0.8) * 255;
    sTex = tex2d(fw, fh, gl.LUMINANCE, sd, true);
  }

  var meshH = null;
  function groundY(x, z) { // height of the land in scene units
    if (!meshH) return 0;
    var mx = clamp(Math.round((x / KX + 0.05) / 1.75 * (MW - 1)), 0, MW - 1), my = clamp(Math.round(z / KZ * (MH - 1)), 0, MH - 1);
    return (meshH[my * MW + mx] - 2000) / 1000 * EX;
  }
  function useBake(res) {
    meshH = res.mesh;
    hTex = tex2d(TW, TH, gl.RGBA, res.tex, true);
    // the mesh covers the data and carries the valley on east toward the camera
    var v = new Float32Array(MW * MH * 3), k = 0;
    for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
      v[k++] = (x / (MW - 1) * 1.75 - 0.05) * KX;
      v[k++] = (res.mesh[y * MW + x] - 2000) / 1000 * EX;
      v[k++] = y / (MH - 1) * KZ;
    }
    var idx = new Uint32Array((MW - 1) * (MH - 1) * 6), n = 0;
    for (var y2 = 0; y2 < MH - 1; y2++) for (var x2 = 0; x2 < MW - 1; x2++) {
      var a = y2 * MW + x2, b = a + 1, c = a + MW, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
    landBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, landBuf); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    landIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, landIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    idxCount = idx.length;
    ready = true;
    draw(performance.now());
    canvas.classList.add("on");
    loop();
  }
  function startBake() {
    var args = [DEM, TW, TH, KX, KZ, EX, MW, MH, [SUN_A, SUN_B]];
    try {
      var src = "var bake=" + bake.toString() + ";onmessage=function(e){var r=bake.apply(null,e.data);postMessage(r,[r.tex.buffer,r.mesh.buffer]);};";
      var wk = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      wk.onmessage = function (e) { useBake(e.data); wk.terminate(); };
      wk.onerror = function () { wk.terminate(); useBake(bake.apply(null, args)); };
      wk.postMessage(args);
    } catch (e) { useBake(bake.apply(null, args)); }
  }

  // ---------- camera maths ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function viewProj(eye, F, R, U, tanH, aspect, near, far) {
    var f = 1 / tanH, nf = 1 / (near - far);
    // projection * view, written out
    var V = [R[0], U[0], -F[0], 0, R[1], U[1], -F[1], 0, R[2], U[2], -F[2], 0, -dot(R, eye), -dot(U, eye), dot(F, eye), 1];
    var P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    var M = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) M[c * 4 + r] = P[r] * V[c * 4] + P[4 + r] * V[c * 4 + 1] + P[8 + r] * V[c * 4 + 2] + P[12 + r] * V[c * 4 + 3];
    return M;
  }

  // ---------- light through the morning: night, first light, sunrise, morning, day ----------
  var SKY_LOW = [[0.13, 0.15, 0.27], [0.33, 0.35, 0.52], [0.62, 0.60, 0.72], [0.74, 0.82, 0.90], [0.76, 0.86, 0.94]];
  var SKY_BAND = [[0.20, 0.19, 0.34], [0.72, 0.47, 0.56], [0.93, 0.70, 0.66], [0.72, 0.82, 0.92], [0.62, 0.78, 0.93]];
  var SKY_TOP = [[0.04, 0.06, 0.15], [0.14, 0.18, 0.38], [0.30, 0.42, 0.68], [0.24, 0.46, 0.78], [0.20, 0.44, 0.80]];
  var SUN_COL = [[1.25, 0.42, 0.36], [1.45, 0.62, 0.42], [1.5, 0.95, 0.66], [1.42, 1.22, 1.0], [1.34, 1.28, 1.18]];
  var AMB = [[0.14, 0.16, 0.30], [0.26, 0.27, 0.44], [0.40, 0.40, 0.52], [0.38, 0.44, 0.58], [0.36, 0.44, 0.60]];
  var MIST = [[0.30, 0.32, 0.50], [0.56, 0.52, 0.66], [0.92, 0.80, 0.78], [0.94, 0.95, 0.97], [0.95, 0.97, 1.0]];
  var C_LIT = [[0.50, 0.50, 0.70], [0.98, 0.72, 0.70], [1.0, 0.93, 0.86], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0]];
  var C_DARK = [[0.20, 0.22, 0.38], [0.42, 0.36, 0.52], [0.68, 0.56, 0.64], [0.64, 0.70, 0.80], [0.64, 0.71, 0.80]];

  var cw = 0, chh = 0, dpr = 1;
  function size() {
    var rect = stage.getBoundingClientRect();
    cw = Math.max(1, Math.round(rect.width)); chh = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, cw * chh > 1400000 ? 1.25 : 1.75);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  var GRAND = [4.24, 13.06];
  function draw(now) {
    var still = reduce.matches, p = progress();
    words(p, still);
    if (!ready) return;
    var time = still ? 0 : now / 1000;
    var e = p * p * (3 - 2 * p);
    var l = still ? 1 : lerp(0.15, 1, smooth(p, 0, 0.78));                // light: 0 night to 1 day
    var k = still ? 1 : smooth(p, 0.05, 0.95);             // the cloud's journey
    var aspect = cw / chh, tall = clamp((1.15 - aspect) / 0.6, 0, 1);

    // camera: in from the valley toward the Grand, climbing a little
    var eye = [lerp(18.5, 13.0, e) + tall * 2.5, lerp(0.36, 0.95, e), lerp(11.9, 13.3, e)];
    var tgt = [GRAND[0], lerp(2.35, 1.95, e) + tall * 0.25, lerp(12.5, 12.9, e)];
    if (!still) { eye[1] += Math.sin(time * 0.21) * 0.012; eye[2] += Math.sin(time * 0.13) * 0.03; }
    var F = norm(sub(tgt, eye)), R = norm(cross(F, [0, 1, 0])), U = cross(R, F);
    var tanH = Math.tan((lerp(lerp(31, 36, e), 54, tall) * Math.PI / 180) / 2);
    var VP = viewProj(eye, F, R, U, tanH, aspect, 0.05, 80);

    var skyLow = keys(SKY_LOW, l), sunCol = keys(SUN_COL, l), amb = keys(AMB, l);
    var sm2 = smooth(l, 0.2, 0.95), sun = norm([lerp(SUN_A[0], SUN_B[0], sm2), lerp(SUN_A[1], SUN_B[1], sm2), lerp(SUN_A[2], SUN_B[2], sm2)]);
    var line = lerp(4080, 1500, smooth(l, 0.0, 0.5));     // altitude the sunlight has reached

    gl.disable(gl.BLEND);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(sky.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(sky.u.uF, F); gl.uniform3fv(sky.u.uR, R); gl.uniform3fv(sky.u.uU, U);
    gl.uniform2f(sky.u.uTan, tanH * aspect, tanH);
    gl.uniform3fv(sky.u.uLow, skyLow); gl.uniform3fv(sky.u.uBand, keys(SKY_BAND, l)); gl.uniform3fv(sky.u.uTop, keys(SKY_TOP, l));
    gl.uniform1f(sky.u.uStars, clamp(1 - l * 3.2, 0, 1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // clouds: the one we follow, and two smaller ones further off
    var cloudY = 3.3;
    var drift = still ? 0 : Math.sin(time * 0.08) * 0.12;
    var shDir = norm([0.16, 0.86, 0.3]);
    function over(x, z, y) { var t = (cloudY - y) / shDir[1]; return [x + shDir[0] * t, z + shDir[2] * t]; }
    // where the main shadow lies: out on the valley floor at first, on the Grand's east face at the end
    var sx = lerp(13.5, 6.35, k), sz = lerp(7.0, 12.55, k) + drift, a0 = over(sx, sz, groundY(sx, sz));
    var a1 = over(lerp(9, 6.2, k), lerp(2.5, 5.2, k) - drift * 2, 0.8), a2 = over(lerp(14, 8.4, k), lerp(17.5, 20.8, k) + drift * 3, 0.5);
    var CL = [[a0[0], a0[1], lerp(0.6, 0.8, k), 1], [a1[0], a1[1], 0.6, 0.8], [a2[0], a2[1], 0.52, 0.75]];

    // land
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(land.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, landBuf); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, landIdx);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hTex); gl.uniform1i(land.u.uH, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sTex); gl.uniform1i(land.u.uCloud, 1);
    gl.uniformMatrix4fv(land.u.uVP, false, VP);
    gl.uniform3fv(land.u.uCam, eye); gl.uniform3fv(land.u.uSun, sun); gl.uniform3fv(land.u.uSunCol, sunCol);
    gl.uniform3fv(land.u.uAmb, amb); gl.uniform3fv(land.u.uFog, skyLow); gl.uniform3fv(land.u.uMistCol, keys(MIST, l));
    gl.uniform3fv(land.u.uShDir, shDir);
    gl.uniform1f(land.u.uShMix, sm2); gl.uniform1f(land.u.uLine, line);
    gl.uniform1f(land.u.uMist, lerp(0.95, 0.0, smooth(l, 0.35, 0.95)));
    gl.uniform1f(land.u.uFogD, lerp(0.05, 0.026, l)); gl.uniform1f(land.u.uEX, EX);
    gl.uniform1f(land.u.uCloudY, cloudY); gl.uniform1f(land.u.uTime, time);
    var flat = [];
    for (var i = 0; i < 3; i++) flat.push(CL[i][0], CL[i][1], CL[i][2], CL[i][3] * smooth(l, 0.12, 0.5));
    gl.uniform4fv(land.u.uCl, flat);
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_INT, 0);

    // the clouds themselves, far to near
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(cloud.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cTex); gl.uniform1i(cloud.u.uT, 0);
    gl.uniformMatrix4fv(cloud.u.uVP, false, VP);
    gl.uniform3fv(cloud.u.uLit, keys(C_LIT, l)); gl.uniform3fv(cloud.u.uDark, keys(C_DARK, l)); gl.uniform3fv(cloud.u.uFog, skyLow);
    var order = [0, 1, 2].sort(function (a, b) {
      return dot(sub([CL[b][0], cloudY, CL[b][1]], eye), F) - dot(sub([CL[a][0], cloudY, CL[a][1]], eye), F);
    });
    for (var j = 0; j < 3; j++) {
      var c = CL[order[j]], pos = [c[0], cloudY, c[1]], d = Math.sqrt(dot(sub(pos, eye), sub(pos, eye)));
      var Rb = norm(cross(sub(pos, eye), [0, 1, 0]));
      gl.uniform3fv(cloud.u.uC, pos); gl.uniform3fv(cloud.u.uR, Rb); gl.uniform3f(cloud.u.uU, 0, 1, 0);
      gl.uniform2f(cloud.u.uS, c[2], c[2] * cloudAspect);
      gl.uniform1f(cloud.u.uA, 0.97); gl.uniform1f(cloud.u.uHaze, (1 - Math.exp(-d * lerp(0.05, 0.026, l))) * 0.8);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.depthMask(true);
  }

  // ---------- run only while the scene is on screen ----------
  var raf = 0, visible = true, lastScroll = 0, skip = false;
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(function tick(now) {
      raf = 0;
      // full rate while scrolling, half rate when idle
      if (now - lastScroll < 300 || (skip = !skip)) draw(now);
      if (visible && !document.hidden && !reduce.matches) raf = requestAnimationFrame(tick);
    });
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) loop(); }).observe(flight);
  }
  document.addEventListener("visibilitychange", loop);
  window.addEventListener("scroll", function () { lastScroll = performance.now(); if (!ready) words(progress(), reduce.matches); else loop(); }, { passive: true });
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { size(); loop(); }, 120); });
  if (reduce.addEventListener) reduce.addEventListener("change", loop);
  canvas.addEventListener("webglcontextlost", function (ev) { ev.preventDefault(); canvas.classList.remove("on"); ready = false; });

  size();
  words(progress(), reduce.matches);
  buildCloud();
  startBake();
})();

/* Sections ease in as they come into view. */
(function () {
  if (!("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("js");
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  var els = document.querySelectorAll("main .shelf-head, main .feature-copy, main .feature-art, main .card, main .studio-copy, main .studio-mark");
  for (var i = 0; i < els.length; i++) { els[i].classList.add("rise"); io.observe(els[i]); }
})();
