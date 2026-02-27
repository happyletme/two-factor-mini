// pages/assets/assets.js
import {
  fetchDomesticGoldPrices,
  fetchExternalPrice,
  fetchShanghaiGoldPrice,
  fetchExchangeRates // <--- 1. 引入新方法
} from '../../utils/cloud';

// ... (保留之前的 GLOBAL_ASSETS_CONFIG) ...
const GLOBAL_ASSETS_CONFIG = [
  { symbol: 'XAU', name: '黄金', type: 'metal' },
  { symbol: 'XAG', name: '白银', type: 'metal' },
  { symbol: 'BTC', name: '比特币', type: 'crypto' },
  { symbol: 'ETH', name: '以太坊', type: 'crypto' },
  { symbol: 'XPT', name: '白金', type: 'metal' },
  { symbol: 'XPD', name: '钯金', type: 'metal' },
  { symbol: 'HG', name: '铜', type: 'metal' }
];

// 定义主流货币映射 (Top 20)
const CURRENCY_MAP = {
  'USD': '美元', 'EUR': '欧元', 'HKD': '港币', 'JPY': '日元',
  'GBP': '英镑', 'AUD': '澳元', 'CAD': '加元', 'SGD': '新加坡元',
  'CHF': '瑞士法郎', 'NZD': '新西兰元', 'KRW': '韩元', 'THB': '泰铢',
  'RUB': '卢布', 'MOP': '澳门元', 'TWD': '新台币', 'PHP': '菲律宾比索',
  'MYR': '林吉特', 'IDR': '印尼盾', 'VND': '越南盾', 'INR': '印度卢比'
};

const REFRESH_SECONDS = 60;

