// Minimal wrapper for:
// - POST /api/auth/wechat_login  { code } -> { session_token }
// - POST /api/backup             { accounts }  (Authorization: Bearer token)
// - POST /api/restore            {}            (Authorization: Bearer token)

const TOKEN_KEY = 'cloud_session_token';

// TODO: replace with your HTTPS backend domain, e.g. https://api.example.com
const BASE_URL = 'https://api.yuanquanquan.xyz:8443';

// 常量定义
const TROY_OUNCE_IN_GRAMS = 31.1034768; // 1金衡盎司等于多少克
const USE_HISTORY_MOCK = false; // 先开着，联调真实接口时改成 false


function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token || '');
}

function request(method, path, data, needAuth) {
  return new Promise((resolve, reject) => {
    const header = { 'content-type': 'application/json' };

    if (needAuth) {
      const token = getToken();
      if (token) header.Authorization = `Bearer ${token}`;
    }

    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header,
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(res.data && res.data.error ? res.data.error : `HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}

async function login() {
  const code = await new Promise((resolve, reject) => {
    wx.login({
      timeout: 8000,
      success: (r) => (r.code ? resolve(r.code) : reject(new Error('wx.login: missing code'))),
      fail: reject,
    });
  });

  const data = await request('POST', '/api/auth/wechat_login', { code }, false);
  if (!data || !data.session_token) throw new Error('login failed: missing session_token');
  setToken(data.session_token);
  return data.session_token;
}

async function ensureLogin() {
  const token = getToken();
  if (token) return token;
  return login();
}

async function backupAccounts(accounts) {
  await ensureLogin();
  await request('POST', '/api/backup', { accounts: accounts || [] }, true);
}

async function restoreAccounts() {
  await ensureLogin();
  const data = await request('POST', '/api/restore', {}, true);
  return {
    accounts: Array.isArray(data && data.accounts) ? data.accounts : [],
    updated_at: data && data.updated_at ? data.updated_at : null,
  };
}

async function fetchPrices(assets) {
  const payload = Array.isArray(assets) ? assets : [];
  return request('POST', '/api/prices', payload, false); // 如需鉴权，将 false 改为 true
}


/**
 * 获取并计算黄金价格 (元/克)
 */
async function getGoldPriceInCNY() {
  try {
    // 1. 并发调用两个接口
    // Promise.all 接收一个数组，只有当两个请求都成功时才会继续
    const [goldRes, rateRes] = await Promise.all([
      fetchExternalPrice('XAU'), // 获取国际金价
      fetchExchangeRatesNew()       // 获取汇率
    ]);

    // 2. 提取数据
    // 假设 goldRes.price 是美元/盎司 (USD/oz)
    const goldPriceUSD = goldRes.price;

    // 获取 1 CNY 兑换多少 USD
    // 你的汇率接口 base_code 是 CNY，所以 conversion_rates.USD 代表 1元人民币 = 多少美元
    const usdRate = rateRes.rates.USD;

    if (!usdRate) {
      throw new Error('未找到美元汇率数据');
    }

    // 3. 计算逻辑
    // 第一步：将美元金价换算成人民币金价 (元/盎司)
    // 公式：美元价格 / (1人民币兑美元汇率)
    // 例如：金价2000美元，汇率0.14(即1元=0.14美元) -> 2000 / 0.14 = 14285.7 元/盎司
    const goldPriceCNYPerOz = goldPriceUSD / usdRate;

    // 第二步：将盎司换算成克 (元/克)
    const goldPriceCNYPerGram = goldPriceCNYPerOz / TROY_OUNCE_IN_GRAMS;

    // 4. 返回结果 (保留2位小数)
    return {
      rawPriceUSD: goldPriceUSD,      // 原始美元金价
      rateCNYtoUSD: usdRate,          // 汇率
      priceCNY: parseFloat(goldPriceCNYPerGram.toFixed(2)), // 最终价格：元/克
      updateTime: new Date().toLocaleString()
    };

  } catch (error) {
    console.error('获取金价失败:', error);
    throw error; // 抛出错误供调用方处理
  }
}

// 新增：获取外部金价/银价 API
// symbol 例如: "XAG", "XAU"
async function fetchExternalPrice(symbol) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://api.gold-api.com/price/${symbol}`, // 直接使用完整 URL
      method: 'GET',
      header: { 'content-type': 'application/json' },
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}

// [新增] 获取昨日收盘价 (OHLC)
// 传入当前时间戳，后端返回对应的收盘数据
async function fetchOHLC(timestamp) {
  // wx.request 的 GET 请求中，data 会自动拼接为 URL 参数
  // 即: /api/ohlc?timestamp=xxx
  return request('GET', '/api/ohlc', { timestamp: timestamp }, false);
}


// 新增：获取国内十大金店价格 (每日金价)
// URL: https://api.lolimi.cn/API/huangj/api.php
async function fetchDomesticGoldPrices() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://api.lolimi.cn/API/huangj/api.php',
      method: 'GET',
      header: { 'content-type': 'application/json' },
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}

// 新增：获取首页 UI 配置
async function fetchUIConfig() {
  // 返回结构：
  // {
  //   banner: true,
  //   brandPrices: true,
  //   tools: [{..., show: true/false}, ...]
  // }
  const data = await request('GET', '/api/ui-config', {}, false);

  const safeTools = Array.isArray(data?.tools) ? data.tools : [];

  return {
    banner: typeof data?.banner === 'boolean' ? data.banner : true,
    brandPrices: typeof data?.brandPrices === 'boolean' ? data.brandPrices : true,
    tools: safeTools.filter(item => item && item.show !== false),
  };
}


// 新增：获取国内上海现货黄金T+D价格
// URL: https://api.freejk.com/shuju/jinjia/
async function fetchShanghaiGoldPrice() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://api.freejk.com/shuju/jinjia/',
      method: 'GET',
      header: { 'content-type': 'application/json' },
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}

async function fetchExchangeRates(base = 'CNY') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://v6.exchangerate-api.com/v6/353b7bd3ed66da178b3923c1/latest/${base}`,
      method: 'GET',
      header: { 'content-type': 'application/json' },
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}

