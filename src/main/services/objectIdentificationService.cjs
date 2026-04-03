const path = require('path');

const BUSINESS_WHITELIST = ['运营', '产品', '客户', '调研', '财务', '学习', '项目', '设计'];
const STRONG_PRIORITY_SCENES = new Set(['简历', '合同', '发票', 'PRD', '会议纪要']);

const BUSINESS_KEYWORDS = {
  '运营': ['运营', '数据', '报表', '日报', '周报', '月报', '投放', '转化', 'roi', 'dau', '留存', '增长', '流量', '营销'],
  '产品': ['产品', '需求', 'prd', '原型', '方案', '功能', '用户', '体验', '交互', '流程', 'roadmap'],
  '客户': ['客户', '合同', '协议', '报价', '订单', '商务', '销售', '合作', '甲方', '供应商'],
  '调研': ['调研', '报告', '竞品', '市场', '研究', '访谈', '问卷', '趋势', '洞察'],
  '财务': ['财务', '发票', '报销', '预算', '对账', '付款', '收款', '税务', '成本', '费用'],
  '学习': ['学习', '笔记', '教程', '课程', '培训', '资料', '知识', '技能', '读书'],
  '项目': ['项目', '计划', '进度', '里程碑', '交付', '验收', '启动', '结项', '管理', 'pm'],
  '设计': ['设计', '素材', '图片', 'ui', '视觉', '品牌', 'logo', '海报', 'banner', '配色', '字体'],
};

function safeResolve(targetPath) {
  return path.resolve(String(targetPath || ''));
}

function isPathProtected(sourcePath, protectedPaths) {
  const normalized = safeResolve(sourcePath);
  return protectedPaths.some((protectedPath) => {
    const base = safeResolve(protectedPath);
    return normalized === base || normalized.startsWith(`${base}${path.sep}`);
  });
}

function scoreBusinessByName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  let bestCategory = null;
  let bestScore = 0;
  let bestKeywords = [];

  for (const category of BUSINESS_WHITELIST) {
    const keywords = BUSINESS_KEYWORDS[category] || [];
    const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length <= 0) continue;
    const score = Math.min(1, matched.length / 4);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
      bestKeywords = matched.slice(0, 8);
    }
  }

  return {
    category: bestCategory,
    score: Number(bestScore.toFixed(4)),
    matchedKeywords: bestKeywords,
  };
}

function identifyFileObject({ file, sceneDecision, protectedPathSet }) {
  if (isPathProtected(file.sourcePath, protectedPathSet)) {
    return {
      fileId: file.fileId,
      objectType: 'protected_object',
      objectConfidence: 1,
      objectEvidence: {
        source: 'protection',
        signals: ['project_protected_path'],
        primaryReason: '命中项目保护路径',
      },
      businessSignal: { category: null, score: 0, matchedKeywords: [] },
      downgradeReason: null,
    };
  }

  if (sceneDecision?.sceneCategory) {
    const isStrongPriorityScene = STRONG_PRIORITY_SCENES.has(sceneDecision.sceneCategory);
    return {
      fileId: file.fileId,
      objectType: 'scenario_object',
      objectConfidence: Number(
        (isStrongPriorityScene
          ? Math.max(sceneDecision.sceneConfidence || 0.5, 0.72)
          : (sceneDecision.sceneConfidence || 0.5)).toFixed(4)
      ),
      objectEvidence: {
        source: 'scene',
        signals: sceneDecision.sceneEvidence?.signals || [sceneDecision.sceneCategory],
        primaryReason: isStrongPriorityScene
          ? `强场景优先命中 ${sceneDecision.sceneCategory}`
          : `场景命中 ${sceneDecision.sceneCategory}`,
      },
      businessSignal: scoreBusinessByName(file.fileName),
      downgradeReason: null,
    };
  }

  const businessSignal = scoreBusinessByName(file.fileName);
  if (businessSignal.category && businessSignal.score >= 0.25) {
    return {
      fileId: file.fileId,
      objectType: 'business_object',
      objectConfidence: businessSignal.score,
      objectEvidence: {
        source: 'business',
        signals: businessSignal.matchedKeywords,
        primaryReason: `业务特征命中 ${businessSignal.category}`,
      },
      businessSignal,
      downgradeReason: null,
    };
  }

  if (file.category && file.category !== 'other') {
    return {
      fileId: file.fileId,
      objectType: 'category_object',
      objectConfidence: 0.4,
      objectEvidence: {
        source: 'category',
        signals: [file.category],
        primaryReason: '场景与业务信号不足，降级为通用类别对象',
      },
      businessSignal,
      downgradeReason: businessSignal.category
        ? `业务信号不足（${businessSignal.category} ${businessSignal.score.toFixed(2)}），降级到通用类别`
        : '缺少稳定业务信号，降级到通用类别',
    };
  }

  return {
    fileId: file.fileId,
    objectType: 'uncertain_object',
    objectConfidence: 0.1,
    objectEvidence: {
      source: 'fallback',
      signals: [file.extension || 'unknown'],
      primaryReason: '缺少稳定语义信号，标记为不确定对象',
    },
    businessSignal,
    downgradeReason: '场景、业务与类别信号均不足',
  };
}

function identifyObjects({ files, sceneDecisions, protectedItems = [] }) {
  const protectedPathSet = protectedItems.map((item) => item.path).filter(Boolean);
  const objectDecisions = new Map();

  for (const file of files || []) {
    const sceneDecision = sceneDecisions?.get(file.fileId) || null;
    const objectDecision = identifyFileObject({
      file,
      sceneDecision,
      protectedPathSet,
    });
    objectDecisions.set(file.fileId, objectDecision);
  }

  return objectDecisions;
}

module.exports = {
  identifyObjects,
  scoreBusinessByName,
};
