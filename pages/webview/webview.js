const cloud = require('../../utils/cloud.js');
const WEEKLY_REPORT_PATH = '/pages/weekly-report/weekly-report';
const BMI_TOOL_PATH = '/pages/webview/webview';
const BMI_TOOL_TITLE = 'BMI体重计算器';

function buildEmptyBmiResult() {
  return {
    hasResult: false,
    bmiValue: '--',
    category: '--',
    categoryColor: '#6b7280',
    healthyWeightRange: '--',
    idealWeight: '--',
    weightTip: '--',
    advice: '--',
  };
}

function normalizeDecimalInput(value, decimalPlaces = 1) {
  const sanitized = String(value || '').replace(/[^\d.]/g, '');
  if (!sanitized) return '';

  const firstDotIndex = sanitized.indexOf('.');
  if (firstDotIndex === -1) return sanitized;

  const intPart = sanitized.slice(0, firstDotIndex);
  const decimalPart = sanitized.slice(firstDotIndex + 1).replace(/\./g, '').slice(0, decimalPlaces);
  return decimalPart ? `${intPart}.${decimalPart}` : `${intPart}.`;
}

function classifyBmi(value) {
  if (value < 18.5) {
    return {
      category: '偏瘦',
      categoryColor: '#2563eb',
      advice: '建议适当增加优质蛋白和力量训练，稳步提升体重。',
    };
  }
  if (value < 24) {
    return {
      category: '正常',
      categoryColor: '#16a34a',
      advice: '当前体重处于健康区间，保持规律饮食与运动即可。',
    };
  }
  if (value < 28) {
    return {
      category: '超重',
      categoryColor: '#ea580c',
      advice: '建议控制总热量摄入并提升有氧运动频率。',
    };
  }
  return {
    category: '肥胖',
    categoryColor: '#dc2626',
    advice: '建议尽快进行体重管理，必要时寻求专业医生指导。',
  };
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function getBodyHtml(html) {
  const match = String(html || '').match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : String(html || '')).trim();
}

function safeDecode(value, fallback = '') {
  if (!value) return fallback;

  try {
    return decodeURIComponent(value);
  } catch (err) {
    return String(value);
  }
}

function buildReportSharePath(url, title) {
  if (!url) return WEEKLY_REPORT_PATH;

  return `/pages/webview/webview?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '黄金周报')}`;
}

function buildReportShareTitle(title) {
  if (title && title !== '周报详情') {
    return `${title}｜黄金分析周报`;
  }

  return '黄金分析周报｜查看本期周报详情';
}

function unwrapTrackedLink(url) {
  if (!url) return '';

  const targetMatch = String(url).match(/[?&]target=([^&]+)/);
  if (!targetMatch) return String(url);

  try {
    return decodeURIComponent(targetMatch[1]);
  } catch (err) {
    return String(url);
  }
}

function getHost(url) {
  const match = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1] : '';
}

function extractSourceLinks(bodyHtml) {
  const links = [];
  const seen = new Set();
  const regex = /<a\b[^>]*href=(['"])([^'"]+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match = regex.exec(bodyHtml);

  while (match) {
    const url = unwrapTrackedLink(match[2]);
    const label = stripTags(match[3]) || url;

    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({
        label,
        url,
        host: getHost(url),
      });
    }

    match = regex.exec(bodyHtml);
  }

  return links;
}

function sanitizeReportHtml(html) {
  let bodyHtml = getBodyHtml(html);

  bodyHtml = bodyHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(?:target|rel)=['"][^'"]*['"]/gi, '');

  // rich-text does not provide a reliable external-link experience in this page.
  // Keep the content readable and surface direct source URLs separately below.
  bodyHtml = bodyHtml.replace(
    /<a\b[^>]*>([\s\S]*?)<\/a>/gi,
    '<span style="color:#0f4c81;text-decoration:underline;">$1</span>'
  );

  return bodyHtml.trim();
}

