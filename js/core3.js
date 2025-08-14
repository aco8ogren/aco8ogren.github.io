// Core3 Leaf Physics – refactored for clarity with physical interpretation and quaternion-based leaf orientation

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

// Load a single test leaf image for now
const leafImg = new Image();
leafImg.src = 'graphics/maple_leaf.svg';

// === Constants and Physical Parameters ===
const minDepth = 1;
const maxDepth = 5;
const depthOfFocus = 1.5;
const blurPerDepth = 1;
const parallaxStrength = 0.8; // control strength of depth effect on motion

const airDensity = 1.2;          // kg/m^3 (typical air density)
const areaDensity = 0.01;        // kg/m^2 for a typical thin leaf
const gravityAcceleration = 9.81;// m/s^2
const timeStep = 0.016;          // seconds per frame (approx. 60 FPS)

// === Helper Functions for Vector and Quaternion Math ===
function normalize3D(v) {
  const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
  return [v[0]/len, v[1]/len, v[2]/len];
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function scaleVec(v, s) {
  return [v[0]*s, v[1]*s, v[2]*s];
}

function addVec(a, b) {
  return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
}

function quatFromAxisAngle(axis, angle) {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return [Math.cos(halfAngle), axis[0]*s, axis[1]*s, axis[2]*s];
}

function quatMultiply(q1, q2) {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;
  return [
    w1*w2 - x1*x2 - y1*y2 - z1*z2,
    w1*x2 + x1*w2 + y1*z2 - z1*y2,
    w1*y2 - x1*z2 + y1*w2 + z1*x2,
    w1*z2 + x1*y2 - y1*x2 + z1*w2
  ];
}

function rotateVecByQuat(v, q) {
  const [w, x, y, z] = q;
  const qvec = [x, y, z];
  const uv = cross(qvec, v);
  const uuv = cross(qvec, uv);
  return [
    v[0] + 2 * (w * uv[0] + uuv[0]),
    v[1] + 2 * (w * uv[1] + uuv[1]),
    v[2] + 2 * (w * uv[2] + uuv[2])
  ];
}

// === Resize canvas to full window ===
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// === Generate test leaves with physical properties ===
const leaves = [];
for (let i = 0; i < 5; i++) {
  const radius_px = 40 + Math.random() * 20;
  const radius_m = radius_px / 100; // Convert to meters
  const area = Math.PI * radius_m * radius_m;
  const mass = area * areaDensity;
  const momentOfInertia = 0.5 * mass * radius_m * radius_m; // Disk assumption

  leaves.push({
    x: window.innerWidth * (0.2 + 0.15 * i),
    y: window.scrollY - 50,
    z: 0,
    depth: minDepth,
    vx: 0.2 * (Math.random() - 0.5),
    vy: 0.5 + Math.random(),
    orientation: [1, 0, 0, 0],
    angularVelocity: [
      0.01 * (Math.random() - 0.5),
      0.01 * (Math.random() - 0.5),
      0.01 * (Math.random() - 0.5)
    ],
    size: radius_px,
    mass,
    momentOfInertia,
    alpha: 0,
    fadingIn: true,
    fadingOut: false,
    fadeInSpeed: 0.02,
    fadeOutSpeed: 0.01,
  });
}

// === Main animation loop ===
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let leaf of leaves) {
    const depthFactor = 1 / leaf.depth;
    const parallaxFactor = (1 - parallaxStrength) + parallaxStrength * depthFactor;

    // Compute drag torque: torque = normal x (relative air velocity)
    const v_rel = normalize3D([-leaf.vx, -leaf.vy, 0]);
    const normal = rotateVecByQuat([0, 0, 1], leaf.orientation);
    const torque = cross(normal, v_rel);
    const angularAccel = scaleVec(torque, 1 / leaf.momentOfInertia);
    leaf.angularVelocity = addVec(leaf.angularVelocity, scaleVec(angularAccel, timeStep));

    // Integrate quaternion orientation from angular velocity
    const axis = normalize3D(leaf.angularVelocity);
    const omega = Math.sqrt(leaf.angularVelocity[0]**2 + leaf.angularVelocity[1]**2 + leaf.angularVelocity[2]**2);
    const deltaQuat = quatFromAxisAngle(axis, omega * timeStep);
    leaf.orientation = quatMultiply(deltaQuat, leaf.orientation);

    // Apply drag force (proportional to alignment with gravity)
    const alignment = Math.abs(normal[1]);
    const dragFactor = 0.3 + 0.7 * (1 - alignment);
    const drag = dragFactor * 0.1;
    leaf.vx -= drag * leaf.vx;
    leaf.vy -= drag * leaf.vy;
    leaf.vy += gravityAcceleration * timeStep;

    // Integrate position
    leaf.x += leaf.vx * timeStep * 100;
    leaf.y += leaf.vy * timeStep * 100 * parallaxFactor;

    // Alpha fade in/out logic
    if (leaf.fadingIn) {
      leaf.alpha = Math.min(1, leaf.alpha + leaf.fadeInSpeed);
      if (leaf.alpha >= 1) leaf.fadingIn = false;
    }
    if (!leaf.fadingOut && leaf.y - leaf.size > window.scrollY + window.innerHeight + 100) {
      leaf.fadingOut = true;
    }
    if (leaf.fadingOut) {
      leaf.alpha = Math.max(0, leaf.alpha - leaf.fadeOutSpeed);
    }

    // === Draw ===
    const drawX = leaf.x;
    const drawY = leaf.y - window.scrollY * parallaxFactor;
    const drawSize = leaf.size * parallaxFactor;

    const focusDistance = Math.abs(leaf.depth - depthOfFocus);
    const blurAmount = blurPerDepth * focusDistance;

    const leafXAxis = rotateVecByQuat([1, 0, 0], leaf.orientation);
    const leafYAxis = rotateVecByQuat([0, 1, 0], leaf.orientation);

    ctx.save();
    ctx.translate(drawX + drawSize / 2, drawY + drawSize / 2);
    ctx.setTransform(
      leafXAxis[0], leafYAxis[0],
      leafXAxis[1], leafYAxis[1],
      drawX + drawSize / 2,
      drawY + drawSize / 2
    );
    ctx.globalAlpha = leaf.alpha;
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(leafImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  requestAnimationFrame(animate);
}

leafImg.onload = () => requestAnimationFrame(animate);
