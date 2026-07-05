(function () {
  const canvas = document.getElementById("sakura-canvas");
  const trunk = document.getElementById("sway-trunk");
  const canopy = document.getElementById("sway-canopy");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let petals = [];
  let time = 0;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    if (petals.length < 60) seedPetals(110);
  }

  function petalPath(len) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.2, -len * 0.3, len * 0.75, -len * 0.34, len, -len * 0.05);
    ctx.quadraticCurveTo(len * 0.86, len * 0.08, len * 0.72, len * 0.06);
    ctx.bezierCurveTo(len * 0.4, len * 0.24, len * 0.15, len * 0.18, 0, 0);
    ctx.bezierCurveTo(-len * 0.15, len * 0.18, -len * 0.4, len * 0.24, -len * 0.72, len * 0.06);
    ctx.quadraticCurveTo(-len * 0.86, len * 0.08, -len, -len * 0.05);
    ctx.bezierCurveTo(-len * 0.75, -len * 0.34, -len * 0.2, -len * 0.3, 0, 0);
    ctx.closePath();
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.globalAlpha = p.alpha;
    const g = 140 + p.tint * 60 | 0;
    const b = 165 + p.tint * 45 | 0;
    ctx.fillStyle = `rgba(255, ${g}, ${b}, 0.88)`;
    petalPath(p.size);
    ctx.fill();
    ctx.restore();
  }

  function seedPetals(count) {
    for (let i = 0; i < count; i++) petals.push(createPetal(true));
  }

  function createPetal(scattered) {
    return {
      x: scattered ? rand(0, width) : rand(width * 0.08, width * 0.92),
      y: scattered ? rand(-height * 0.1, height) : rand(-80, -8),
      size: rand(5, 11),
      speedY: rand(0.35, 1.1),
      speedX: rand(-0.4, 0.4),
      spin: rand(0, Math.PI * 2),
      spinSpeed: rand(-0.02, 0.02),
      sway: rand(0, Math.PI * 2),
      swaySpeed: rand(0.01, 0.028),
      alpha: rand(0.35, 0.75),
      tint: rand(0, 1),
    };
  }

  function swayTree(t) {
    if (!trunk || !canopy) return;

    const gust = Math.sin(t * 0.0007) * 0.4 + Math.sin(t * 0.0013 + 2.1) * 0.25;
    const trunkRot = Math.sin(t * 0.001) * 0.55 + gust * 0.35;
    const trunkX = Math.sin(t * 0.0009 + 0.5) * 3;
    const canopyRot = Math.sin(t * 0.0012 + 1.4) * 1.6 + Math.sin(t * 0.00065) * 0.7 + gust * 0.9;
    const canopyX = Math.sin(t * 0.0011) * 8 + gust * 5;
    const canopyY = Math.sin(t * 0.0008 + 0.8) * 2;

    trunk.style.transform = `rotate(${trunkRot.toFixed(3)}deg) translateX(${trunkX.toFixed(2)}px)`;
    canopy.style.transform = `rotate(${canopyRot.toFixed(3)}deg) translate(${canopyX.toFixed(2)}px, ${canopyY.toFixed(2)}px)`;
  }

  function tick(now) {
    time = now;
    ctx.clearRect(0, 0, width, height);
    swayTree(now);

    for (const p of petals) {
      p.y += p.speedY;
      p.sway += p.swaySpeed;
      p.x += p.speedX + Math.sin(p.sway) * 0.5;
      p.spin += p.spinSpeed;

      if (p.y > height + 20) Object.assign(p, createPetal(false));

      drawPetal(p);
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(tick);
})();