Page({
  data: {
    currentTab: 'global',
    loading: false,
    remaining: REFRESH_SECONDS,

    globalList: [],
    domesticList: [],
    shanghaiList: [],
    currencyList: [], // <--- 2. 新增：汇率数据源

    baseAmount: 100,  // <--- 3. 新增：默认兑换基数 (人民币)

    lastUpdatedTime: '',
    timerInterval: null
  },

  onLoad() {
    this.refreshCurrentTab();
  },

  onShow() {
    this.startCountdown();
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
  },

  switchTab(e) {
    const target = e.currentTarget.dataset.tab;
    if (this.data.currentTab === target) return;

    this.setData({
      currentTab: target,
      remaining: REFRESH_SECONDS
    });

    // 根据 Tab 判断是否需要刷新数据
    let listData = [];
    if (target === 'global') listData = this.data.globalList;
    else if (target === 'domestic') listData = this.data.domesticList;
    else if (target === 'shanghai') listData = this.data.shanghaiList;
    else if (target === 'currency') listData = this.data.currencyList; // <--- 4. 处理新 Tab

    if (listData.length === 0) {
      this.refreshCurrentTab();
    }
  },

  startCountdown() {
    this.stopCountdown();
    this.setData({
      timerInterval: setInterval(() => {
        let current = this.data.remaining;
        if (current > 0) {
          this.setData({ remaining: current - 1 });
        } else {
          this.manualRefresh();
        }
      }, 1000)
    });
  },

  stopCountdown() {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval);
      this.setData({ timerInterval: null });
    }
  },

  async manualRefresh() {
    if (this.data.loading) return;
    await this.refreshCurrentTab();
    this.setData({ remaining: REFRESH_SECONDS });
  },

  async refreshCurrentTab() {
    this.setData({ loading: true });
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    try {
      if (this.data.currentTab === 'global') {
        await this.loadGlobalData();
      } else if (this.data.currentTab === 'domestic') {
        await this.loadDomesticData();
      } else if (this.data.currentTab === 'shanghai') {
        await this.loadShanghaiData();
      } else if (this.data.currentTab === 'currency') {
        await this.loadCurrencyData(); // <--- 5. 调用新加载方法
      }
      this.setData({ lastUpdatedTime: timeString });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '刷新失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // ... (保留 loadGlobalData, loadDomesticData, loadShanghaiData) ...
  async loadGlobalData() {
    // ... (保持原样)
    const promises = GLOBAL_ASSETS_CONFIG.map(async (asset) => {
        try {
          const res = await fetchExternalPrice(asset.symbol);

          let formattedTime = '---';
          if (res.updatedAt) {
            const date = new Date(res.updatedAt);
            const Y = date.getFullYear();
            const M = (date.getMonth() + 1).toString().padStart(2, '0');
            const D = date.getDate().toString().padStart(2, '0');
            const h = date.getHours().toString().padStart(2, '0');
            const m = date.getMinutes().toString().padStart(2, '0');
            const s = date.getSeconds().toString().padStart(2, '0');
            formattedTime = `${Y}-${M}-${D} ${h}:${m}:${s}`;
          }

          const unitStr = asset.type === 'metal' ? '盎司' : '';

          return {
            symbol: asset.symbol,
            name: asset.name,
            price: res.price,
            change: 0,
            unit: unitStr,
            time: formattedTime
          };
        } catch (err) {
          console.error(`获取 ${asset.symbol} 失败:`, err);
          return {
            symbol: asset.symbol,
            name: asset.name,
            price: '---',
            change: 0,
            unit: asset.type === 'metal' ? '盎司' : '',
            time: '---'
          };
        }
      });

      const results = await Promise.all(promises);

      const formatted = results.map(item => {
        let priceDisplay = '---';
        if (item.price !== '---') {
          priceDisplay = parseFloat(item.price).toFixed(2);
        }
        const changeVal = parseFloat(item.change).toFixed(2);

        return {
          ...item,
          price: priceDisplay,
          change: changeVal,
          isUp: parseFloat(item.change) >= 0,
          changeText: `${changeVal}%`
        };
      });

      this.setData({ globalList: formatted });
  },
  async loadDomesticData() {
    // ... (保持原样)
    const res = await fetchDomesticGoldPrices();
    const shopList = res.国内十大金店 || [];

    const mapped = shopList.map(item => ({
      brand: item.品牌,
      price: item.黄金价格,
      unit: item.单位,
      type: '足金999',
      time: item.报价时间
    }));

    this.setData({ domesticList: mapped });
  },
  async loadShanghaiData() {
    // ... (保持原样)
    const res = await fetchShanghaiGoldPrice();
    if (res.status === 'success' && res.data) {
      const data = res.data;
      const item = {
        symbol: data.symbol,
        name: data.symbol,
        price: data.price,
        unit: data.unit,
        price_text: data.price_text,
        time: data.update_time
      };
      this.setData({ shanghaiList: [item] });
    } else {
      this.setData({ shanghaiList: [] });
    }
  },

  // --- 4. 新增：加载汇率数据 ---
  async loadCurrencyData() {
    const res = await fetchExchangeRates();
    if (res.result === 'success' && res.conversion_rates) {
      const rates = res.conversion_rates;
      const list = [];

      // === 修改开始：格式化时间为 YYYY-MM-DD ===
      let formattedTime = '---';
      // API 返回的是 time_last_update_unix (秒级时间戳)，需要 * 1000 转毫秒
      if (res.time_last_update_unix) {
        const date = new Date(res.time_last_update_unix * 1000);
        const Y = date.getFullYear();
        const M = (date.getMonth() + 1).toString().padStart(2, '0');
        const D = date.getDate().toString().padStart(2, '0');
        formattedTime = `${Y}-${M}-${D}`;
      } else {
        // 兜底显示
        formattedTime = res.time_last_update_utc ? res.time_last_update_utc.substring(0, 16) : '---';
      }
      // === 修改结束 ===

      // 遍历预定义的 Top 20 货币
      Object.keys(CURRENCY_MAP).forEach(code => {
        if (rates[code]) {
          list.push({
            code: code,
            name: CURRENCY_MAP[code],
            rate: rates[code],
            time: formattedTime // 使用格式化后的时间
          });
        }
      });

      this.setData({ currencyList: list });
    }
  },

  // --- 5. 新增：处理金额输入 ---
  onAmountInput(e) {
    let val = e.detail.value;
    // 简单的防抖或直接更新，这里直接更新
    if (!val || isNaN(val)) val = 0;
    this.setData({ baseAmount: parseFloat(val) });
  },

  onShareAppMessage: function () {
    return {
      title: '资产行情',
      path: '/pages/assets/assets',
      imageUrl: ''
    };
  },
  onShareTimeline: function () {
    return {
      title: '资产行情',
      query: '',
      imageUrl: ''
    };
  }
});
