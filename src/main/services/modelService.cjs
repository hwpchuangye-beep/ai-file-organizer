/**
 * 模型服务 - 处理与AI模型的真实通信
 * 增强版：多信号业务语义评分、白名单分类、保守模式
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ========== 第一版业务白名单 ==========
const ALLOWED_BUSINESS_CATEGORIES = {
  '运营': {
    keywords: ['运营', '数据', '报表', '日报', '周报', '月报', '投放', '转化', 'ROI', 'DAU', '留存', '增长', '分析', '统计', '流量', '推广', '营销'],
    typicalExtensions: ['.xlsx', '.csv', '.pptx', '.pdf', '.numbers'],
    weight: 1.0
  },
  '产品': {
    keywords: ['产品', '需求', 'PRD', '原型', '方案', '设计', '功能', '用户', '调研', '体验', '交互', '流程', '规格', 'roadmap'],
    typicalExtensions: ['.docx', '.xmind', '.png', '.sketch', '.fig', '.pdf'],
    weight: 1.0
  },
  '客户': {
    keywords: ['客户', '合同', '协议', '报价', '订单', '沟通', '对接', '服务', '商务', '销售', '合作', '供应商', '甲方'],
    typicalExtensions: ['.pdf', '.docx', '.xlsx', '.numbers'],
    weight: 1.0
  },
  '调研': {
    keywords: ['调研', '报告', '竞品', '市场', '分析', '访谈', '问卷', '研究', '行业', '趋势', '洞察', '观察'],
    typicalExtensions: ['.pdf', '.docx', '.pptx', '.xmind', '.numbers'],
    weight: 0.9
  },
  '财务': {
    keywords: ['财务', '发票', '报销', '预算', '报表', '对账', '付款', '收款', '税务', '成本', '收入', '支出', '费用'],
    typicalExtensions: ['.xlsx', '.pdf', '.docx', '.numbers'],
    weight: 0.9
  },
  '学习': {
    keywords: ['学习', '笔记', '教程', '课程', '培训', '读书', '资料', '知识', '技能', '考试', '证书', '学习', '进修'],
    typicalExtensions: ['.pdf', '.docx', '.xmind', '.md', '.mp4', '.mov'],
    weight: 0.8
  },
  '项目': {
    keywords: ['项目', '计划', '进度', '里程碑', '交付', '验收', '启动', '结项', '管理', 'PM', '项目计划'],
    typicalExtensions: ['.docx', '.xlsx', '.pptx', '.xmind', '.pdf'],
    weight: 0.9
  },
  '设计': {
    keywords: ['设计', '素材', '图片', 'UI', '视觉', '品牌', 'Logo', '海报', 'banner', '原型', '配色', '字体', '排版'],
    typicalExtensions: ['.png', '.jpg', '.sketch', '.fig', '.psd', '.ai', '.svg'],
    weight: 0.9
  }
};

// ========== 粗分类目录映射（默认使用）==========
const CATEGORY_FOLDER_NAMES = {
  '表格': { extensions: ['.xlsx', '.xls', '.csv', '.numbers'], minFiles: 2, subdivideThreshold: 10 },
  '文档': { extensions: ['.docx', '.doc', '.txt', '.md', '.pdf', '.pages'], minFiles: 2, subdivideThreshold: 10 },
  '演示': { extensions: ['.ppt', '.pptx', '.key'], minFiles: 2, subdivideThreshold: 10 },
  '脑图': { extensions: ['.xmind', '.mindnode', '.mindmeister'], minFiles: 2, subdivideThreshold: 10 },
  '图片': { extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.bmp', '.tiff'], minFiles: 2, subdivideThreshold: 10 },
  '压缩包': { extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'], minFiles: 2, subdivideThreshold: 10 },
  '安装包': { extensions: ['.dmg', '.pkg', '.apk', '.ipa', '.exe', '.msi'], minFiles: 2, subdivideThreshold: 10 },
  '音视频': { extensions: ['.mp3', '.wav', '.aac', '.flac', '.mp4', '.mov', '.avi', '.mkv'], minFiles: 2, subdivideThreshold: 10 },
  '代码': { extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.rb', '.php'], minFiles: 2, subdivideThreshold: 10 },
  '其他': { extensions: [], minFiles: 1, subdivideThreshold: 999 } // 兜底
};

// 细分类命名映射
const SUBDIVIDE_NAMES = {
  '表格': { '.xlsx': 'Excel表格', '.xls': 'Excel表格', '.csv': 'CSV数据', '.numbers': 'Numbers表格' },
  '文档': { '.pdf': 'PDF文档', '.docx': 'Word文档', '.doc': 'Word文档', '.txt': '文本文件', '.md': 'Markdown笔记', '.pages': 'Pages文档' },
  '脑图': { '.xmind': 'XMind脑图', '.mindnode': 'MindNode脑图', '.mindmeister': 'MindMeister脑图' },
  '图片': { '.jpg': 'JPG图片', '.jpeg': 'JPG图片', '.png': 'PNG图片', '.gif': 'GIF动图', '.webp': 'WebP图片', '.heic': 'HEIC照片' },
  '压缩包': { '.zip': 'ZIP压缩包', '.rar': 'RAR压缩包', '.7z': '7Z压缩包' },
  '安装包': { '.dmg': 'DMG安装包', '.pkg': 'PKG安装包', '.apk': 'APK安装包', '.ipa': 'IPA安装包' },
  '音视频': { '.mp3': 'MP3音频', '.wav': 'WAV音频', '.mp4': 'MP4视频', '.mov': 'MOV视频' }
};

// ========== 测试模型连接 ==========
async function testConnection(config) {
  const { baseUrl, apiKey } = config;
  
  try {
    const url = new URL(`${baseUrl}/v1/models`);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      timeout: 10000,
    };

    return new Promise((resolve) => {
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              const models = result.data?.map(m => m.id) || [];
              resolve({
                success: true,
                message: `连接成功，找到 ${models.length} 个模型`,
                models,
              });
            } catch (e) {
              resolve({ success: true, message: '连接成功' });
            }
          } else if (res.statusCode === 401) {
            resolve({ success: false, message: 'API Key 无效' });
          } else if (res.statusCode === 404) {
            resolve({ success: false, message: '无法连接到服务' });
          } else {
            resolve({ success: false, message: `服务返回错误: ${res.statusCode}` });
          }
        });
      });

      req.on('error', () => {
        resolve({ success: false, message: '无法连接到服务' });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, message: '请求超时' });
      });

      req.end();
    });
  } catch (error) {
    return { success: false, message: '无法连接到服务' };
  }
}

// ========== 多信号业务语义评分 ==========
function calculateBusinessScore(file, allFiles, parentDir) {
  let totalScore = 0;
  const signals = [];
  
  const fileName = file.name.toLowerCase();
  const fileExt = file.extension?.toLowerCase() || '';
  
  // 信号1：文件名关键词匹配 (35%)
  let nameScore = 0;
  let matchedCategory = null;
  
  for (const [category, config] of Object.entries(ALLOWED_BUSINESS_CATEGORIES)) {
    let categoryScore = 0;
    for (const keyword of config.keywords) {
      if (fileName.includes(keyword.toLowerCase())) {
        categoryScore += config.weight * 0.5;
        if (config.typicalExtensions.includes(fileExt)) {
          categoryScore += config.weight * 0.3; // 类型匹配加分
        }
      }
    }
    if (categoryScore > nameScore) {
      nameScore = categoryScore;
      matchedCategory = category;
    }
  }
  
  if (nameScore > 0) {
    totalScore += Math.min(nameScore, 1.0) * 0.35;
    signals.push({ type: 'filename', category: matchedCategory, score: Math.min(nameScore, 1.0) * 0.35 });
  }
  
  // 信号2：父目录名匹配 (25%)
  let dirScore = 0;
  let dirCategory = null;
  
  if (parentDir) {
    const dirName = parentDir.toLowerCase();
    for (const [category, config] of Object.entries(ALLOWED_BUSINESS_CATEGORIES)) {
      let score = 0;
      for (const keyword of config.keywords) {
        if (dirName.includes(keyword.toLowerCase())) {
          score += config.weight * 0.6;
        }
      }
      if (score > dirScore) {
        dirScore = score;
        dirCategory = category;
      }
    }
  }
  
  if (dirScore > 0) {
    totalScore += Math.min(dirScore, 1.0) * 0.25;
    signals.push({ type: 'parent_dir', category: dirCategory, score: Math.min(dirScore, 1.0) * 0.25 });
  }
  
  // 信号3：同批文件命名相似性 (20%)
  const namePrefix = file.name.replace(/\.[^.]+$/, '').split(/[-_.\s]/)[0].toLowerCase();
  let similarCount = 0;
  
  for (const otherFile of allFiles) {
    if (otherFile.path === file.path) continue;
    const otherPrefix = otherFile.name.replace(/\.[^.]+$/, '').split(/[-_.\s]/)[0].toLowerCase();
    if (namePrefix === otherPrefix && namePrefix.length >= 2) {
      similarCount++;
    }
  }
  
  const similarityScore = Math.min(similarCount / Math.min(allFiles.length * 0.3, 10), 1.0);
  if (similarityScore > 0.3) {
    totalScore += similarityScore * 0.20;
    signals.push({ type: 'similarity', score: similarityScore * 0.20 });
  }
  
  // 信号4：文件类型组合 (15%)
  const extGroups = {};
  for (const f of allFiles) {
    const ext = f.extension?.toLowerCase() || 'other';
    extGroups[ext] = (extGroups[ext] || 0) + 1;
  }
  
  const totalFiles = allFiles.length;
  const fileExtGroup = extGroups[fileExt] || 0;
  const typeConcentration = fileExtGroup / totalFiles;
  
  if (typeConcentration > 0.3) {
    totalScore += typeConcentration * 0.15;
    signals.push({ type: 'type_combo', score: typeConcentration * 0.15 });
  }
  
  // 信号5：时间聚集性 (5%)
  const fileTime = new Date(file.modifiedAt).getTime();
  const timeWindows = [];
  
  for (const f of allFiles) {
    const otherTime = new Date(f.modifiedAt).getTime();
    const diffDays = Math.abs(fileTime - otherTime) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) timeWindows.push(f);
  }
  
  const timeClusterScore = Math.min(timeWindows.length / Math.min(totalFiles * 0.5, 5), 1.0);
  if (timeClusterScore > 0.5) {
    totalScore += timeClusterScore * 0.05;
    signals.push({ type: 'time_cluster', score: timeClusterScore * 0.05 });
  }
  
  // 确定最佳匹配类别
  const categoryVotes = {};
  for (const signal of signals) {
    if (signal.category) {
      categoryVotes[signal.category] = (categoryVotes[signal.category] || 0) + signal.score;
    }
  }
  
  let bestCategory = matchedCategory || dirCategory || null;
  let bestVote = 0;
  
  for (const [cat, vote] of Object.entries(categoryVotes)) {
    if (vote > bestVote) {
      bestVote = vote;
      bestCategory = cat;
    }
  }
  
  return {
    score: Math.min(totalScore, 1.0),
    category: bestCategory,
    signals
  };
}

// ========== 保守模式：确定整理方案 ==========
function determineScheme(scanResult) {
  const { files, targetPath } = scanResult;
  
  if (files.length === 0) {
    return { scheme: 'category', reason: '没有文件需要整理' };
  }
  
  // 文件数量过少时降级
  if (files.length < 5) {
    return {
      scheme: 'category',
      confidence: 'low',
      confidenceValue: 0,
      reason: '文件数量较少（<5），建议按类别整理',
      recommendation: 'conservative'
    };
  }
  
  // 计算所有文件的业务评分
  const parentDir = targetPath.split('/').pop();
  const fileScores = files.map(file => ({
    file,
    ...calculateBusinessScore(file, files, parentDir)
  }));
  
  // 统计各业务类别得分
  const categoryScores = {};
  for (const fs of fileScores) {
    if (fs.category) {
      if (!categoryScores[fs.category]) {
        categoryScores[fs.category] = { count: 0, totalScore: 0, files: [] };
      }
      categoryScores[fs.category].count++;
      categoryScores[fs.category].totalScore += fs.score;
      categoryScores[fs.category].files.push(fs.file);
    }
  }
  
  // 找出最佳业务类别
  let bestCategory = null;
  let bestAvgScore = 0;
  let bestCount = 0;
  
  for (const [category, data] of Object.entries(categoryScores)) {
    const avgScore = data.totalScore / data.count;
    // 需要至少3个文件才考虑业务分类
    if (data.count >= 3 && avgScore > bestAvgScore) {
      bestAvgScore = avgScore;
      bestCategory = category;
      bestCount = data.count;
    }
  }
  
  // 保守模式分级
  if (bestCategory && bestAvgScore >= 0.75 && bestCount >= files.length * 0.4) {
    return {
      scheme: 'business',
      category: bestCategory,
      confidence: 'very-high',
      confidenceValue: bestAvgScore,
      matchedFiles: bestCount,
      totalFiles: files.length,
      reason: `检测到"${bestCategory}"特征非常明显（置信度 ${Math.round(bestAvgScore * 100)}%，涉及 ${bestCount} 个文件）`,
      recommendation: 'business-direct',
      fileScores
    };
  }
  
  if (bestCategory && bestAvgScore >= 0.60 && bestCount >= files.length * 0.3) {
    return {
      scheme: 'business',
      category: bestCategory,
      confidence: 'high',
      confidenceValue: bestAvgScore,
      matchedFiles: bestCount,
      totalFiles: files.length,
      reason: `检测到"${bestCategory}"特征较明显（置信度 ${Math.round(bestAvgScore * 100)}%，涉及 ${bestCount} 个文件）`,
      recommendation: 'business-recommend',
      fileScores
    };
  }
  
  if (bestCategory && bestAvgScore >= 0.40 && bestCount >= files.length * 0.2) {
    return {
      scheme: 'business-category',
      category: bestCategory,
      confidence: 'medium',
      confidenceValue: bestAvgScore,
      matchedFiles: bestCount,
      totalFiles: files.length,
      reason: `检测到"${bestCategory}"特征，但不够强烈（置信度 ${Math.round(bestAvgScore * 100)}%），建议二级整理`,
      recommendation: 'business-category-recommend',
      fileScores
    };
  }
  
  // 低置信度，按类别整理
  return {
    scheme: 'category',
    confidence: 'low',
    confidenceValue: bestAvgScore || 0,
    reason: bestCategory 
      ? `检测到"${bestCategory}"特征较弱（置信度 ${Math.round(bestAvgScore * 100)}%），建议按类别整理`
      : '未能识别出明显业务特征，建议按类别整理',
    recommendation: 'category-conservative',
    fileScores
  };
}

// ========== 生成分类文件夹名（禁止前导点）==========
function getCategoryFolderName(extension, fileCount) {
  const ext = extension?.toLowerCase() || '';
  
  // 查找所属粗分类
  let baseCategory = '其他';
  for (const [category, config] of Object.entries(CATEGORY_FOLDER_NAMES)) {
    if (config.extensions.includes(ext)) {
      baseCategory = category;
      break;
    }
  }
  
  // 检查是否需要细分
  const subdivideConfig = SUBDIVIDE_NAMES[baseCategory];
  if (subdivideConfig && fileCount >= CATEGORY_FOLDER_NAMES[baseCategory].subdivideThreshold) {
    return subdivideConfig[ext] || baseCategory;
  }
  
  return baseCategory;
}

// ========== 生成完整方案 ==========
function generateCompleteSchemes(scanResult) {
  const { files, targetPath } = scanResult;
  const schemeDecision = determineScheme(scanResult);
  
  const schemes = [];
  
  // 方案1：根据决策生成的主要方案
  if (schemeDecision.scheme === 'business' && schemeDecision.confidenceValue >= 0.60) {
    // 按业务语义整理
    const businessFiles = [];
    const uncertainFiles = [];
    
    for (const file of files) {
      const score = calculateBusinessScore(file, files, targetPath.split('/').pop());
      if (score.category === schemeDecision.category && score.score >= 0.30) {
        businessFiles.push({ file, score });
      } else {
        uncertainFiles.push(file);
      }
    }
    
    // 按类别细分业务文件（如果需要）
    const businessByType = {};
    for (const { file } of businessFiles) {
      const folderName = getCategoryFolderName(file.extension, businessFiles.length);
      const finalFolder = businessFiles.length > 10 
        ? `${schemeDecision.category}/${folderName}`
        : schemeDecision.category;
      
      if (!businessByType[finalFolder]) businessByType[finalFolder] = [];
      businessByType[finalFolder].push(file);
    }
    
    const suggestedFolders = Object.keys(businessByType);
    
    // 处理碎片：数量过少的类别并入主业务目录
    const finalFolders = [];
    const finalMoves = [];
    
    for (const [folder, folderFiles] of Object.entries(businessByType)) {
      if (folderFiles.length < 2 && folder.includes('/')) {
        // 碎片并入主业务目录
        const mainFolder = folder.split('/')[0];
        if (!finalFolders.includes(mainFolder)) finalFolders.push(mainFolder);
        for (const file of folderFiles) {
          finalMoves.push({ file, targetFolder: mainFolder, confidence: 'medium' });
        }
      } else {
        if (!finalFolders.includes(folder)) finalFolders.push(folder);
        for (const file of folderFiles) {
          finalMoves.push({ file, targetFolder: folder, confidence: 'medium' });
        }
      }
    }
    
    // 不确定的文件放入待确认文件
    if (uncertainFiles.length > 0) {
      finalFolders.push('待确认文件');
      for (const file of uncertainFiles) {
        finalMoves.push({ file, targetFolder: '待确认文件', confidence: 'low' });
      }
    }
    
    schemes.push({
      schemeId: 'by-business',
      schemeName: `按业务语义整理（${schemeDecision.category}）`,
      reason: schemeDecision.reason,
      confidence: schemeDecision.confidence,
      confidenceValue: schemeDecision.confidenceValue,
      suggestedFolders: finalFolders,
      plannedMoves: finalMoves.slice(0, 50),
      uncertainItems: uncertainFiles.slice(0, 10).map(f => ({ file: f, reason: '业务特征不明显' })),
      source: 'analysis',
      previewTree: generatePreviewTree(finalMoves, finalFolders)
    });
  }
  
  // 方案2：按类别整理（始终提供作为备选）
  const categoryGroups = {};
  const uncertainForCategory = [];
  
  for (const file of files) {
    const folderName = getCategoryFolderName(file.extension, files.length);
    if (!categoryGroups[folderName]) categoryGroups[folderName] = [];
    categoryGroups[folderName].push(file);
  }
  
  // 碎片控制：数量过少的类别处理
  const finalCategoryFolders = [];
  const finalCategoryMoves = [];
  const orphanedFiles = [];
  
  for (const [folder, folderFiles] of Object.entries(categoryGroups)) {
    if (folderFiles.length < 2 && folder !== '其他') {
      // 碎片文件
      orphanedFiles.push(...folderFiles);
    } else {
      if (!finalCategoryFolders.includes(folder)) finalCategoryFolders.push(folder);
      for (const file of folderFiles) {
        finalCategoryMoves.push({ file, targetFolder: folder, confidence: 'high' });
      }
    }
  }
  
  // 碎片并入待确认文件或其他
  if (orphanedFiles.length > 0) {
    const orphanFolder = '待确认文件';
    if (!finalCategoryFolders.includes(orphanFolder)) finalCategoryFolders.push(orphanFolder);
    for (const file of orphanedFiles) {
      finalCategoryMoves.push({ file, targetFolder: orphanFolder, confidence: 'low' });
    }
  }
  
  schemes.push({
    schemeId: 'by-category',
    schemeName: '按文件类别整理（保守方案）',
    reason: '按文件类型分类，不猜测业务语义，适合业务特征不明显的场景',
    confidence: 'high',
    confidenceValue: 0.9,
    suggestedFolders: finalCategoryFolders,
    plannedMoves: finalCategoryMoves.slice(0, 50),
    uncertainItems: [],
    source: 'rule',
    previewTree: generatePreviewTree(finalCategoryMoves, finalCategoryFolders)
  });
  
  // 方案3：混合方案（业务+类别）- 仅在中等置信度时作为主要推荐
  if (schemeDecision.scheme === 'business-category' || 
      (schemeDecision.scheme === 'business' && schemeDecision.confidenceValue >= 0.40 && schemeDecision.confidenceValue < 0.60)) {
    const mixedFolders = [];
    const mixedMoves = [];
    
    // 先按业务分，再按类型分
    const businessTypeGroups = {};
    
    for (const file of files) {
      const score = calculateBusinessScore(file, files, targetPath.split('/').pop());
      const typeFolder = getCategoryFolderName(file.extension, files.length);
      
      let finalFolder;
      if (score.category === schemeDecision.category && score.score >= 0.25) {
        finalFolder = `${schemeDecision.category}/${typeFolder}`;
      } else {
        finalFolder = typeFolder;
      }
      
      if (!businessTypeGroups[finalFolder]) businessTypeGroups[finalFolder] = [];
      businessTypeGroups[finalFolder].push(file);
    }
    
    // 应用碎片控制
    for (const [folder, folderFiles] of Object.entries(businessTypeGroups)) {
      if (folderFiles.length < 2 && folder.includes('/')) {
        const mainFolder = folder.split('/')[0];
        if (!mixedFolders.includes(mainFolder)) mixedFolders.push(mainFolder);
        for (const file of folderFiles) {
          mixedMoves.push({ file, targetFolder: mainFolder, confidence: 'medium' });
        }
      } else {
        if (!mixedFolders.includes(folder)) mixedFolders.push(folder);
        for (const file of folderFiles) {
          mixedMoves.push({ file, targetFolder: folder, confidence: 'medium' });
        }
      }
    }
    
    schemes.unshift({
      schemeId: 'by-business-category',
      schemeName: `按业务+类别二级整理（${schemeDecision.category}）`,
      reason: schemeDecision.reason,
      confidence: schemeDecision.confidence,
      confidenceValue: schemeDecision.confidenceValue,
      suggestedFolders: mixedFolders,
      plannedMoves: mixedMoves.slice(0, 50),
      uncertainItems: [],
      source: 'analysis',
      previewTree: generatePreviewTree(mixedMoves, mixedFolders)
    });
  }
  
  return {
    schemes,
    source: schemeDecision.scheme === 'business' ? 'analysis' : 'rule',
    recommendation: schemeDecision
  };
}

// ========== 生成整理方案（主入口）==========
async function generateSchemes(scanResult, modelConfig) {
  // 优先使用本地分析生成方案
  const localResult = generateCompleteSchemes(scanResult);
  
  // 如果有模型配置，尝试调用AI增强
  if (modelConfig && modelConfig.baseUrl) {
    try {
      const aiResult = await callAIModel(scanResult, modelConfig);
      if (aiResult.success && aiResult.schemes) {
        // AI结果与本地结果合并，本地结果优先作为fallback
        return {
          success: true,
          schemes: [...aiResult.schemes, ...localResult.schemes],
          source: 'model',
          recommendation: localResult.recommendation
        };
      }
    } catch (e) {
      console.error('AI模型调用失败，使用本地规则方案:', e);
    }
  }
  
  return {
    success: true,
    ...localResult,
    message: '当前为本地规则分析方案'
  };
}

// ========== 调用AI模型（可选）==========
async function callAIModel(scanResult, modelConfig) {
  const { baseUrl, modelName, apiKey } = modelConfig;
  
  const prompt = buildOrganizationPrompt(scanResult);
  
  try {
    const url = new URL(`${baseUrl}/v1/chat/completions`);
    const client = url.protocol === 'https:' ? https : http;
    
    const requestBody = JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `你是文件整理助手。请根据文件列表生成1-2套整理方案。
只允许使用以下业务分类：运营、产品、客户、调研、财务、学习、项目、设计。
如果无法确定业务分类，请使用文件类型分类：表格、文档、图片、演示、脑图、压缩包、安装包、音视频。
必须返回JSON格式：
{
  "schemes": [
    {
      "schemeId": "string",
      "schemeName": "string",
      "reason": "string",
      "suggestedFolders": ["string"],
      "plannedMoves": [{"fileName": "string", "targetFolder": "string", "confidence": "high|medium|low"}]
    }
  ]
}`
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    return new Promise((resolve) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
        },
        timeout: 30000,
      };

      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              const content = result.choices?.[0]?.message?.content;
              
              if (content) {
                const parsed = parseModelResponse(content, scanResult);
                resolve({ success: true, schemes: parsed.schemes });
              } else {
                resolve({ success: false });
              }
            } catch (e) {
              resolve({ success: false });
            }
          } else {
            resolve({ success: false });
          }
        });
      });

      req.on('error', () => resolve({ success: false }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false }); });

      req.write(requestBody);
      req.end();
    });
  } catch (error) {
    return { success: false };
  }
}

function buildOrganizationPrompt(scanResult) {
  const { targetPath, totalFiles, files, issueSummary } = scanResult;
  const sampleFiles = files.slice(0, 30).map(f => ({
    name: f.name,
    extension: f.extension,
    size: f.size,
    modifiedAt: f.modifiedAt,
  }));

  return `请帮我整理以下目录：${targetPath}

文件统计：
- 总文件数：${totalFiles}
- 图片类：${issueSummary?.screenshotsCount || 0}
- 下载类：${issueSummary?.downloadsCount || 0}

文件列表（前30个）：
${JSON.stringify(sampleFiles, null, 2)}

请生成整理方案。注意：
1. 只能使用这些业务分类：运营、产品、客户、调研、财务、学习、项目、设计
2. 如果不能确定业务分类，请按文件类型分类
3. 文件夹名称不要使用前导点（如.xlsx）`;
}

function parseModelResponse(content, scanResult) {
  try {
    const parsed = JSON.parse(content);
    if (parsed.schemes && Array.isArray(parsed.schemes)) {
      return enrichSchemes(parsed.schemes, scanResult);
    }
  } catch (e) {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                      content.match(/```\n([\s\S]*?)\n```/) ||
                      content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (parsed.schemes && Array.isArray(parsed.schemes)) {
          return enrichSchemes(parsed.schemes, scanResult);
        }
      } catch (e2) {}
    }
  }
  
  return { schemes: [] };
}

function enrichSchemes(schemes, scanResult) {
  const enrichedSchemes = schemes.map((scheme, index) => {
    const plannedMoves = (scheme.plannedMoves || []).map(move => {
      const fileInfo = scanResult.files.find(f => f.name === move.fileName);
      return {
        file: fileInfo || { name: move.fileName, path: '', extension: '' },
        targetFolder: move.targetFolder,
        targetPath: '',
        confidence: move.confidence || 'medium',
      };
    });

    return {
      schemeId: scheme.schemeId || `scheme-${index}`,
      schemeName: scheme.schemeName || `方案 ${index + 1}`,
      reason: scheme.reason || '基于文件特征自动分类',
      suggestedFolders: scheme.suggestedFolders || [],
      plannedMoves: plannedMoves.slice(0, 30),
      uncertainItems: scheme.uncertainItems || [],
      previewTree: generatePreviewTree(plannedMoves, scheme.suggestedFolders),
      source: 'model',
    };
  });

  return { schemes: enrichedSchemes };
}

function generatePreviewTree(plannedMoves, folders) {
  const root = { name: '整理后', path: '/', children: [] };

  folders.forEach(folder => {
    const folderMoves = plannedMoves.filter(m => m.targetFolder === folder);
    root.children.push({
      name: folder,
      path: `/${folder}`,
      children: folderMoves.slice(0, 5).map(m => ({
        name: m.file.name,
        path: m.file.path,
        isFile: true,
      })),
    });
  });

  return root;
}

// ========== 获取可用模型列表 ==========
async function getModels(config) {
  const { baseUrl, apiKey } = config;
  
  try {
    const url = new URL(`${baseUrl}/v1/models`);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      timeout: 10000,
    };

    return new Promise((resolve) => {
      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              const models = result.data?.map(m => m.id) || [];
              resolve({ success: true, models });
            } catch (e) {
              resolve({ success: false, message: '解析模型列表失败' });
            }
          } else if (res.statusCode === 401) {
            resolve({ success: false, message: 'API Key 无效' });
          } else {
            resolve({ success: false, message: `服务返回错误: ${res.statusCode}` });
          }
        });
      });

      req.on('error', () => {
        resolve({ success: false, message: '无法连接到服务' });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, message: '请求超时' });
      });

      req.end();
    });
  } catch (error) {
    return { success: false, message: '无法连接到服务' };
  }
}

module.exports = { testConnection, generateSchemes, getModels };
