import * as echarts from '../../ec-canvas/echarts';
import { fetchHistoryPrices } from '../../utils/cloud';

const SYMBOL_LABEL_MAP = {
  XAU: '黄金',
  XAG: '白银',
  HG: '黄铜'
};

function formatDateLabel(dateStr, period) {
  if (!dateStr) return '';
  const d = String(dateStr).slice(0, 10); // yyyy-mm-dd
  if (period === '1y') return d.slice(0, 7); // yyyy-mm
  return d.slice(5); // mm-dd
}

Page({
  data: {
    symbol: 'XAU',
    symbolLabel: '黄金',
    period: '3m',
    loading: false,
    errorText: '',
    hasData: false,
    ec: { lazyLoad: true }
  },

  onLoad(options) {
    const symbol = (options && options.symbol) || 'XAU';
    this.setData({
      symbol,
      symbolLabel: SYMBOL_LABEL_MAP[symbol] || '黄金'
    }, () => this.loadData());
  },

  onSwitchSymbol(e) {
    const symbol = e.currentTarget.dataset.symbol;
    if (!symbol || symbol === this.data.symbol) return;
    this.setData({
      symbol,
      symbolLabel: SYMBOL_LABEL_MAP[symbol] || symbol
    }, () => this.loadData());
  },

  onSwitchPeriod(e) {
    const period = e.currentTarget.dataset.period;
    if (!period || period === this.data.period) return;
    this.setData({ period }, () => this.loadData());
  },

  async loadData() {
    this.setData({ loading: true, errorText: '', hasData: false });
    try {
      const res = await fetchHistoryPrices(this.data.symbol, this.data.period);
      const list = Array.isArray(res && res.list) ? res.list : [];
      const ascList = list.slice().reverse();

      if (!ascList.length) {
        this.setData({ hasData: false, loading: false });
        return;
      }

      this.setData({ hasData: true, loading: false }, () => {
        this.renderLineChart(ascList);
      });
    } catch (e) {
      this.setData({
        loading: false,
        hasData: false,
        errorText: '加载失败，请稍后重试'
      });
    }
  },

  buildOption(xDataRaw, yData) {
    const period = this.data.period;
    const xData = xDataRaw.map((d) => formatDateLabel(d, period));

    const max = Math.max(...yData);
    const min = Math.min(...yData);
    const span = Math.max(max - min, 1);
    const pad = span * 0.08;

    // 按品种控制小数位，避免坐标轴难看
    const digits = this.data.symbol === 'XAU' ? 1 : this.data.symbol === 'XAG' ? 2 : 3;

    return {
      color: ['#c69223'],
      grid: {
        left: 18,
        right: 12,
        top: 26,
        bottom: 44,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1' } },
        backgroundColor: 'rgba(17,24,39,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        formatter: (params) => {
          const p = params && params[0];
          if (!p) return '';
          const idx = p.dataIndex;
          return `${xDataRaw[idx].slice(0, 10)}\n均价：${Number(p.data).toFixed(digits)}`;
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xData,
        axisLine: { lineStyle: { color: '#d1d5db' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          margin: 10,
          // 控制显示密度，避免重叠
          interval: Math.max(0, Math.ceil(xData.length / 5) - 1)
        }
      },
      yAxis: {
        type: 'value',
        min: (v) => Number((v.min - pad).toFixed(digits)),
        max: (v) => Number((v.max + pad).toFixed(digits)),
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value) => Number(value).toFixed(digits)
        },
        splitLine: { lineStyle: { color: '#eef2f7' } }
      },
      series: [{
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 3, color: '#c69223' },
        itemStyle: { color: '#c69223' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(198,146,35,0.25)' },
            { offset: 1, color: 'rgba(198,146,35,0.03)' }
          ])
        },
        data: yData
      }]
    };
  },

  renderLineChart(ascList) {
    if (!ascList || !ascList.length) return;
    if (!this.ecComponent) this.ecComponent = this.selectComponent('#historyChart');
    if (!this.ecComponent) return;

    const xDataRaw = ascList.map((i) => String(i.day));
    const yData = ascList.map((i) => Number(i.avg_price));

    if (this.chart) {
      this.chart.setOption(this.buildOption(xDataRaw, yData), true);
      return;
    }

    this.ecComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr });
      canvas.setChart(chart);
      chart.setOption(this.buildOption(xDataRaw, yData));
      this.chart = chart;
      return chart;
    });
  },

  onUnload() {
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
  }
});
