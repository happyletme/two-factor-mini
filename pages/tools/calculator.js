Page({
  data: {
    price: '',    // 金价
    weight: '',   // 克重
    fee: '',      // 工费
    total: '0.00', // 总价
    average: '0.00' // 平均克价（含工费）
  },

  onLoad(options) {
    // 如果首页传来了价格，自动填入
    if (options.price) {
      this.setData({
        price: options.price
      });
    }
  },

  // 输入监听：金价
  onPriceInput(e) {
    this.setData({ price: e.detail.value });
    this.calculate();
  },

  // 输入监听：克重
  onWeightInput(e) {
    this.setData({ weight: e.detail.value });
    this.calculate();
  },

  // 输入监听：工费
  onFeeInput(e) {
    this.setData({ fee: e.detail.value });
    this.calculate();
  },

  // 核心计算逻辑
  calculate() {
    // 1. 获取数值，如果为空则默认为 0
    const p = parseFloat(this.data.price) || 0;
    const w = parseFloat(this.data.weight) || 0;
    const f = parseFloat(this.data.fee) || 0;

    // 2. 计算总价：(单价 * 克重) + 总工费
    const totalVal = (p * w) + f;

    // 3. 计算平均克价：总价 / 克重
    let avgVal = 0;
    if (w > 0) {
      avgVal = totalVal / w;
    }

    // 4. 更新视图，保留2位小数
    this.setData({
      total: totalVal.toFixed(2),
      average: avgVal.toFixed(2)
    });
  },

  // 重置按钮
  reset() {
    this.setData({
      price: '',
      weight: '',
      fee: '',
      total: '0.00',
      average: '0.00'
    });
  }
});
