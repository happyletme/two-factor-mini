// pages/exchange/exchange.js
const { fetchExchangeRates } = require('../../utils/cloud.js');

const HOT_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'AUD', 'CAD', 'SGD', 'CHF', 'KRW'];

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
};

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
    this.loadRates();
  },

  async loadRates() {
    this.setData({ loading: true, errorText: '' });
    try {
      // 你当前封装是固定 CNY URL。如果你要支持切换基准，
      // 建议把 fetchExchangeRates(base) 做成可传参。
      const rateRes = await fetchExchangeRates(this.data.baseCurrency);

      const ratesMap = rateRes && rateRes.conversion_rates ? rateRes.conversion_rates : {};
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
      title: '汇率换算',
      path: '/pages/exchange/exchange'
    }
  }
  ,

  onShareTimeline: function () {
    return {
      title: '汇率换算',
      query: '/pages/exchange/exchange',
    };
  }
});
