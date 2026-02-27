// pages/me/me.js
const cloud = require('../../utils/cloud.js');

const STORAGE_KEY = 'my_2fa_accounts';

Page({
  data: {
    loadingBackup: false,
    loadingRestore: false,
  },

  onLoad() {
    // 确保页面支持右上角和按钮分享（open-type="share"）
    wx.showShareMenu({ withShareTicket: true });
  },

  onShareAppMessage() {
    return {
      title: '一个简单好用的 2FA 工具',
      path: '/pages/token/token',
    };
  },

  async onBackup() {
    if (this.data.loadingBackup || this.data.loadingRestore) return;

    this.setData({ loadingBackup: true });
    try {
      const accounts = wx.getStorageSync(STORAGE_KEY) || [];
      await cloud.backupAccounts(accounts);
      wx.showToast({ title: '备份成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '备份失败', icon: 'none' });
    } finally {
      this.setData({ loadingBackup: false });
    }
  },

  onRestore() {
    if (this.data.loadingBackup || this.data.loadingRestore) return;

    wx.showModal({
      title: '确认恢复',
      content: '恢复会用服务器数据覆盖本地数据，是否继续？',
      confirmColor: '#d93025',
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ loadingRestore: true });
        try {
          const { accounts } = await cloud.restoreAccounts();
          wx.setStorageSync(STORAGE_KEY, accounts);

          wx.showToast({ title: '恢复成功', icon: 'success' });

          // 如果你希望恢复后立刻回首页让它刷新
          // wx.switchTab({ url: '/pages/token/token' });
        } catch (e) {
          wx.showToast({ title: '恢复失败', icon: 'none' });
        } finally {
          this.setData({ loadingRestore: false });
        }
      },
    });
  },
});
