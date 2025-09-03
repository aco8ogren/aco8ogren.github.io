// js/leaf_sim/plot.js
import * as echarts from 'echarts';

// init a simple time→value line chart; CSS sets size/position of #cam-plot
export function initCamYPositionPlot(domId = 'cam-plot') {
  const el = document.getElementById(domId);
  if (!el) { console.warn(`[cam plot] #${domId} not found`); return null; }
  if (el.clientWidth === 0 || el.clientHeight === 0) {
    console.log(`[echarts] ${domId} has zero size; aborting init`);
    return null;
  }

  const chart = echarts.init(el, null, { renderer: 'canvas', useDirtyRect: true });
  chart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 36, right: 8, top: 8, bottom: 24 },
    xAxis: { type: 'value', name: 't (s)', min: v => Math.max(v.max - 8, 0), max: v => Math.max(v.max * 1.1, 10) },
    yAxis: { type: 'value', name: 'cam.y', min: v => v.min * 0.9, max: v => v.max * 1.1 },
    series: [{ type: 'line', showSymbol: false, data: [] }]
  });
  //   chart.xAxis.min.set('dataMin');
  return chart;
}

// push one sample per frame; keep a rolling window (default ~10s @120fps)
export function pushCamYPositionSample(chart, t, y, maxN = 1200) {
  if (!chart) return;
  const opt = chart.getOption();
  const data = opt.series[0].data;
  data.push([t, y]);
  if (data.length > maxN) data.shift();
  chart.setOption(opt, false, true); // lazyUpdate for per-frame calls
}

// initialize an x–y heatmap (integrated over z)

const _fmtAxis = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10)   return n.toFixed(0);
  if (Math.abs(n) >= 1)    return n.toFixed(1);
  return n.toPrecision(2);
};

const _rangesFromDomain = (domain, nx, ny) => {
  const Lx = domain?.L?.x ?? nx;
  const Ly = domain?.L?.y ?? ny;
  const px = Math.max(0, domain?.padding_fraction?.x ?? 0);
  const py = Math.max(0, domain?.padding_fraction?.y ?? 0);
  const xmin = -px * Lx, xmax = (1 + px) * Lx;
  const ymin = -py * Ly, ymax = (1 + py) * Ly;
  const dx = (xmax - xmin) / nx;
  const dy = (ymax - ymin) / ny;
  return { Lx, Ly, px, py, xmin, xmax, ymin, ymax, dx, dy };
};

const _binCenters = (n, min, step) => Array.from({ length: n }, (_, i) => min + (i + 0.5) * step);

export function initLeafDensityPlot(domId = 'density-plot', nx = 36, ny = 18, domain = null, unit = '') {
  const el = document.getElementById(domId);
  if (!el) { console.warn(`[density plot] #${domId} not found`); return null; }
  if (el.clientWidth === 0 || el.clientHeight === 0) {
    console.log(`[echarts] ${domId} has zero size; aborting init`);
    return null;
  }

  const chart = echarts.init(el, null, { renderer: 'canvas', useDirtyRect: true });

  const R = _rangesFromDomain(domain, nx, ny);
  const xCenters = _binCenters(nx, R.xmin, R.dx);
  const yCenters = _binCenters(ny, R.ymin, R.dy);
  const tickEveryX = Math.max(1, Math.round(nx / 6));
  const tickEveryY = Math.max(1, Math.round(ny / 4));

  chart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 40, right: 8, top: 8, bottom: 28 },
    xAxis: {
      type: 'category',
      data: xCenters,
      boundaryGap: true, // required by heatmap on cartesian
      name: unit ? `x (${unit})` : 'x',
      nameGap: 16,
      axisLabel: { show: true, interval: tickEveryX - 1, formatter: _fmtAxis },
      axisTick: { show: true, alignWithLabel: true, length: 3 },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'category',
      data: yCenters,
      boundaryGap: true,
      name: unit ? `y (${unit})` : 'y',
      nameGap: 16,
      axisLabel: { show: true, interval: tickEveryY - 1, formatter: _fmtAxis },
      axisTick: { show: true, alignWithLabel: true, length: 3 },
      splitLine: { show: false }
    },
    visualMap: [{
      show: false,
      min: 0,
      max: 1, // updated dynamically
      inRange: { color: ['#0b0e13', '#1f3b4d', '#20638f', '#72bcd4', '#cfe8ff'] }
    }],
    series: [{
      type: 'heatmap',
      data: [], // [i, j, count]
      progressive: 0,
      emphasis: { disabled: true },
      animation: false
    }]
  });

  // stash for updates
  chart.__nx = nx;
  chart.__ny = ny;
  chart.__unit = unit;
  chart.__range = { xmin: R.xmin, xmax: R.xmax, ymin: R.ymin, ymax: R.ymax };
  return chart;
}


// update the heatmap with current leaf positions
export function updateLeafDensityPlot(chart, leaves, domain) {
  if (!chart || !leaves || !domain?.L) return;

  const nx = chart.__nx || 36;
  const ny = chart.__ny || 18;
  const Lx = domain.L.x;
  const Ly = domain.L.y;

  const counts = new Uint16Array(nx * ny);

  // bin leaves into (x,y) grid; ignore z
  for (let k = 0; k < leaves.length; k++) {
    const p = leaves[k]?.x;
    if (!p) continue;

    const x = p.x, y = p.y;
    if (x < 0 || x >= Lx || y < 0 || y >= Ly) continue;

    let i = Math.floor((x / Lx) * nx);
    let j = Math.floor((y / Ly) * ny);
    if (i === nx) i = nx - 1;
    if (j === ny) j = ny - 1;

    counts[j * nx + i]++;
  }

  let maxC = 0;
  const data = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = counts[j * nx + i];
      data.push([i, j, v]);
      if (v > maxC) maxC = v;
    }
  }

  const opt = chart.getOption();
  opt.series[0].data = data;
  opt.visualMap[0].max = Math.max(1, maxC);
  chart.setOption(opt, false, true); // lazy update is fine per-frame or throttled
}
