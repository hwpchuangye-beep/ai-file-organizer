function mapObjectTypeToSemantic(objectType) {
  switch (objectType) {
    case 'scenario_object':
      return {
        semanticLayer: 'scenario',
        namingSource: 'scenario',
        executionAction: 'move',
        semanticReason: '场景对象优先归属场景层',
      };
    case 'business_object':
      return {
        semanticLayer: 'business',
        namingSource: 'business',
        executionAction: 'move',
        semanticReason: '业务对象归属业务层',
      };
    case 'category_object':
      return {
        semanticLayer: 'category',
        namingSource: 'category',
        executionAction: 'move',
        semanticReason: '类别对象归属通用类别层',
      };
    case 'protected_object':
      return {
        semanticLayer: 'protected',
        namingSource: 'protected',
        executionAction: 'protect',
        semanticReason: '保护对象不参与自动拆分',
      };
    default:
      return {
        semanticLayer: 'uncertain',
        namingSource: 'fallback',
        executionAction: 'keep',
        semanticReason: '不确定对象保持原位',
      };
  }
}

function attributeSemantics({ files, objectDecisions }) {
  const semanticDecisions = new Map();

  for (const file of files || []) {
    const objectDecision = objectDecisions?.get(file.fileId);
    const objectType = objectDecision?.objectType || 'uncertain_object';
    const mapped = mapObjectTypeToSemantic(objectType);

    semanticDecisions.set(file.fileId, {
      fileId: file.fileId,
      objectType,
      semanticLayer: mapped.semanticLayer,
      namingSource: mapped.namingSource,
      executionAction: mapped.executionAction,
      semanticReason: mapped.semanticReason,
      downgradeReason: objectDecision?.downgradeReason || null,
    });
  }

  return semanticDecisions;
}

module.exports = {
  attributeSemantics,
};
