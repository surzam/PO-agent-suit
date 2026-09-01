export const A2UI_VERSION = 'v1.0';
export const CATALOG_ID = 'agentsuite://catalog/interactive-result/v1';
export const CATALOG_VERSION = '1';
export const ALLOWED_COMPONENTS = new Set(['Column','Row','Section','Heading','Text','Metric','Fact','Insight','EvidenceRef','DataTable','Tabs','Callout','Divider','ArtifactLink']);

export function dynamicPath(path) { return { path }; }

export function createSurface(surfaceId, components, dataModel) {
  return { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: CATALOG_ID, components, dataModel } };
}

export function updateDataModel(surfaceId, value) {
  return { version: A2UI_VERSION, updateDataModel: { surfaceId, path: '/', value } };
}
