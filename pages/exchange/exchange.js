// pages/exchange/exchange.js
const { fetchExchangeRatesNew, fetchUIConfig } = require('../../utils/cloud.js');

const HOT_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'AUD', 'CAD', 'SGD', 'CHF', 'KRW', 'MYR', 'THB', 'VND'];

const CURRENCY_META = {
  CNY: { name: '人民币', symbol: '¥', flag: '🇨🇳' },
  USD: { name: '美元', symbol: '$', flag: '🇺🇸' },
  EUR: { name: '欧元', symbol: '€', flag: '🇪🇺' },
  JPY: { name: '日元', symbol: '¥', flag: '🇯🇵' },
  GBP: { name: '英镑', symbol: '£', flag: '🇬🇧' },
  HKD: { name: '港币', symbol: 'HK$', flag: '🇭🇰' },
  AUD: { name: '澳元', symbol: 'A$', flag: '🇦🇺' },
  CAD: { name: '加元', symbol: 'C$', flag: '🇨🇦' },
  SGD: { name: '新加坡元', symbol: 'S$', flag: '🇸🇬' },
  CHF: { name: '瑞士法郎', symbol: 'CHF', flag: '🇨🇭' },
  KRW: { name: '韩元', symbol: '₩', flag: '🇰🇷' },
  MYR: { name: '马来西亚林吉特', symbol: 'RM', flag: '🇲🇾' },
  THB: { name: '泰铢', symbol: '฿', flag: '🇹🇭' },
  VND: { name: '越南盾', symbol: '₫', flag: '🇻🇳' },
};

const DEFAULT_ANNUAL_RATE = '3.1';
const DEFAULT_LOAN_YEARS = '30';

function buildEmptyMortgageResult() {
  return {
    hasResult: false,
    principal: '0.00',
    totalPayment: '0.00',
    totalInterest: '0.00',
    monthlyPayment: '0.00',
    firstMonthPayment: '0.00',
    lastMonthPayment: '0.00',
    monthlyDecrease: '0.00',
    months: 0,
  };
}

function normalizeDecimalInput(value, decimalPlaces = 3) {
  const sanitized = String(value || '').replace(/[^\d.]/g, '');
  if (!sanitized) return '';

  const firstDotIndex = sanitized.indexOf('.');
  if (firstDotIndex === -1) return sanitized;

  const intPart = sanitized.slice(0, firstDotIndex);
  const decimalPart = sanitized.slice(firstDotIndex + 1).replace(/\./g, '').slice(0, decimalPlaces);
  return decimalPart ? `${intPart}.${decimalPart}` : `${intPart}.`;
}

function normalizeIntegerInput(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  const fixed = n.toFixed(2);
  const [intPart, decimalPart] = fixed.split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
}


function formatRate(code, val) {
  if (code === 'JPY' || code === 'KRW') return Number(val).toFixed(4);
  return Number(val).toFixed(6);
}

function formatAmount(code, val) {
  const n = Number(val);
  if (!isFinite(n)) return '--';
  if (code === 'JPY' || code === 'KRW') return n.toFixed(0);
  return n.toFixed(2);
}

