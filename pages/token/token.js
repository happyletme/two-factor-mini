const totp = require('../../utils/totp.js');

// 定义卡片高度常量 (rpx)，需要与 WXSS 中的 .card 高度 + margin-bottom 保持一致
// .card height(160) + padding(40*2=80) + margin(30) = 270rpx?
// 为了精确控制，我们在 CSS 中将卡片设为固定总高度。
// 假设 CSS 中设置卡片占用空间为 220rpx (包含 margin)
const CARD_HEIGHT_RPX = 220;

Page({
  data: {
    accounts: [],
    remaining: 30,
    timer: null,

    // --- 拖拽相关数据 ---
    isDragging: false,    // 是否正在拖拽
    draggingIndex: -1,    // 当前被拖拽的索引
    draggingAccount: null,// 被拖拽的数据副本（用于显示影子）
    ghostY: 0,            // 影子元素的垂直位置 (px)
    scrollTop: 0,         // 页面滚动距离
    listTop: 0,           // 列表距离顶部的距离 (px)
    itemHeightPx: 0,      // 卡片高度 (px)
  },

  onLoad: function() {
    // 计算 1rpx 对应的 px 值，并计算卡片高度
    const systemInfo = wx.getSystemInfoSync();
    const pxRate = systemInfo.windowWidth / 750;
    this.setData({
      itemHeightPx: CARD_HEIGHT_RPX * pxRate
    });
  },

  onShow: function () {
    this.loadAccounts();
    this.startTimer();

    // 获取列表距离顶部的距离，用于校准拖拽坐标
    const query = wx.createSelectorQuery();
    query.select('.list').boundingClientRect(rect => {
      if (rect) {
        this.setData({ listTop: rect.top });
      }
    }).exec();
  },

  onHide: function () {
    this.stopTimer();
  },

  // 监听滚动，用于修正拖拽坐标
  onScroll: function(e) {
    this.setData({ scrollTop: e.detail.scrollTop });
  },

  loadAccounts: function () {
    const accounts = wx.getStorageSync('my_2fa_accounts') || [];
    this.updateCodes(accounts);
  },

  updateCodes: function (accountsList) {
    const accounts = accountsList || this.data.accounts;
    const updatedAccounts = accounts.map(acc => {
      const cleanSecret = acc.secret.replace(/\s+/g, '').toUpperCase();
      return {
        ...acc,
        code: totp.getCode(cleanSecret)
      };
    });

    this.setData({
      accounts: updatedAccounts,
      remaining: totp.getRemainingSeconds()
    });
  },

  startTimer: function () {
    this.stopTimer();
    this.updateCodes();

    this.data.timer = setInterval(() => {
      const rem = totp.getRemainingSeconds();
      this.setData({ remaining: rem });
      if (rem === 30) {
        this.updateCodes();
      }
    }, 1000);
  },

  stopTimer: function () {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/add/add' });
  },
  goToMe: function () {
    wx.navigateTo({ url: '/pages/me/me' });
  },

  copyCode: function(e) {
    // 如果正在拖拽，禁止触发点击复制
    if (this.data.isDragging) return;

    const code = e.currentTarget.dataset.code;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // --- 拖拽逻辑 ---

  // 1. 长按开始拖拽
  onLongPress: function(e) {
    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];

    // 震动反馈
    wx.vibrateShort({ type: 'medium' });

    this.setData({
      isDragging: true,
      draggingIndex: index,
      draggingAccount: this.data.accounts[index],
      // 初始影子位置：手指位置 - 半个卡片高度 (让手指在卡片中间)
      ghostY: touch.clientY - (this.data.itemHeightPx / 2)
    });
  },

  // 2. 手指移动
  onTouchMove: function(e) {
    if (!this.data.isDragging) return;

    const touch = e.touches[0];
    const { itemHeightPx, listTop, scrollTop, accounts, draggingIndex } = this.data;

    // 更新影子位置
    this.setData({
      ghostY: touch.clientY - (itemHeightPx / 2)
    });

    // 计算当前手指所在的列表索引
    // 绝对Y = 手指屏幕Y + 滚动条Y - 列表顶部偏移
    const absoluteY = touch.clientY + scrollTop - listTop;
    let targetIndex = Math.floor(absoluteY / itemHeightPx);

    // 边界限制
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= accounts.length) targetIndex = accounts.length - 1;

    // 如果索引发生变化，交换数组
    if (targetIndex !== draggingIndex) {
      const newAccounts = [...accounts];
      // 移动元素：删除旧位置，插入新位置
      const [movedItem] = newAccounts.splice(draggingIndex, 1);
      newAccounts.splice(targetIndex, 0, movedItem);

      this.setData({
        accounts: newAccounts,
        draggingIndex: targetIndex
      });

      // 交换时轻微震动
      wx.vibrateShort({ type: 'light' });
    }
  },

  // 3. 拖拽结束
  onTouchEnd: function() {
    if (!this.data.isDragging) return;

    this.setData({
      isDragging: false,
      draggingIndex: -1,
      draggingAccount: null
    });

    // 保存新顺序到缓存
    wx.setStorageSync('my_2fa_accounts', this.data.accounts);
  },

  // --- 菜单功能 (替代原来的长按) ---

  showMenu: function(e) {
    // 阻止冒泡，防止触发复制
    const index = e.currentTarget.dataset.index;

    wx.showActionSheet({
      itemList: ['编辑账号', '删除账号'],
      itemColor: "#333333",
      success: (res) => {
        if (res.tapIndex === 0) {
          this.goToEdit(index);
        } else if (res.tapIndex === 1) {
          this.deleteAccount(index);
        }
      }
    });
  },

  deleteAccount: function(index) {
    const account = this.data.accounts[index];
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${account.issuer || ''} (${account.account}) 吗？`,
      confirmColor: '#FF0000',
      success: (res) => {
        if (res.confirm) {
          let accounts = this.data.accounts; // 使用当前 data 中的顺序
          accounts.splice(index, 1);
          wx.setStorageSync('my_2fa_accounts', accounts);
          this.updateCodes(accounts);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  goToEdit: function(index) {
    const item = this.data.accounts[index];
    const url = `/pages/add/add?isEdit=true&index=${index}&issuer=${encodeURIComponent(item.issuer)}&account=${encodeURIComponent(item.account)}&secret=${encodeURIComponent(item.secret)}`;
    wx.navigateTo({ url: url });
  },

  /**
   * 用户点击右上角分享给朋友
   */
  onShareAppMessage: function () {
    return {
      title: '安全令牌 - 简单好用的二次验证器', // 分享标题
      path: '/pages/token/token',            // 别人点击后进入的页面
      imageUrl: ''                           // 自定义图片路径，不填则默认截取当前页面
    };
  },

  /**
   * 用户点击右上角分享到朋友圈
   */
  onShareTimeline: function () {
    return {
      title: '安全令牌 - 保护您的账号安全',     // 朋友圈标题
      query: '',                             // 朋友圈参数，首页通常不需要
      imageUrl: ''                           // 自定义图片
    };
  }


});
