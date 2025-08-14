const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

const img1 = new Image();
img1.src = 'graphics/coconut_flask.svg';

function resizeCanvas() {
  // Make canvas match the window’s inner width & height
  canvas.width = window.innerWidth + 20;
  canvas.height = window.innerHeight;
}

// Call once on load, and also on window resize
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let squares = [];

function createSquare() {
  // Position it near the bottom with random x
  const x = Math.random() * canvas.width;
  const y = canvas.height + window.scrollY + 20; // just below the visible area
  const size = 10 + Math.random() * 20; // random size
  const speed = 0.5 + Math.random() * 2;  // random upward speed
  const color = '#'+(Math.random()*0xFFFFFF<<0).toString(16).padStart(6,'0'); // random hex color

  return { x, y, size, speed, color };
}

// Optionally, create an initial batch
for (let i = 0; i < 100; i++) {
  squares.push(createSquare());
}

function animate() {
    // Clear the canvas each frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    // Optionally fill background with a color or gradient
    // ctx.fillStyle = '#000000';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    // Update and draw squares
    for (let i = 0; i < squares.length; i++) {
      const sq = squares[i];
      sq.y -= sq.speed; // move upward
  
      // If square is off-screen, re-spawn it
      if (sq.y + sq.size < 0) {
        squares[i] = createSquare(); 
        continue;  // skip drawing the old one
      }
  
      // Draw the square
      ctx.fillStyle = sq.color;
      // ctx.fillRect(sq.x, sq.y - window.scrollY, sq.size, sq.size);
      ctx.drawImage(img1, sq.x, sq.y - window.scrollY, sq.size, sq.size)
    }
  
    // Possibly add new squares over time if you want more
    // if (Math.random() < 0.02) {
    //   squares.push(createSquare());
    // }
  
    requestAnimationFrame(animate);
  }
  
  img1.onload = () => {
    requestAnimationFrame(animate); // start only after SVG is ready
  };
  
  requestAnimationFrame(animate);
