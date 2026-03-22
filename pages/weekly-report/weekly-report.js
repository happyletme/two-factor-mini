const cloud = require('../../utils/cloud.js');

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const WEEKLY_REPORT_PATH = '/pages/weekly-report/weekly-report';
const RANDOM_TOOL_TITLE = '随机数工具';

function normalizeSignedIntegerInput(value) {
  const raw = String(value || '').replace(/[^\d-]/g, '');
  if (!raw) return '';
  if (raw === '-') return '-';

  const negative = raw.startsWith('-');
  const digits = raw.replace(/-/g, '');
  if (!digits) return negative ? '-' : '';
  return `${negative ? '-' : ''}${digits}`;
}

function normalizePositiveIntegerInput(value) {
  return String(value || '').replace(/\D/g, '');
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildWeeklyShareTitle(latestReport) {
  if (latestReport && latestReport.title) {
    return `${latestReport.title}｜黄金分析周报`;
  }

  return '黄金分析周报｜每周查看最新黄金市场分析';
}

Page({
  data: {
    uiConfig: {
      banner: false,
    },
    configLoaded: false,

    randomMin: '1',
    randomMax: '100',
    randomCount: '1',
    randomUnique: false,
    randomResults: [],
    randomSummary: '',
    randomError: '',

    loading: true,
    saving: false,
    email: '',
    enabled: false,
    latestReport: null,
    reports: [],
    subscriptionMeta: {
      lastSentAt: '',
      lastOpenedAt: '',
      updatedAt: '',
    },
  },

  onInputRandomField(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;

    const value = e.detail.value;
    let nextValue = value;

    if (field === 'randomCount') {
      nextValue = normalizePositiveIntegerInput(value);
    } else {
      nextValue = normalizeSignedIntegerInput(value);
    }

    this.setData({
      [field]: nextValue,
      randomError: '',
    });
  },

  onToggleRandomUnique(e) {
    const unique = e.currentTarget.dataset.unique === 'true';
    this.setData({
      randomUnique: unique,
      randomError: '',
    });
  },

  onGenerateRandomNumbers() {
    const min = Number(this.data.randomMin);
    const max = Number(this.data.randomMax);
    const count = Number(this.data.randomCount);
    const unique = !!this.data.randomUnique;

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(count)) {
      this.setData({ randomError: '请先填写完整参数' });
      return;
    }
    if (!Number.isInteger(min) || !Number.isInteger(max) || !Number.isInteger(count)) {
      this.setData({ randomError: '请输入整数参数' });
      return;
    }
    if (count <= 0) {
      this.setData({ randomError: '生成个数需大于 0' });
      return;
    }

    const normalizedMin = Math.min(min, max);
    const normalizedMax = Math.max(min, max);
    const range = normalizedMax - normalizedMin + 1;
    if (unique && count > range) {
      this.setData({ randomError: `不重复模式下最多只能生成 ${range} 个` });
      return;
    }

    let randomResults = [];
    if (unique) {
      if (range <= 50000) {
        const pool = Array.from({ length: range }, (_, index) => normalizedMin + index);
        for (let i = pool.length - 1; i > pool.length - 1 - count; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        randomResults = pool.slice(pool.length - count);
      } else {
        const set = new Set();
        while (set.size < count) {
          set.add(randomIntInclusive(normalizedMin, normalizedMax));
        }
        randomResults = Array.from(set);
      }
    } else {
      randomResults = Array.from(
        { length: count },
        () => randomIntInclusive(normalizedMin, normalizedMax)
      );
    }

    this.setData({
      randomMin: String(normalizedMin),
      randomMax: String(normalizedMax),
      randomResults,
      randomSummary: `共 ${count} 个 · 区间 ${normalizedMin} ~ ${normalizedMax}${unique ? ' · 不重复' : ' · 可重复'}`,
      randomError: '',
    });
  },

  onResetRandomTool() {
    this.setData({
      randomMin: '1',
      randomMax: '100',
      randomCount: '1',
      randomUnique: false,
      randomResults: [],
      randomSummary: '',
      randomError: '',
    });
  },

  onCopyRandomResult() {
    if (!this.data.randomResults.length) return;
    wx.setClipboardData({
      data: this.data.randomResults.join(', '),
      success: () => {
        wx.showToast({ title: '结果已复制', icon: 'success' });
      },
    });
  },

  onLoad() {
    this.enableShareMenu();
    this.initPage();
  },

  async initPage() {
    try {
      const cfg = await cloud.fetchUIConfig();
      const banner = !!(cfg && cfg.banner);
      this.setData({
        uiConfig: { banner },
        configLoaded: true,
      });

      if (banner) {
        this.loadDashboard();
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      this.setData({
        uiConfig: { banner: false },
        configLoaded: true,
        loading: false,
      });
    }
  },

  enableShareMenu() {
    if (typeof wx.showShareMenu !== 'function') return;

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  async onPullDownRefresh() {
    if (!this.data.uiConfig.banner) {
      wx.stopPullDownRefresh();
      return;
    }

    await this.loadDashboard();
  },

  formatDateTime(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const normalized = value.trim();
      const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
      }
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  },

  isSameReport(report, latestReport) {
    if (!report || !latestReport) return false;

    if (report.id && latestReport.id) {
      return report.id === latestReport.id;
    }

    if (report.web_url && latestReport.web_url) {
      return report.web_url === latestReport.web_url;
    }

    if (report.week_label && latestReport.week_label) {
      return report.week_label === latestReport.week_label;
    }

    return !!report.title && !!latestReport.title && report.title === latestReport.title;
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const data = await cloud.fetchGoldWeeklyDashboard();
      const subscription = data.subscription || {};
      const latestReport = data.latest_report || null;
      const reports = (Array.isArray(data.reports) ? data.reports : [])
        .filter(report => !this.isSameReport(report, latestReport));

      this.setData({
        email: subscription.email || '',
        enabled: !!subscription.enabled,
        latestReport,
        reports,
        subscriptionMeta: {
          lastSentAt: this.formatDateTime(subscription.last_sent_at),
          lastOpenedAt: this.formatDateTime(subscription.last_opened_at),
          updatedAt: this.formatDateTime(subscription.updated_at),
        },
      });
    } catch (err) {
      wx.showToast({ title: '加载周报失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onInputEmail(e) {
    this.setData({ email: (e.detail.value || '').trim() });
  },

  async onSubscribe() {
    const email = (this.data.email || '').trim();
    if (!EMAIL_RE.test(email)) {
      wx.showToast({ title: '请输入正确邮箱', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      const subscription = await cloud.saveGoldWeeklySubscription({
        email,
        enabled: true,
      });

      this.setData({
        enabled: !!(subscription && subscription.enabled),
        subscriptionMeta: {
          lastSentAt: this.formatDateTime(subscription && subscription.last_sent_at),
          lastOpenedAt: this.formatDateTime(subscription && subscription.last_opened_at),
          updatedAt: this.formatDateTime(subscription && subscription.updated_at),
        },
      });
      wx.showToast({ title: '订阅已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onPause() {
    const email = (this.data.email || '').trim();
    if (!email) {
      wx.showToast({ title: '请先填写邮箱', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      const subscription = await cloud.saveGoldWeeklySubscription({
        email,
        enabled: false,
      });

      this.setData({
        enabled: !!(subscription && subscription.enabled),
        subscriptionMeta: {
          lastSentAt: this.formatDateTime(subscription && subscription.last_sent_at),
          lastOpenedAt: this.formatDateTime(subscription && subscription.last_opened_at),
          updatedAt: this.formatDateTime(subscription && subscription.updated_at),
        },
      });
      wx.showToast({ title: '已暂停推送', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  openReport(url, title) {
    if (!url) {
      wx.showToast({ title: '暂无可查看周报', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '黄金周报')}`,
    });
  },

  onOpenLatest() {
    const report = this.data.latestReport;
    this.openReport(report && report.web_url, report && report.title);
  },

  onOpenReport(e) {
    const { url, title } = e.currentTarget.dataset;
    this.openReport(url, title);
  },

  onShareAppMessage() {
    if (!this.data.uiConfig.banner) {
      return {
        title: RANDOM_TOOL_TITLE,
        path: WEEKLY_REPORT_PATH,
      };
    }

    return {
      title: buildWeeklyShareTitle(this.data.latestReport),
      path: WEEKLY_REPORT_PATH,
    };
  },

  onShareTimeline() {
    if (!this.data.uiConfig.banner) {
      return {
        title: RANDOM_TOOL_TITLE,
        query: '',
      };
    }

    return {
      title: buildWeeklyShareTitle(this.data.latestReport),
      query: '',
    };
  },
});
