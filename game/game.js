// NEON DODGE — a one-button arcade dodger.
// Hold (Space / mouse / touch) to thrust up, release to fall.
// Dodge asteroids, collect stars, survive as long as you can.
// Written from scratch for the make.fun bounty "The agent builds a game from one prompt".
// ?autoplay=1 lets an autopilot fly the ship (used for the video demo).

(function () {
  "use strict";
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var overlay = document.getElementById("overlay");

  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  var AUTOPLAY = /[?&]autoplay=1/.test(location.search);
  var params = new URLSearchParams(location.search);
  var T0 = parseFloat(params.get("t0") || "0"); // optional fixed start time (video determinism)

  var state = "menu"; // menu | playing | over
  var ship, obstacles, stars, particles, trail;
  var score = 0, best = 0, speed = 0, spawnTimer = 0, starTimer = 0, elapsed = 0, shake = 0;
  var holding = false;
  var keys = {};

  try { best = parseInt(localStorage.getItem("neon-dodge-best") || "0", 10) || 0; } catch (e) { best = 0; }
  bestEl.textContent = best > 0 ? "BEST " + best : "";

  function reset() {
    ship = { x: Math.max(90, W * 0.16), y: H * 0.45, vy: 0, r: 16, tilt: 0 };
    obstacles = []; stars = []; particles = []; trail = [];
    score = 0; speed = 300; spawnTimer = 0.4; starTimer = 1.2; elapsed = 0; shake = 0;
    scoreEl.textContent = "0";
    overlay.classList.add("hidden");
  }

  function start() {
    reset();
    state = "playing";
  }

  function gameOver() {
    state = "over";
    shake = 14;
    burst(ship.x, ship.y, "#7df9ff", 42);
    burst(ship.x, ship.y, "#ff5da2", 30);
    if (score > best) {
      best = score;
      try { localStorage.setItem("neon-dodge-best", String(best)); } catch (e) {}
      bestEl.textContent = "BEST " + best;
    }
    overlay.querySelector("h1").innerHTML = "GAME <span>OVER</span>";
    overlay.querySelector("p").innerHTML =
      "You scored <b style='color:#7df9ff'>" + score + "</b> — " +
      (score >= best && score > 0 ? "a new best! " : "") +
      "The asteroids win this round.<br>One more go?";
    overlay.querySelector(".key").textContent = "CLICK OR PRESS SPACE TO FLY AGAIN";
    overlay.classList.remove("hidden");
    if (AUTOPLAY) setTimeout(function () { if (state === "over") start(); }, 1200);
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 320;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.6, max: 1, color: color, r: 2 + Math.random() * 3 });
    }
  }

  function spawnObstacle() {
    var r = 18 + Math.random() * 30;
    var y = r + Math.random() * (H - 2 * r);
    // keep a survivable gap: never spawn directly on the ship's lane twice in a row
    obstacles.push({ x: W + r + 20, y: y, r: r, rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 2.4, wob: Math.random() * Math.PI * 2 });
  }

  function spawnStar() {
    var y = 40 + Math.random() * (H - 80);
    stars.push({ x: W + 20, y: y, r: 11, phase: Math.random() * Math.PI * 2, taken: false });
  }

  // --- input: one button, three ways ---
  function press() { holding = true; if (state !== "playing") start(); }
  function release() { holding = false; }
  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); press(); }
    if (e.code === "KeyR" && state === "over") start();
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") release();
  });
  window.addEventListener("mousedown", press);
  window.addEventListener("mouseup", release);
  window.addEventListener("touchstart", function (e) { e.preventDefault(); press(); }, { passive: false });
  window.addEventListener("touchend", release);
  overlay.addEventListener("click", function () { if (state !== "playing") start(); });

  // --- autopilot (demo mode): plan the safest lane, don't chase stars into rocks ---
  function autopilot(dt) {
    var LOOK = 750; // px ahead to start steering
    var shipX = ship.x;
    // find the nearest obstacle that will reach the ship soon
    var threat = null;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.x + o.r > shipX - 40 && o.x - o.r < shipX + LOOK) {
        if (!threat || o.x < threat.x) threat = o;
      }
    }
    var target = H * 0.5;
    if (threat) {
      // score candidate lanes: stay clear of every obstacle in the window
      var bestScore = -1e9, bestY = target;
      for (var y = 60; y <= H - 60; y += 30) {
        var s = -Math.abs(y - ship.y) * 0.4; // prefer small moves
        for (var j = 0; j < obstacles.length; j++) {
          var ob = obstacles[j];
          if (ob.x + ob.r < shipX - 40 || ob.x - ob.r > shipX + LOOK) continue;
          var dy = Math.abs(y - ob.y) - (ob.r + ship.r + 14);
          s += dy < 0 ? dy * 8 : Math.min(120, dy); // punish overlap hard
        }
        if (s > bestScore) { bestScore = s; bestY = y; }
      }
      target = bestY;
    } else {
      // only chase a star when the sky ahead is clear
      var clear = true;
      for (var k = 0; k < obstacles.length; k++) {
        if (obstacles[k].x - obstacles[k].r < shipX + 900) { clear = false; break; }
      }
      if (clear) {
        for (var m = 0; m < stars.length; m++) {
          if (stars[m].x > shipX) { target = stars[m].y; break; }
        }
      }
    }
    // bang-bang with a dead zone; hold to climb when above target
    holding = ship.y > target + 8;
  }

  function update(dt) {
    elapsed += dt;
    speed = 300 + Math.min(420, elapsed * 9); // it gets faster the longer you live
    if (AUTOPLAY) autopilot(dt);

    // ship physics: thrust up while held, gravity otherwise
    ship.vy += (holding ? -2600 : 1500) * dt;
    ship.vy = Math.max(-620, Math.min(640, ship.vy));
    ship.y += ship.vy * dt;
    ship.tilt = Math.max(-0.5, Math.min(0.55, ship.vy / 900));
    if (ship.y < 22) { ship.y = 22; ship.vy = Math.max(ship.vy, 0); }
    if (ship.y > H - 22) { ship.y = H - 22; ship.vy = Math.min(ship.vy, 0); }

    trail.push({ x: ship.x - 14, y: ship.y });
    if (trail.length > 26) trail.shift();

    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnObstacle(); spawnTimer = 0.55 + Math.random() * 0.55 - Math.min(0.25, elapsed * 0.002); }
    starTimer -= dt;
    if (starTimer <= 0) { spawnStar(); starTimer = 1.4 + Math.random() * 1.6; }

    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.x -= speed * dt;
      o.rot += o.vr * dt;
      o.y += Math.sin(elapsed * 2 + o.wob) * 22 * dt;
      if (o.x < -o.r - 40) { obstacles.splice(i, 1); score += 1; scoreEl.textContent = String(score); continue; }
      var dx = o.x - ship.x, dy = o.y - ship.y;
      if (dx * dx + dy * dy < (o.r + ship.r - 4) * (o.r + ship.r - 4)) { gameOver(); return; }
    }
    for (var j = stars.length - 1; j >= 0; j--) {
      var s = stars[j];
      s.x -= speed * dt;
      s.phase += dt * 5;
      if (s.x < -30) { stars.splice(j, 1); continue; }
      var ddx = s.x - ship.x, ddy = s.y - ship.y;
      if (ddx * ddx + ddy * ddy < (s.r + ship.r + 6) * (s.r + ship.r + 6)) {
        stars.splice(j, 1);
        score += 5; scoreEl.textContent = String(score);
        burst(s.x, s.y, "#ffd166", 16);
      }
    }
    for (var k = particles.length - 1; k >= 0; k--) {
      var p = particles[k];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98;
      if (p.life <= 0) particles.splice(k, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
  }

  // --- drawing ---
  var bgStars = [];
  for (var s = 0; s < 110; s++) {
    bgStars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
  }

  function drawBackground(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a0a2e"); g.addColorStop(0.55, "#12082e"); g.addColorStop(1, "#050510");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < bgStars.length; i++) {
      var b = bgStars[i];
      ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.4 + b.tw));
      ctx.fillStyle = "#cfe6ff";
      ctx.beginPath(); ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // neon grid horizon
    ctx.strokeStyle = "rgba(125,249,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W; x += 90) { ctx.moveTo(x, H * 0.82); ctx.lineTo(x, H); }
    ctx.moveTo(0, H * 0.82); ctx.lineTo(W, H * 0.82);
    ctx.stroke();
  }

  function drawShip() {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.tilt);
    // engine flame
    var fl = holding ? 26 + Math.random() * 14 : 12 + Math.random() * 6;
    var fg = ctx.createLinearGradient(-14, 0, -14 - fl, 0);
    fg.addColorStop(0, "rgba(255,209,102,0.95)"); fg.addColorStop(1, "rgba(255,93,162,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-14 - fl, 0); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill();
    // hull
    ctx.shadowColor = "#7df9ff"; ctx.shadowBlur = 22;
    ctx.fillStyle = "#7df9ff";
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#050510";
    ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // trail
    for (var i = 0; i < trail.length; i++) {
      var p = trail[i];
      ctx.globalAlpha = (i / trail.length) * 0.35;
      ctx.fillStyle = "#7df9ff";
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (i / trail.length) * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRock(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.shadowColor = "#ff5da2"; ctx.shadowBlur = 16;
    ctx.fillStyle = "#2a1530";
    ctx.strokeStyle = "#ff5da2"; ctx.lineWidth = 2;
    ctx.beginPath();
    var n = 9;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = o.r * (0.82 + 0.18 * Math.sin(a * 3 + o.wob));
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,93,162,0.5)";
    ctx.beginPath(); ctx.arc(-o.r * 0.25, -o.r * 0.2, o.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.r * 0.3, o.r * 0.3, o.r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStar(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.sin(s.phase) * 0.3);
    var pulse = 0.85 + 0.15 * Math.sin(s.phase * 2);
    ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      var rr = (i % 2 === 0 ? s.r : s.r * 0.45) * pulse;
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw(t) {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBackground(t);
    for (var i = 0; i < trail.length; i++) {}
    for (var j = 0; j < stars.length; j++) drawStar(stars[j]);
    for (var k = 0; k < obstacles.length; k++) drawRock(obstacles[k]);
    for (var m = 0; m < particles.length; m++) {
      var p = particles[m];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (state !== "over") drawShip();
    ctx.restore();
  }

  // --- main loop ---
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    var t = (now / 1000) + T0;
    if (state === "playing") update(dt);
    else if (state === "menu") {
      // gentle idle drift behind the menu
      if (!ship) reset();
      ship.y = H * 0.45 + Math.sin(t * 1.2) * 14;
      ship.tilt = Math.cos(t * 1.2) * 0.08;
      elapsed += dt;
    }
    draw(t);
    requestAnimationFrame(frame);
  }

  reset();
  state = "menu";
  overlay.classList.remove("hidden"); // reset() hides it; the menu must show on load
  if (AUTOPLAY) { start(); }
  requestAnimationFrame(frame);
})();
