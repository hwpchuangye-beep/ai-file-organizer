/**
 * 模型服务 - 处理与AI模型的真实通信
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * 测试模型连接
 */
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

/**
 * 生成整理方案
 */
async function generateSchemes(scanResult, modelConfig) {
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
          content: `你是文件整理助手。请根据文件列表生成2-3套整理方案。
必须返回JSON格式：
{
  "schemes": [
    {
      "schemeId": "by-type",
      "schemeName": "按文件类型整理",
      "reason": "推荐理由",
      "suggestedFolders": ["图片", "文档"],
      "plannedMoves": [
        {"fileName": "example.jpg", "targetFolder": "图片", "confidence": "high"}
      ],
      "uncertainItems": []
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
        timeout: 60000,
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
                resolve({ success: true, schemes: parsed.schemes, source: 'model' });
              } else {
                const fallback = generateFallbackSchemes(scanResult);
                resolve({ success: true, ...fallback });
              }
            } catch (e) {
              const fallback = generateFallbackSchemes(scanResult);
              resolve({ success: true, ...fallback });
            }
          } else {
            const fallback = generateFallbackSchemes(scanResult);
            resolve({ success: true, ...fallback });
          }
        });
      });

      req.on('error', () => {
        const fallback = generateFallbackSchemes(scanResult);
        resolve({ success: true, ...fallback });
      });

      req.on('timeout', () => {
        req.destroy();
        const fallback = generateFallbackSchemes(scanResult);
        resolve({ success: true, ...fallback });
      });

      req.write(requestBody);
      req.end();
    });
  } catch (error) {
    const fallback = generateFallbackSchemes(scanResult);
    return { success: true, ...fallback };
  }
}

function buildOrganizationPrompt(scanResult) {
  const { targetPath, totalFiles, files, issueSummary } = scanResult;
  const sampleFiles = files.slice(0, 50).map(f => ({
    name: f.name,
    extension: f.extension,
    size: f.size,
    modifiedAt: f.modifiedAt,
  }));

  return `请帮我整理以下目录：${targetPath}

文件统计：
- 总文件数：${totalFiles}
- 图片类：${issueSummary.screenshotsCount}
- 下载类：${issueSummary.downloadsCount}

文件列表（前50个）：
${JSON.stringify(sampleFiles, null, 2)}

请生成2-3套整理方案，每套方案说明分类维度、建议文件夹、文件去向。必须返回JSON格式。`;
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
  
  return generateFallbackSchemes(scanResult);
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

function generateFallbackSchemes(scanResult) {
  const { files, targetPath } = scanResult;
  
  // 按扩展名分组
  const byExtension = {};
  files.forEach(file => {
    const ext = file.extension || '其他';
    if (!byExtension[ext]) byExtension[ext] = [];
    byExtension[ext].push(file);
  });

  const extFolders = Object.keys(byExtension).slice(0, 5);
  
  const scheme1 = {
    schemeId: 'by-type',
    schemeName: '按文件类型整理（基础规则）',
    reason: '根据文件扩展名自动分类，这是系统基于规则生成的方案',
    suggestedFolders: extFolders,
    plannedMoves: files.slice(0, 30).map(file => {
      const ext = file.extension || '其他';
      return { file, targetFolder: ext, targetPath: '', confidence: 'medium' };
    }),
    uncertainItems: [],
    previewTree: {},
    source: 'fallback',
  };

  scheme1.previewTree = generatePreviewTree(scheme1.plannedMoves, scheme1.suggestedFolders);

  // 按日期分组
  const byDate = {};
  files.forEach(file => {
    const date = new Date(file.modifiedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(file);
  });

  const dateFolders = Object.keys(byDate).sort().slice(0, 6);

  const scheme2 = {
    schemeId: 'by-date',
    schemeName: '按修改日期整理（基础规则）',
    reason: '按文件修改时间归档，这是系统基于规则生成的方案',
    suggestedFolders: dateFolders,
    plannedMoves: files.slice(0, 30).map(file => {
      const date = new Date(file.modifiedAt);
      const folder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { file, targetFolder: folder, targetPath: '', confidence: 'medium' };
    }),
    uncertainItems: [],
    previewTree: {},
    source: 'fallback',
  };

  scheme2.previewTree = generatePreviewTree(scheme2.plannedMoves, scheme2.suggestedFolders);

  return {
    schemes: [scheme1, scheme2],
    source: 'fallback',
    message: '当前为基础规则方案（模型服务暂时不可用）',
  };
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

/**
 * 获取可用模型列表
 */
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