Page({
  data: {
    uiConfig: {
      banner: false,
    },
    configLoaded: false,

    loanAmount: '',
    annualRate: DEFAULT_ANNUAL_RATE,
    loanYears: DEFAULT_LOAN_YEARS,
    repaymentType: 'equal_installment',
    mortgageResult: buildEmptyMortgageResult(),

    loading: false,
    errorText: '',
    updatedAt: '',

    baseCurrency: 'CNY',
    amount: '1',

    ratesMap: {},
    list: [],

    hotBaseOptions: ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD'],
  },

  onLoad() {
    this.initPage();
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
        this.loadRates();
      }
    } catch (e) {
      this.setData({
        uiConfig: { banner: false },
        configLoaded: true,
      });
    }
  },

  async loadRates() {
    this.setData({ loading: true, errorText: '' });
    try {
      // 你当前封装是固定 CNY URL。如果你要支持切换基准，
      // 建议把 fetchExchangeRates(base) 做成可传参。
      const rateRes = await fetchExchangeRatesNew(this.data.baseCurrency);

      const ratesMap = rateRes && rateRes.rates ? rateRes.rates : {};
      const updatedAt = rateRes && (rateRes.time_last_update_utc || rateRes.time_next_update_utc || '');

      const list = HOT_CURRENCIES.map((code) => {
        const rate = ratesMap[code];
        const amountNum = Number(this.data.amount || 0);
        const converted = rate ? amountNum * Number(rate) : NaN;
        const meta = CURRENCY_META[code] || { name: code, symbol: code, flag: '🌐' };

        return {
          code,
          name: meta.name,
          flag: meta.flag,
          symbol: meta.symbol,
          rateText: rate ? formatRate(code, rate) : '--',
          convertedText: rate ? formatAmount(code, converted) : '--',
        };
      });

      this.setData({
        ratesMap,
        list,
        updatedAt,
      });
    } catch (e) {
      this.setData({
        errorText: '汇率获取失败，请稍后重试',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInputAmount(e) {
    const value = e.detail.value.replace(/[^\d.]/g, '');
    this.setData({ amount: value }, () => this.rebuildList());
  },

  onMortgageInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;

    const rawValue = e.detail.value;
    let value = rawValue;

    if (field === 'loanYears') {
      value = normalizeIntegerInput(rawValue);
    } else if (field === 'loanAmount') {
      value = normalizeDecimalInput(rawValue, 2);
    } else if (field === 'annualRate') {
      value = normalizeDecimalInput(rawValue, 3);
    }

    this.setData({ [field]: value }, () => this.calculateMortgage());
  },

  onChangeRepaymentType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || type === this.data.repaymentType) return;

    this.setData({ repaymentType: type }, () => this.calculateMortgage());
  },

  onResetMortgage() {
    this.setData({
      loanAmount: '',
      annualRate: DEFAULT_ANNUAL_RATE,
      loanYears: DEFAULT_LOAN_YEARS,
      repaymentType: 'equal_installment',
      mortgageResult: buildEmptyMortgageResult(),
    });
  },

  calculateMortgage() {
    const principalWan = Number(this.data.loanAmount);
    const annualRate = Number(this.data.annualRate);
    const years = Number(this.data.loanYears);

    if (
      !Number.isFinite(principalWan) ||
      principalWan <= 0 ||
      !Number.isFinite(annualRate) ||
      annualRate < 0 ||
      !Number.isFinite(years) ||
      years <= 0
    ) {
      this.setData({ mortgageResult: buildEmptyMortgageResult() });
      return;
    }

    const principal = principalWan * 10000;
    const months = Math.round(years * 12);
    const monthlyRate = annualRate / 100 / 12;

    if (months <= 0) {
      this.setData({ mortgageResult: buildEmptyMortgageResult() });
      return;
    }

    const isEqualPrincipal = this.data.repaymentType === 'equal_principal';
    let monthlyPayment = 0;
    let firstMonthPayment = 0;
    let lastMonthPayment = 0;
    let monthlyDecrease = 0;
    let totalInterest = 0;
    let totalPayment = 0;

    if (isEqualPrincipal) {
      const monthlyPrincipal = principal / months;

      if (monthlyRate === 0) {
        firstMonthPayment = monthlyPrincipal;
        lastMonthPayment = monthlyPrincipal;
        monthlyDecrease = 0;
        totalInterest = 0;
      } else {
        firstMonthPayment = monthlyPrincipal + principal * monthlyRate;
        monthlyDecrease = monthlyPrincipal * monthlyRate;
        lastMonthPayment = monthlyPrincipal + monthlyPrincipal * monthlyRate;
        totalInterest = (principal * monthlyRate * (months + 1)) / 2;
      }

      totalPayment = principal + totalInterest;
    } else {
      if (monthlyRate === 0) {
        monthlyPayment = principal / months;
      } else {
        const factor = Math.pow(1 + monthlyRate, months);
        monthlyPayment = (principal * monthlyRate * factor) / (factor - 1);
      }

      totalPayment = monthlyPayment * months;
      totalInterest = totalPayment - principal;
    }

    this.setData({
      mortgageResult: {
        hasResult: true,
        principal: formatMoney(principal),
        totalPayment: formatMoney(totalPayment),
        totalInterest: formatMoney(totalInterest),
        monthlyPayment: formatMoney(monthlyPayment),
        firstMonthPayment: formatMoney(firstMonthPayment),
        lastMonthPayment: formatMoney(lastMonthPayment),
        monthlyDecrease: formatMoney(monthlyDecrease),
        months,
      },
    });
  },

  onChangeBase(e) {
    const code = e.currentTarget.dataset.code;
    if (!code || code === this.data.baseCurrency) return;
    this.setData({ baseCurrency: code }, () => this.loadRates());
  },

  onSwapWithUSD() {
    // 示例：和 USD 快速互换，你也可以做选择器版本
    const next = this.data.baseCurrency === 'USD' ? 'CNY' : 'USD';
    this.setData({ baseCurrency: next }, () => this.loadRates());
  },

  rebuildList() {
    const amountNum = Number(this.data.amount || 0);
    const ratesMap = this.data.ratesMap || {};

    const list = HOT_CURRENCIES.map((code) => {
      const rate = ratesMap[code];
      const meta = CURRENCY_META[code] || { name: code, symbol: code, flag: '🌐' };
      const converted = rate ? amountNum * Number(rate) : NaN;

      return {
        code,
        name: meta.name,
        flag: meta.flag,
        symbol: meta.symbol,
        rateText: rate ? formatRate(code, rate) : '--',
        convertedText: rate ? formatAmount(code, converted) : '--',
      };
    });

    this.setData({ list });
  },
  onShareAppMessage() {
    return {
      title: this.data.uiConfig.banner ? '汇率换算' : '房贷计算器',
      path: '/pages/exchange/exchange'
    }
  }
  ,

  onShareTimeline: function () {
    return {
      title: this.data.uiConfig.banner ? '汇率换算' : '房贷计算器',
      query: '/pages/exchange/exchange',
    };
  }
});