Page({
  data: {
    uiConfig: {
      banner: false,
    },
    configLoaded: false,

    bmiHeightCm: '170',
    bmiWeightKg: '65',
    bmiResult: buildEmptyBmiResult(),

    url: '',
    title: '周报详情',
    loading: true,
    error: '',
    contentHtml: '',
    sourceLinks: [],
  },

  onLoad(options) {
    const url = safeDecode(options && options.url, '');
    const title = safeDecode(options && options.title, '周报详情');

    this.enableShareMenu();

    if (title) {
      wx.setNavigationBarTitle({ title });
    }

    this.setData({ url, title });
    this.initPage();
  },

  async initPage() {
    try {
      const cfg = await cloud.fetchUIConfig();
      const banner = !!(cfg && cfg.banner);
      this.setData(
        {
          uiConfig: { banner },
          configLoaded: true,
        },
        () => {
          if (banner) {
            this.loadReport();
          } else {
            if (typeof wx.setNavigationBarTitle === 'function') {
              wx.setNavigationBarTitle({ title: BMI_TOOL_TITLE });
            }
            this.setData({ loading: false });
            this.calculateBmi();
          }
        }
      );
    } catch (err) {
      this.setData({
        uiConfig: { banner: false },
        configLoaded: true,
        loading: false,
      });
      if (typeof wx.setNavigationBarTitle === 'function') {
        wx.setNavigationBarTitle({ title: BMI_TOOL_TITLE });
      }
      this.calculateBmi();
    }
  },

  enableShareMenu() {
    if (typeof wx.showShareMenu !== 'function') return;

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  async loadReport() {
    if (!this.data.uiConfig.banner) return;

    if (!this.data.url) {
      this.setData({
        loading: false,
        error: '缺少周报地址',
      });
      return;
    }

    this.setData({
      loading: true,
      error: '',
    });

    try {
      const html = await cloud.fetchGoldWeeklyReportHtml(this.data.url);
      const bodyHtml = getBodyHtml(html);

      if (!bodyHtml) {
        throw new Error('empty report html');
      }

      this.setData({
        contentHtml: sanitizeReportHtml(html),
        sourceLinks: extractSourceLinks(bodyHtml),
      });
    } catch (err) {
      this.setData({
        error: '周报加载失败，请稍后重试',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    if (!this.data.uiConfig.banner) return;
    this.loadReport();
  },

  onInputBmiField(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const value = normalizeDecimalInput(e.detail.value, 1);
    this.setData({ [field]: value }, () => this.calculateBmi());
  },

  onResetBmi() {
    this.setData({
      bmiHeightCm: '170',
      bmiWeightKg: '65',
      bmiResult: buildEmptyBmiResult(),
    }, () => this.calculateBmi());
  },

  calculateBmi() {
    const heightCm = Number(this.data.bmiHeightCm);
    const weightKg = Number(this.data.bmiWeightKg);

    if (
      !Number.isFinite(heightCm) ||
      !Number.isFinite(weightKg) ||
      heightCm <= 0 ||
      weightKg <= 0
    ) {
      this.setData({ bmiResult: buildEmptyBmiResult() });
      return;
    }

    const heightM = heightCm / 100;
    if (heightM <= 0) {
      this.setData({ bmiResult: buildEmptyBmiResult() });
      return;
    }

    const bmiValue = weightKg / (heightM * heightM);
    const healthyMin = 18.5 * heightM * heightM;
    const healthyMax = 23.9 * heightM * heightM;
    const idealWeight = 22 * heightM * heightM;
    const level = classifyBmi(bmiValue);

    let weightTip = '体重在健康范围内';
    if (weightKg < healthyMin) {
      weightTip = `建议增重约 ${(healthyMin - weightKg).toFixed(1)} kg`;
    } else if (weightKg > healthyMax) {
      weightTip = `建议减重约 ${(weightKg - healthyMax).toFixed(1)} kg`;
    }

    this.setData({
      bmiResult: {
        hasResult: true,
        bmiValue: bmiValue.toFixed(1),
        category: level.category,
        categoryColor: level.categoryColor,
        healthyWeightRange: `${healthyMin.toFixed(1)} ~ ${healthyMax.toFixed(1)} kg`,
        idealWeight: `${idealWeight.toFixed(1)} kg`,
        weightTip,
        advice: level.advice,
      },
    });
  },

  onCopySourceLink(e) {
    const { url } = e.currentTarget.dataset || {};
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success',
        });
      },
    });
  },

  onShareAppMessage() {
    if (!this.data.uiConfig.banner) {
      return {
        title: BMI_TOOL_TITLE,
        path: BMI_TOOL_PATH,
      };
    }

    return {
      title: buildReportShareTitle(this.data.title),
      path: buildReportSharePath(this.data.url, this.data.title),
    };
  },

  onShareTimeline() {
    if (!this.data.uiConfig.banner) {
      return {
        title: BMI_TOOL_TITLE,
        query: '',
      };
    }

    return {
      title: buildReportShareTitle(this.data.title),
      query: this.data.url
        ? `url=${encodeURIComponent(this.data.url)}&title=${encodeURIComponent(this.data.title || '黄金周报')}`
        : '',
    };
  },
});
