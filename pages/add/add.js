// pages/add/add.js
Page({
  data: {
    name: '',
    secret: '',
    isEdit: false, // 是否为编辑模式
    editIndex: -1  // 编辑的数组索引
  },

  onLoad: function (options) {
    // 接收参数，判断是否为编辑模式
    if (options.isEdit) {
      // 解码参数
      const account = decodeURIComponent(options.account || '');
      const issuer = decodeURIComponent(options.issuer || '');
      const secret = decodeURIComponent(options.secret || '');

      // 组合显示名称 (如果 issuer 存在，拼成 "Issuer: Account" 格式，方便用户编辑)
      let displayName = account;
      if (issuer && issuer !== 'undefined' && !account.includes(issuer)) {
        displayName = `${issuer}:${account}`;
      }

      this.setData({
        isEdit: true,
        editIndex: parseInt(options.index),
        name: displayName,
        secret: secret
      });

      // 动态设置标题
      wx.setNavigationBarTitle({ title: '编辑账号' });
    }
  },

  bindNameInput: function(e) {
    this.setData({ name: e.detail.value });
  },

  bindSecretInput: function(e) {
    this.setData({ secret: e.detail.value });
  },

  // --- 扫码功能 (保持不变) ---
  scanCode: function() {
    wx.scanCode({
      success: (res) => {
        console.log('扫码结果:', res.result);
        this.parseOtpUrl(res.result);
      },
      fail: (err) => {
        console.log('扫码失败', err);
      }
    });
  },

  // 解析 otpauth:// (保持不变)
  parseOtpUrl: function(url) {
    if (!url || !url.startsWith('otpauth://totp/')) {
      wx.showToast({ title: '非标准TOTP二维码', icon: 'none' });
      return;
    }
    try {
      const queryString = url.split('?')[1];
      if (!queryString) throw new Error('无参数');

      const params = {};
      const pairs = queryString.split('&');
      pairs.forEach(pair => {
        const [key, val] = pair.split('=');
        if (key && val) {
          params[key] = decodeURIComponent(val);
        }
      });

      if (!params.secret) {
        wx.showToast({ title: '二维码缺少密钥', icon: 'none' });
        return;
      }

      let label = url.split('?')[0].replace('otpauth://totp/', '');
      label = decodeURIComponent(label);
      let accountName = label;

      if (params.issuer && !accountName.includes(params.issuer)) {
        accountName = params.issuer + ':' + accountName;
      }

      this.setData({
        secret: params.secret,
        name: accountName
      });
      wx.showToast({ title: '解析成功', icon: 'success' });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '解析出错', icon: 'none' });
    }
  },

  // --- 核心：保存逻辑 (已修改) ---
  saveAccount: function() {
    const name = this.data.name.trim();
    const secret = this.data.secret.replace(/\s+/g, '').toUpperCase(); // 清理密钥格式

    if (!name || !secret) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }

    // 获取现有账号
    let accounts = wx.getStorageSync('my_2fa_accounts') || [];

    // 查重逻辑
    // 如果是新增：检查所有是否存在
    // 如果是编辑：检查除了当前编辑项之外，是否存在重复 (防止改了名字没改密钥时报错)
    const exists = accounts.some((acc, idx) => {
      if (this.data.isEdit && idx === this.data.editIndex) return false; // 跳过自己
      return acc.secret === secret;
    });

    if (exists) {
      wx.showToast({ title: '该密钥已存在', icon: 'none' });
      return;
    }

    // 尝试从 name 中分离 issuer 和 account (例如 "Google:alice@gmail.com")
    let finalIssuer = '';
    let finalAccount = name;

    if (name.includes(':')) {
      const parts = name.split(':');
      if (parts.length >= 2) {
        finalIssuer = parts[0].trim();
        finalAccount = parts.slice(1).join(':').trim();
      }
    }

    const accountData = {
      issuer: finalIssuer,
      account: finalAccount,
      secret: secret
    };

    if (this.data.isEdit) {
      // --- 编辑模式：更新指定索引 ---
      accounts[this.data.editIndex] = accountData;
    } else {
      // --- 新增模式：追加 ---
      accounts.push(accountData);
    }

    // 保存到本地存储
    wx.setStorageSync('my_2fa_accounts', accounts);

    wx.showToast({ title: '保存成功', icon: 'success' });

    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  }
});