async function fetchExchangeRatesNew(base = 'CNY') {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `https://api.exchangerate-api.com/v4/latest/${base}`,
      method: 'GET',
      header: { 'content-type': 'application/json' },
      timeout: 8000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (ok) return resolve(res.data);
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err),
    });
  });
}


function makeMockHistory(symbol, period) {
  const isYear = period === '1y';
  const count = isYear ? 12 : 90;
  const oneDaySec = 24 * 60 * 60;
  const now = new Date();
  const list = [];

  // 给不同品种一个基准价
  const baseMap = {
    XAU: 5100,
    XAG: 620,
    HG: 78,
  };
  const base = baseMap[symbol] || 1000;

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() - (count - 1 - i) * oneDaySec * 1000);

    // 1年模式按“月”聚合：每30天取一个点
    if (isYear && i % 8 !== 0 && i !== count - 1) continue;

    // 生成趋势+波动
    const trend = i * (symbol === 'XAU' ? 1.6 : symbol === 'XAG' ? 0.25 : 0.03);
    const wave = Math.sin(i / 4) * (symbol === 'XAU' ? 120 : symbol === 'XAG' ? 20 : 3);
    const noise = (Math.random() - 0.5) * (symbol === 'XAU' ? 35 : symbol === 'XAG' ? 8 : 1);
    const price = (base + trend + wave + noise).toFixed(6);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    list.push({
      avg_price: price,
      day: `${yyyy}-${mm}-${dd} 00:00:00`,
    });
  }

  return list.reverse(); // 模拟你接口“最近在前”
}

// 历史走势（支持 mock）
async function fetchHistoryPrices(symbol = 'XAU', period = '3m') {
  const nowSec = Math.floor(Date.now() / 1000);

  if (USE_HISTORY_MOCK) {
    const groupBy = period === '1y' ? 'month' : 'day';
    const list = makeMockHistory(symbol, period).map((it) => ({
      day: it.day,
      avg_price: Number(it.avg_price),
    }));
    return Promise.resolve({
      symbol,
      period,
      groupBy,
      startTimestamp: 0,
      endTimestamp: nowSec,
      list,
    });
  }

  // 真实接口逻辑（保留）
  let startTimestamp = nowSec;
  let groupBy = 'day';
  if (period === '1y') {
    startTimestamp = nowSec - 365 * 24 * 60 * 60;
    groupBy = 'month';
  } else {
    startTimestamp = nowSec - 90 * 24 * 60 * 60;
    groupBy = 'day';
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://api.yuanquanquan.xyz:8443/api/history',
      method: 'GET',
      timeout: 10000,
      header: { 'content-type': 'application/json' },
      data: {
        symbol,
        startTimestamp,
        endTimestamp: nowSec,
        groupBy,
      },
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (!ok) return reject(new Error(`HTTP ${res.statusCode}`));

        const raw = Array.isArray(res.data) ? res.data : [];
        const list = raw
          .map((it) => ({
            day: it.day,
            avg_price: Number(it.avg_price),
          }))
          .filter((it) => it.day && Number.isFinite(it.avg_price));

        resolve({
          symbol,
          period,
          groupBy,
          startTimestamp,
          endTimestamp: nowSec,
          list,
        });
      },
      fail: reject,
    });
  });
}





module.exports = {
  backupAccounts,
  restoreAccounts,
  ensureLogin,
  fetchPrices,
  fetchExternalPrice,
  fetchDomesticGoldPrices,
  fetchShanghaiGoldPrice,
  fetchExchangeRates,
  fetchExchangeRatesNew,
  getGoldPriceInCNY,
  fetchOHLC,
  fetchHistoryPrices,
  fetchUIConfig,
};
