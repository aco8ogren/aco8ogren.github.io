const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

// List of leaf image file paths
const leafImagePaths = [
    'graphics/maple_leaf.svg',
    'graphics/maple_leaf_2.svg',
    'graphics/maple_leaf_3.svg',
    'graphics/maple_leaf_4.svg',
    // Add as many as you like
];

const minDepth = 1;
const maxDepth = 4;
const depthOfFocus = 1.5; // Focus plane
const blurPerDepth = 1; // pixels of blur per unit distance from focus
const N_leaves_max = 100;
const N_leaves_initial = Math.round(N_leaves_max / 20);
const parallaxStrength = 0.8; // range: 0 (no parallax) to 1 (full parallax)

const leafImages = [];
let imagesLoaded = 0;

// Load all leaf images
for (let path of leafImagePaths) {
    const img = new Image();
    img.src = path;
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === leafImagePaths.length) {
            requestAnimationFrame(animate);
        }
    };
    leafImages.push(img);
}

// Resize canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Create one leaf object
function createLeaf() {
    const x = Math.random() * canvas.width;
    const y = window.scrollY - 40;
    const depth = minDepth + Math.random() * (maxDepth - minDepth); // pseudo-Z depth

    const size = 15 + Math.random() * 15; // World-space (true physical) size

    const speed = 0.5 + Math.random(); // Base fall speed
    const swayPhase = Math.random() * Math.PI * 2;
    const swayFreq = 0.001 + Math.random() * 0.001;
    const spinSpeed = (Math.random() - 0.5) * 0.02;
    const yRotationFreq = 0.001 + Math.random() * 0.001;
    const yRotationPhase = Math.random() * Math.PI * 2;

    // Depth-dependent factor for visual effects (size, alpha, speed, sway, etc.)
    const depthFactor = 1 / depth;
    const parallaxFactor = (1 - parallaxStrength) * 1 + parallaxStrength * depthFactor;

    const swayAmplitude = (10 + Math.random() * 10) * parallaxFactor;

    // More transparent as depth increases (with variation)
    const rawAlpha = 0.4 + parallaxFactor * 0.6 + (Math.random() - 0.5) * 0.1;
    const alpha = Math.min(1, Math.max(0, rawAlpha));

    const img = leafImages[Math.floor(Math.random() * leafImages.length)];

    return {
        baseX: x,
        y,
        depth,
        size,
        speed,
        swayPhase,
        swayAmplitude,
        swayFreq,
        spin: Math.random() * Math.PI * 2,
        spinSpeed,
        yRotationFreq,
        yRotationPhase,
        alpha,
        fadingOut: false,
        fadeOutSpeed: 0.01 + Math.random() * 0.01, // fade rate per frame
        fadingIn: true,
        fadeInSpeed: 0.005 + Math.random() * 0.005,
        img
    };
}

// Initialize initial leaves
const leaves = [];
for (let i = 0; i < N_leaves_initial; i++) {
    leaves.push(createLeaf());
}

// Animate the leaves
function animate() {
    const now = performance.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];

        const depthFactor = 1 / leaf.depth;
        const parallaxFactor = (1 - parallaxStrength) * 1 + parallaxStrength * depthFactor;

        const drawSize = leaf.size * parallaxFactor; // screen-space draw size

        // Simulate rotation about Y axis
        const yAxisFlip = Math.sin(now * leaf.yRotationFreq + leaf.yRotationPhase);
        const scaleX = 0.2 + Math.abs(yAxisFlip) * 0.8;

        // Orientation-based drag: use abs(yAxisFlip) as drag coefficient
        const dragFactor = Math.abs(yAxisFlip);

        // Modulate fall speed and spin speed based on orientation
        const baseFallSpeed = leaf.speed * parallaxFactor;
        const fallSpeed = baseFallSpeed * (0.5 + 0.5 * (1 - dragFactor)); // slower when face-on
        leaf.y += fallSpeed;

        const spinBoost = 0.5 + 0.5 * dragFactor; // more spin when face-on
        leaf.spin += leaf.spinSpeed * spinBoost;

        leaf.y += leaf.speed * parallaxFactor; // parallax-based fall speed
        leaf.spin += leaf.spinSpeed;

        // Fade in newly spawned leaf
        if (leaf.fadingIn) {
            leaf.alpha = Math.min(leaf.alpha + leaf.fadeInSpeed, 1.0);
            if (leaf.alpha >= 1.0) {
                leaf.fadingIn = false;
            }
        }

        // Trigger fade out if leaf is far below viewport
        if (!leaf.fadingOut && leaf.y - drawSize > window.scrollY + window.innerHeight + 20) {
            leaf.fadingOut = true;
        }

        // Update alpha if fading out
        if (leaf.fadingOut) {
            leaf.alpha = Math.max(0, leaf.alpha - leaf.fadeOutSpeed);
        }

        // Horizontal sway
        const sway = Math.sin(now * leaf.swayFreq + leaf.swayPhase) * leaf.swayAmplitude;
        const drawX = leaf.baseX + sway;
        const drawY = leaf.y - window.scrollY * parallaxFactor;

        // Apply blur based on depth-of-field
        const focusDistance = Math.abs(leaf.depth - depthOfFocus);
        const blurAmount = blurPerDepth * focusDistance;

        // Draw the leaf
        ctx.save();
        ctx.translate(drawX + drawSize / 2, drawY + drawSize / 2);
        ctx.rotate(leaf.spin);
        ctx.scale(scaleX, 1); // squish horizontally to simulate Y-rotation
        ctx.globalAlpha = Math.max(0, Math.min(1, leaf.alpha));
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.drawImage(leaf.img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Occasionally spawn new leaf
        const spawnProbability = 1 - (leaves.length / N_leaves_max);
        if (Math.random() < 0.005 * spawnProbability) {
            leaves.push(createLeaf());
            console.log(`Spawning leaf. Count: ${leaves.length}`);
        }
    }

    // Remove leaves that have faded out completely
    for (let i = leaves.length - 1; i >= 0; i--) {
        if (leaves[i].alpha <= 0) {
            leaves.splice(i, 1);
            console.log(`Deleting leaf. Count: ${leaves.length}`);
        }
    }

    requestAnimationFrame(animate);
}
