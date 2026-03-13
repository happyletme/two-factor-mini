const cloud = require('../../utils/cloud.js');

Page({
  // 定时器引用，不放在 data 中，因为不需要渲染
  timer: null,

  data: {
    uiConfig: {
      banner: false,
      brandPrices: false,
    },

    goldData: {
      price: '--.--',
      change: '0.00%',
      isUp: true,
      updateTime: '加载中...'
    },

    // 关键：默认空，避免接口返回前先显示本地工具
    tools: [],

    brandPrices: []
  },

  async onLoad() {
    await this.fetchUIConfig();
    // 首次加载数据
    this.fetchGoldPrice(false);
  },

  // --- 新增：页面显示时开启定时器 ---
  onShow() {
    this.startAutoUpdate();
  },

  // --- 新增：页面隐藏时（如跳转）暂停定时器 ---
  onHide() {
    this.stopAutoUpdate();
  },

  // --- 新增：页面卸载时清除定时器 ---
  onUnload() {
    this.stopAutoUpdate();
  },

  // --- 新增：开启自动更新 ---
  startAutoUpdate() {
    this.stopAutoUpdate(); // 防止重复开启
    // 每 60000 毫秒（1分钟）执行一次
    this.timer = setInterval(() => {
      console.log('⏰ 定时器触发：静默更新金价...');
      // 传入 false，表示不显示 loading 弹窗
      this.fetchGoldPrice(false);
    }, 60000);
  },

  // --- 新增：停止自动更新 ---
  stopAutoUpdate() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('⏸️ 定时器已暂停');
    }
  },

  async onPullDownRefresh() {
    // 下拉刷新时，手动更新一次
    await this.fetchGoldPrice(true);
  },

  async fetchUIConfig() {
    try {
      const cfg = await cloud.fetchUIConfig();

      this.setData({
        uiConfig: {
          banner: !!cfg.banner,
          brandPrices: !!cfg.brandPrices,
        },
        tools: Array.isArray(cfg.tools) ? cfg.tools.filter(item => item && item.show !== false) : []
      });
    } catch (err) {
      console.warn('获取UI配置失败，隐藏所有受控模块', err);
      this.setData({
        uiConfig: {
          banner: false,
          brandPrices: false,
        },
        tools: [],
        brandPrices: []
      });
    }
  },

  async fetchGoldPrice(showLoading = true) {
    try {
      const { banner, brandPrices } = this.data.uiConfig;
      // 如果配置都没开，可能不需要请求，视业务情况而定
      if (!banner && !brandPrices) return;

      if (showLoading) wx.showLoading({ title: '加载中...' });

      const now = Math.floor(Date.now() / 1000);

      // 1. 发起请求
      const [realtimeRes, domesticRes, ohlcRes] = await Promise.all([
        cloud.getGoldPriceInCNY().catch(err => {
          console.error('❌ 实时金价接口报错:', err);
          return null;
        }),
        brandPrices ? cloud.fetchDomesticGoldPrices().catch(err => {
          console.error('❌ 国内金价接口报错:', err);
          return null;
        }) : Promise.resolve(null),
        cloud.fetchOHLC(now).catch(() => null)
      ]);

      // 🔍 调试日志
      // console.log('✅ 实时金价数据:', realtimeRes);

      // 2. 解析实时金价
      let finalPrice = '--.--';

      // 兼容逻辑：优先找 priceCNY，如果没有再找 rate，或者 price
      if (realtimeRes) {
        const val = realtimeRes.priceCNY || realtimeRes.rate || realtimeRes.price;
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          finalPrice = numVal.toFixed(2);
        }
      }

      // 3. 解析涨跌幅：使用美元实时价比较昨日收盘价
      let displayChange = '0.00%';
      let isUp = true;

      const todayPriceUSD = parseFloat(realtimeRes && realtimeRes.rawPriceUSD);
      let prevClosePrice = NaN;

      // 提取昨日收盘价（兼容多种 OHLC 返回结构）
      if (ohlcRes) {
        if (Array.isArray(ohlcRes) && ohlcRes.length > 0) {
          const last = ohlcRes[ohlcRes.length - 1];
          const prev = ohlcRes.length > 1 ? ohlcRes[ohlcRes.length - 2] : null;

          if (Array.isArray(last)) {
            // [ts, open, high, low, close]
            prevClosePrice = parseFloat(prev ? prev[4] : last[4]);
          } else if (last && typeof last === 'object') {
            // [{ close, prevClose? }, ...]
            prevClosePrice = parseFloat(last.prevClose ?? (prev ? prev.close : last.close));
          }
        } else if (typeof ohlcRes === 'object') {
          // { close, prevClose? }
          prevClosePrice = parseFloat(ohlcRes.prevClose ?? ohlcRes.close);
        }
      }

      if (!isNaN(todayPriceUSD) && !isNaN(prevClosePrice) && prevClosePrice !== 0) {
        const percentageChange = ((todayPriceUSD - prevClosePrice) / prevClosePrice) * 100;
        displayChange = `${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(2)}%`;
        isUp = percentageChange >= 0;
      } else if (domesticRes) {
        // 备用方案：OHLC不可用时，退回国内接口涨跌
        const domesticList = domesticRes['国内黄金'] || [];
        const domesticItem = domesticList.find(item => item['品种'] === '国内金价');
        if (domesticItem) {
          displayChange = domesticItem['幅度'] || '0.00%';
          isUp = !String(domesticItem['涨跌'] || '').includes('-');
        }
      }

      // 4. 解析品牌金价
      let formattedBrands = [];
      if (brandPrices && domesticRes) {
        const rawBrandList = domesticRes['国内十大金店'] || [];
        formattedBrands = rawBrandList
          .filter(item => item['单位'] === '元/克') // 过滤掉非按克计价的
          .map(item => ({
            name: (item['品牌'] || '').replace('内地', ''),
            price: item['黄金价格'],
            jintiaoprice: item['金条价格'],
            fee: '工费另计'
          }));
      }

      const nowTime = new Date();
      const updateTime = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;

      // 5. 更新 UI
      this.setData({
        goldData: {
          price: finalPrice,
          change: displayChange,
          isUp,
          updateTime
        },
        brandPrices: formattedBrands
      });

    } catch (error) {
      console.error('❌ 页面逻辑处理失败', error);
      // 静默更新失败时不弹窗，只有手动刷新才弹窗
      if (showLoading) wx.showToast({ title: '数据解析错误', icon: 'none' });
    } finally {
      if (showLoading) wx.hideLoading();
      wx.stopPullDownRefresh();
    }
  },

  onBannerTap() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

    // 分享给好友
  onShareAppMessage() {
    const { price, updateTime } = this.data.goldData || {};
    const hasPrice = price && price !== '--.--';
    const title = hasPrice
      ? `当前黄金价格：¥${price}/克，快来看看`
      : '实时黄金价格查询，快来看看今天金价';

    return {
      title,
      path: '/pages/index/index', // 按你的首页实际路径改
    };
  },

  // 分享到朋友圈（可选）
  onShareTimeline() {
    const { price, updateTime } = this.data.goldData || {};
    const hasPrice = price && price !== '--.--';

    return {
      title: hasPrice
        ? `黄金 ¥${price}/克，快来看看`
        : '实时黄金价格',
      query: '', // 需要参数可在这里拼
    };
  },


  // --- 修改：点击工具时带上金价参数 ---
  onToolTap(e) {
    let { url } = e.currentTarget.dataset;
    if (!url) return;

    // 如果是跳转到计算器，且当前有有效的金价，则拼接参数
    if (url.includes('calculator') && this.data.goldData.price && this.data.goldData.price !== '--.--') {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}price=${this.data.goldData.price}`;
    }

    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '功能开发中', icon: 'none' })
    });
  }
});
