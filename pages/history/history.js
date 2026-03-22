import * as echarts from '../../ec-canvas/echarts';
import { fetchHistoryPrices, fetchUIConfig } from '../../utils/cloud';

const SYMBOL_LABEL_MAP = {
  XAU: '黄金',
  XAG: '白银',
  HG: '黄铜'
};

const RETIREMENT_TYPE_MAP = {
  male_staff: { label: '男职工', baseAgeMonths: 60 * 12 },
  female_cadre: { label: '女干部', baseAgeMonths: 55 * 12 },
  female_worker: { label: '女工人', baseAgeMonths: 50 * 12 },
};

const RETIREMENT_TYPE_OPTIONS = [
  { key: 'male_staff', label: '男职工' },
  { key: 'female_cadre', label: '女干部' },
  { key: 'female_worker', label: '女工人' },
];

const RETIRE_BIRTH_YEAR_START = 1950;
const RETIRE_BIRTH_YEAR_END = new Date().getFullYear();
const RETIRE_BIRTH_YEAR_OPTIONS = Array.from(
  { length: RETIRE_BIRTH_YEAR_END - RETIRE_BIRTH_YEAR_START + 1 },
  (_, index) => String(RETIRE_BIRTH_YEAR_START + index)
);
const RETIRE_BIRTH_MONTH_OPTIONS = Array.from(
  { length: 12 },
  (_, index) => String(index + 1).padStart(2, '0')
);
const DEFAULT_BIRTH_YEAR = '1990';
const DEFAULT_BIRTH_YEAR_INDEX = Math.max(
  0,
  RETIRE_BIRTH_YEAR_OPTIONS.indexOf(DEFAULT_BIRTH_YEAR)
);
const DEFAULT_BIRTH_MONTH_INDEX = 0;

function buildEmptyRetirementResult() {
  return {
    hasResult: false,
    baseRetireAgeText: '--',
    delayedRetireAgeText: '--',
    baseRetireDateText: '--',
    delayedRetireDateText: '--',
    delayMonths: 0,
    remainText: '--',
    statusText: '--',
  };
}

function normalizeIntegerInput(value) {
  return String(value || '').replace(/\D/g, '');
}

function addMonthsToYearMonth(year, month, monthsToAdd) {
  const total = year * 12 + (month - 1) + monthsToAdd;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

function formatYearMonthText(year, month) {
  return `${year}年${String(month).padStart(2, '0')}月`;
}

function formatAgeByMonths(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (!months) return `${years}岁`;
  return `${years}岁${months}个月`;
}

function getMonthDiff(fromYear, fromMonth, toYear, toMonth) {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function formatDateLabel(dateStr, period) {
  if (!dateStr) return '';
  const d = String(dateStr).slice(0, 10); // yyyy-mm-dd
  if (period === '1y') return d.slice(0, 7); // yyyy-mm
  return d.slice(5); // mm-dd
}

Page({
  data: {
    uiConfig: {
      banner: false,
    },
    configLoaded: false,

    retirementTypeOptions: RETIREMENT_TYPE_OPTIONS,
    retirementType: 'male_staff',
    birthYearOptions: RETIRE_BIRTH_YEAR_OPTIONS,
    birthMonthOptions: RETIRE_BIRTH_MONTH_OPTIONS,
    birthYearIndex: DEFAULT_BIRTH_YEAR_INDEX,
    birthMonthIndex: DEFAULT_BIRTH_MONTH_INDEX,
    delayMonthsInput: '0',
    retirementResult: buildEmptyRetirementResult(),

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
    }, () => {
      this.calculateRetirement();
      this.initPage();
    });
  },

  onChangeRetirementType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || !RETIREMENT_TYPE_MAP[type] || type === this.data.retirementType) return;
    this.setData({ retirementType: type }, () => this.calculateRetirement());
  },

  onBirthYearChange(e) {
    const birthYearIndex = Number(e.detail.value);
    if (!Number.isFinite(birthYearIndex)) return;
    this.setData({ birthYearIndex }, () => this.calculateRetirement());
  },

  onBirthMonthChange(e) {
    const birthMonthIndex = Number(e.detail.value);
    if (!Number.isFinite(birthMonthIndex)) return;
    this.setData({ birthMonthIndex }, () => this.calculateRetirement());
  },

  onInputDelayMonths(e) {
    const raw = normalizeIntegerInput(e.detail.value);
    const delayMonthsInput = raw ? String(Math.min(600, Number(raw))) : '';
    this.setData({ delayMonthsInput }, () => this.calculateRetirement());
  },

  onResetRetirement() {
    this.setData({
      retirementType: 'male_staff',
      birthYearIndex: DEFAULT_BIRTH_YEAR_INDEX,
      birthMonthIndex: DEFAULT_BIRTH_MONTH_INDEX,
      delayMonthsInput: '0',
      retirementResult: buildEmptyRetirementResult(),
    }, () => this.calculateRetirement());
  },

  calculateRetirement() {
    const yearText = this.data.birthYearOptions[this.data.birthYearIndex];
    const monthText = this.data.birthMonthOptions[this.data.birthMonthIndex];
    const retirementTypeMeta = RETIREMENT_TYPE_MAP[this.data.retirementType];

    const birthYear = Number(yearText);
    const birthMonth = Number(monthText);
    const delayMonthsRaw = Number(this.data.delayMonthsInput || 0);
    const delayMonths = Math.max(0, Math.min(600, Number.isFinite(delayMonthsRaw) ? delayMonthsRaw : 0));

    if (
      !retirementTypeMeta ||
      !Number.isFinite(birthYear) ||
      !Number.isFinite(birthMonth) ||
      birthMonth < 1 ||
      birthMonth > 12
    ) {
      this.setData({ retirementResult: buildEmptyRetirementResult() });
      return;
    }

    const baseAgeMonths = retirementTypeMeta.baseAgeMonths;
    const baseRetire = addMonthsToYearMonth(birthYear, birthMonth, baseAgeMonths);
    const delayedRetire = addMonthsToYearMonth(baseRetire.year, baseRetire.month, delayMonths);

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const remainMonths = getMonthDiff(nowYear, nowMonth, delayedRetire.year, delayedRetire.month);

    const remainText = remainMonths > 0
      ? `距离退休约 ${formatAgeByMonths(remainMonths)}`
      : remainMonths === 0
        ? '本月达到退休时间'
        : `已退休 ${formatAgeByMonths(Math.abs(remainMonths))}`;

    this.setData({
      retirementResult: {
        hasResult: true,
        baseRetireAgeText: formatAgeByMonths(baseAgeMonths),
        delayedRetireAgeText: formatAgeByMonths(baseAgeMonths + delayMonths),
        baseRetireDateText: formatYearMonthText(baseRetire.year, baseRetire.month),
        delayedRetireDateText: formatYearMonthText(delayedRetire.year, delayedRetire.month),
        delayMonths,
        remainText,
        statusText: remainMonths >= 0 ? '未退休' : '已退休',
      },
    });
  },

  async initPage() {
    try {
      const cfg = await fetchUIConfig();
      const banner = !!(cfg && cfg.banner);
      this.setData({
        uiConfig: { banner },
        configLoaded: true,
      });

      if (banner) {
        this.loadData();
      }
    } catch (e) {
      this.setData({
        uiConfig: { banner: false },
        configLoaded: true,
      });
    }
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
    if (!this.data.uiConfig.banner) return;

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
