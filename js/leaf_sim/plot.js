// js/leaf_sim/plot.js
import * as echarts from 'echarts';

// init a simple time→value line chart; CSS sets size/position of #cam-plot
export function initCamPlot(domId = 'cam-plot') {
  const el = document.getElementById(domId);
  if (!el) { console.warn(`[cam plot] #${domId} not found`); return null; }

  const chart = echarts.init(el, null, { renderer: 'canvas', useDirtyRect: true });
  chart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 36, right: 8, top: 8, bottom: 24 },
    xAxis: { type: 'value', name: 't (s)', min: v => Math.max(v.max - 8,0), max: v => Math.max(v.max*1.1,10) },
    yAxis: { type: 'value', name: 'cam.y', min: v => v.min*0.9, max: v => v.max*1.1 },
    series: [{ type: 'line', showSymbol: false, data: [] }]
  });
//   chart.xAxis.min.set('dataMin');
  return chart;
}

// push one sample per frame; keep a rolling window (default ~10s @120fps)
export function pushCamSample(chart, t, y, maxN = 1200) {
  if (!chart) return;
  const opt = chart.getOption();
  const data = opt.series[0].data;
  data.push([t, y]);
  if (data.length > maxN) data.shift();
  chart.setOption(opt, false, true); // lazyUpdate for per-frame calls
}
