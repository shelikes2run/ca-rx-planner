// Experience Builder config v2: Weather Evaluator, Smoke Modeling, Outlooks & Typical Burn Days
function buildExb2({ wm1, wm2, wm3, base, portalUrl = 'https://nifc.maps.arcgis.com' }) {
  const v = '1.21.0';
  const UNITS_URL = 'https://gis.reshapewildfire.org/arcgis/rest/services/Hosted/Treatment_Index_View/FeatureServer/0';
  const mapTools = { canZoom: true, canHome: true, canSearch: false, canNavigation: true, canBaseMap: true, canMeasure: true, canFullScreen: true, canScaleBar: true, canLocate: true, canCompass: true, canLayers: true, canSelect: false, canExtentNavigate: false, canOverviewMap: false };
  const pct = (l, t, w, h) => ({ left: l + '%', top: t + '%', width: w + '%', height: h + '%' });
  const px = (l, t, w, h) => ({ left: l, top: t, width: w, height: h });
  const item = (it, i) => [String(i), it.section
    ? { type: 'SECTION', sectionId: it.section, bbox: it.bbox, setting: { autoProps: { left: false, right: false, top: false, bottom: false, width: 'CUSTOM', height: 'CUSTOM' } } }
    : { type: 'WIDGET', widgetId: it.w, bbox: it.bbox, setting: { autoProps: { left: false, right: false, top: false, bottom: false, width: 'CUSTOM', height: 'CUSTOM' } } }];
  const fixed = items => ({ type: 'FIXED', order: items.map((_, i) => String(i)), content: Object.fromEntries(items.map(item)) });
  const text = (id, label, html, style) => ({ uri: 'widgets/common/text/', version: v, id, label, config: { text: html, style: { verticalAlign: 'start', wrap: true } }, ...(style ? { style } : {}) });
  const card = { background: { color: 'rgba(255,255,255,0.94)', fillType: 'fill' }, border: { type: 'solid', color: '#c9d3dd', width: '1px' }, borderRadius: { number: [4, 4, 4, 4], unit: 'px' } };
  const exp = (ds, uid, label, field) => {
    const sel = `${ds}-treatment_units-selection`;
    const e = encodeURIComponent(JSON.stringify({ name: `{${label}}`, parts: [{ type: 'FIELD', exp: `{${label}}`, dataSourceId: sel, jimuFieldName: field, isFromRepeatedDataSourceContext: false }] }));
    return `<exp data-uniqueid="${uid}" data-dsid="${sel}" data-expression="${e}">﻿<span contenteditable="false">{${label}}</span>﻿</exp>`;
  };
  const dynUrl = (page, ds, k) => `<p>${base}/${page}?unit=${exp(ds, k + '_n', 'Name', 'name')}&amp;id=${exp(ds, k + '_i', 'Object ID', 'objectid')}</p>`;
  const W = {}, LAY = {}, SEC = {}, VIEWS = {}, DS = {}, MSG = {};

  // data sources
  const webmap = (id, label, itemId, withUnits) => {
    DS[id] = { id, type: 'WEB_MAP', sourceLabel: label, itemId, portalUrl,
      ...(withUnits ? { childDataSourceJsons: { treatment_units: { id: `${id}-treatment_units`, type: 'FEATURE_LAYER', sourceLabel: 'Fuel Treatment Units (Reshape Wildfire)', url: UNITS_URL, layerId: '0' } } } : {}) };
  };
  webmap('dataSource_1', 'CA Prescribed Fire Planner Map', wm1, true);
  webmap('dataSource_2', 'CA Prescribed Fire Planner Map - Outlooks', wm2, false);
  webmap('dataSource_3', 'CA Prescribed Fire Planner Map - Smoke', wm3, true);

  // header
  W.w_title = text('w_title', 'Title', '<p><strong style="font-size:18px;color:#ffffff;">CA Prescribed Fire Planner</strong><span style="font-size:13px;color:#dbe7f3;"> (Beta) · burn windows, smoke, outlooks, typical burn days</span></p>');
  W.w_menu = { uri: 'widgets/common/menu/', version: v, id: 'w_menu', label: 'Menu', config: { type: 'nav', vertical: false, menuStyle: 'pills', advanced: true,
    variants: { default: { item: { default: { color: '#dbe7f3' }, hover: { color: '#ffffff', bg: '#14548a' }, active: { color: '#0b3b63', bg: '#ffffff' } } } } },
    style: { background: { color: '#0b3b63', fillType: 'fill' }, textColor: '#ffffff' } };
  LAY.layout_header = { type: 'FLEX_ROW', order: ['0', '1'], setting: { justifyContent: 'space-between', padding: { number: [0, 12, 0, 12], unit: 'px' } }, content: {
    0: { type: 'WIDGET', widgetId: 'w_title', bbox: { width: '600px', height: '40px' }, setting: { autoProps: { width: 'CUSTOM', height: 'CUSTOM' }, style: { alignSelf: 'center' } } },
    1: { type: 'WIDGET', widgetId: 'w_menu', bbox: { width: '560px', height: '36px' }, setting: { autoProps: { width: 'AUTO', height: 'CUSTOM' }, style: { alignSelf: 'center' } } } } };
  LAY.layout_footer = { type: 'FIXED', order: [], content: {} };

  // a map + search + help + two-tab tool panel
  function toolPage(n, ds, toolFile, toolName, helpHtml) {
    const units = `${ds}-treatment_units`, sel = `${units}-selection`;
    const mapId = `w_map${n}`, searchId = `w_search${n}`, helpId = `w_help${n}`, navId = `w_nav${n}`, secId = `section_${n}`;
    const vStatic = `view_${n}_tool`, vDyn = `view_${n}_sel`, eStatic = `w_embed${n}_tool`, eDyn = `w_embed${n}_sel`;
    W[mapId] = { uri: 'widgets/arcgis/arcgis-map/', version: v, id: mapId, label: `${toolName} Map`,
      config: { toolConfig: mapTools, isUseCustomMapState: false, initialMapDataSourceID: ds, initialMapState: null, disablePopUp: true, showPopupUponSelection: false, clientQueryDataSourceIds: [] },
      useDataSources: [{ dataSourceId: ds, mainDataSourceId: ds }], layouts: { MapFixedLayout: { LARGE: `layout_map${n}` } } };
    W[searchId] = { uri: 'widgets/common/search/', version: v, id: searchId, label: 'Unit Search', useMapWidgetIds: [mapId], useUtilities: [{ utilityId: 'utility_1' }],
      config: { sourceType: 'MapCentric', searchResultView: 'Result_Panel', arrangementStyle: 'Style1', maxSuggestions: 6, resultMaxNumber: 6, enableFiltering: false, isAutoSelectFirstResult: true,
        dataSourceConfigWithMapCentric: { [`${mapId}-${ds}`]: { dataSourceConfig: [
          { configId: 'cfg_units', label: 'Fuel Treatment Units', displayLabel: true, hint: 'Search unit name', searchServiceType: 'FeatureService', searchExact: false, searchInCurrentMapExtent: false,
            useDataSource: { dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds, fields: ['name', 'objectid'] },
            displayFields: [{ jimuName: 'name', name: 'name', type: 'STRING', esriType: 'esriFieldTypeString', alias: 'Name' }],
            searchFields: [{ jimuName: 'name', name: 'name', type: 'STRING', esriType: 'esriFieldTypeString', alias: 'Name' }] },
          { configId: 'cfg_geocode', label: 'Place or address', useUtility: { utilityId: 'utility_1' }, searchServiceType: 'GeocodeService', singleLineFieldName: 'SingleLine', isSupportSuggest: true, outputDataSourceId: `${searchId}_output_geocode` }
        ], synchronizeSettings: false } } },
      useDataSources: [{ dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds, fields: ['name', 'objectid'] }], outputDataSources: [`${searchId}_output_geocode`] };
    DS[`${searchId}_output_geocode`] = { id: `${searchId}_output_geocode`, type: 'FEATURE_LAYER', label: 'Search result', isOutputFromWidget: true, isDataInDataSourceInstance: false, originDataSources: [], geometryType: 'esriGeometryPoint',
      schema: { label: 'Search result', idField: 'objectid', fields: { objectid: { jimuName: 'objectid', name: 'objectid', alias: 'OBJECTID', type: 'NUMBER', esriType: 'esriFieldTypeOID' } } } };
    W[helpId] = text(helpId, 'How to use', helpHtml, card);
    // static (always available) and selection-driven embeds
    W[eStatic] = { uri: 'widgets/common/embed/', version: v, id: eStatic, label: `${toolName} – search / upload`,
      config: { embedType: 'url', expression: `<p>${base}/${toolFile}</p>`, enableLabel: false, enableBlankMessage: false, autoRefresh: false, honorThemeFont: false, embedCode: '' }, useDataSourcesEnabled: false };
    W[eDyn] = { uri: 'widgets/common/embed/', version: v, id: eDyn, label: `${toolName} – map-selected unit`,
      config: { embedType: 'url', expression: dynUrl(toolFile, ds, `${n}x`), enableLabel: true, label: 'Click a fuel treatment unit on the map to run it here.',
        enableBlankMessage: true, blankMessage: 'Click a fuel treatment unit on the map to run it here. To upload your own unit, search by name, or enter coordinates, use the "Search / upload unit & Rx" tab above.', autoRefresh: false, honorThemeFont: false, embedCode: '' },
      useDataSourcesEnabled: true, useDataSources: [{ dataSourceId: sel, mainDataSourceId: units, rootDataSourceId: ds, dataViewId: 'selection', fields: ['name', 'objectid'] }] };
    LAY[`layout_${vStatic}`] = fixed([{ w: eStatic, bbox: pct(0, 0, 100, 100) }]);
    LAY[`layout_${vDyn}`] = fixed([{ w: eDyn, bbox: pct(0, 0, 100, 100) }]);
    VIEWS[vStatic] = { id: vStatic, label: 'Search / upload unit & Rx', layout: { LARGE: `layout_${vStatic}` } };
    VIEWS[vDyn] = { id: vDyn, label: 'Unit selected on map', layout: { LARGE: `layout_${vDyn}` } };
    SEC[secId] = { id: secId, label: `${toolName} panel`, views: [vStatic, vDyn], arrowsNav: { visible: false }, dotsNav: { visible: false } };
    W[navId] = { uri: 'widgets/common/navigator/', version: v, id: navId, label: `${toolName} tabs`,
      config: { data: { type: 'AUTO', section: secId, views: [] }, display: { advanced: false, vertical: false, type: 'nav', navStyle: 'default', standard: { scrollable: true, textAlign: 'center', gap: '0px', showText: true, showIcon: false, iconPosition: 'start' } } } };
    LAY[`layout_p${n}`] = fixed([
      { w: mapId, bbox: pct(0, 0, 56, 100) },
      { w: navId, bbox: { left: '56.5%', top: '0px', width: '43.5%', height: '44px' } },
      { section: secId, bbox: { left: '56.5%', top: '46px', width: '43.5%', height: 'calc(100% - 46px)' } }]);
    LAY[`layout_map${n}`] = fixed([
      { w: searchId, bbox: px('60px', '12px', '340px', '40px') },
      { w: helpId, bbox: px('60px', '60px', '340px', '78px') }]);
    MSG[`msg_mapsel${n}`] = { id: `msg_mapsel${n}`, widgetId: mapId, messageType: 'DATA_RECORDS_SELECTION_CHANGE', actions: [{ actionId: `sel_units_from_map${n}`, widgetId: mapId, messageWidgetId: mapId, actionName: 'select data record action', version: v,
      config: { messageUseDataSource: { dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds }, actionUseDataSource: { dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds }, sqlExprObj: null, enabledDataRelationShip: true, connectionType: null },
      useDataSources: [{ dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds, fields: [] }] }] };
    MSG[`msg_searchsel${n}`] = { id: `msg_searchsel${n}`, widgetId: searchId, messageType: 'DATA_RECORDS_SELECTION_CHANGE', actions: [
      { actionId: `zoom_from_search${n}`, widgetId: mapId, messageWidgetId: searchId, actionName: 'zoomToFeature', version: v, config: { useDataSources: [{ dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds }, { dataSourceId: `${searchId}_output_geocode`, mainDataSourceId: `${searchId}_output_geocode`, rootDataSourceId: null }], goToInitialMapExtentWhenSelectionCleared: false, useAnyTriggerData: true } },
      { actionId: `sel_units_from_search${n}`, widgetId: mapId, messageWidgetId: searchId, actionName: 'select data record action', version: v,
        config: { messageUseDataSource: { dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds }, actionUseDataSource: { dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds }, sqlExprObj: null, enabledDataRelationShip: true, connectionType: null },
        useDataSources: [{ dataSourceId: units, mainDataSourceId: units, rootDataSourceId: ds, fields: [] }] }] };
  }
  toolPage(1, 'dataSource_1', 'burn_eval_ca.html', 'Weather Evaluator',
    '<p style="font-size:12px;"><strong>Two ways in:</strong> click a fuel treatment unit, then open the <em>Unit selected on map</em> tab — or use the <em>Search / upload unit &amp; Rx</em> tab to search by name, upload a shapefile/KML/GeoJSON, or enter lat/lon. Set your Rx in either tab.</p>');
  toolPage(3, 'dataSource_3', 'smoke_eval_ca.html', 'Smoke Modeling',
    '<p style="font-size:12px;"><strong>Smoke screening:</strong> click a unit, then open <em>Unit selected on map</em> — or search / upload in the other tab. Set the burn date, ignition hour and duration, then run. Layers show the NWS smoke forecast, air districts and Class I areas.</p>');

  // Outlooks page
  W.w_map2 = { uri: 'widgets/arcgis/arcgis-map/', version: v, id: 'w_map2', label: 'Outlook Map',
    config: { toolConfig: { ...mapTools, canSearch: true }, isUseCustomMapState: false, initialMapDataSourceID: 'dataSource_2', initialMapState: null, disablePopUp: false },
    useDataSources: [{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }], layouts: { MapFixedLayout: { LARGE: 'layout_map2' } } };
  W.w_layers2 = { uri: 'widgets/arcgis/map-layers/', version: v, id: 'w_layers2', label: 'Layers', useMapWidgetIds: ['w_map2'], config: { useMapWidget: true, enableLegend: true, showAllLegend: false, goto: true, label: true, opacity: true, layerOrder: true, information: true, setVisibility: true } };
  W.w_legend2 = { uri: 'widgets/arcgis/legend/', version: v, id: 'w_legend2', label: 'Legend', useMapWidgetIds: ['w_map2'], config: { cardLayout: false, respectLayerVisibility: true } };
  W.w_help2 = text('w_help2', 'Outlook notes', '<p style="font-size:12px;"><strong>How to read this page.</strong> Turn on layers in <em>Monthly &amp; Seasonal Outlooks</em> (CPC 6–10/8–14 day, monthly, 3-month seasonal; Predictive Services Month 1–4 fire potential) and <em>Typical Rx Burn Days</em> (gridMET 2016–2025: average days per month meeting a generic broadcast Rx — Tmax 40–80°F, RHmin 20–50%, wind ≤12 mph). Click a grid cell for all 12 months. For your own Rx and unit, use the Weather Evaluator page.</p>');
  LAY.layout_p2 = fixed([{ w: 'w_map2', bbox: pct(0, 0, 70, 100) }, { w: 'w_layers2', bbox: pct(70.5, 0, 29.5, 56) }, { w: 'w_legend2', bbox: pct(70.5, 56.5, 29.5, 28) }, { w: 'w_help2', bbox: pct(70.5, 85, 29.5, 15) }]);
  LAY.layout_map2 = { type: 'FIXED', order: [], content: {} };

  const page = (id, label, layout, isDefault) => ({ id, label, mode: 'FIT_WINDOW', type: 'NORMAL', layout: { LARGE: layout }, isDefault, isVisible: true, header: true, footer: false });
  return {
    exbVersion: v, mainSizeMode: 'LARGE', template: 'blankfullscreen', theme: 'themes/default/', mainLocale: 'en-us', attributes: { portalUrl },
    pages: { page_1: page('page_1', 'Weather Evaluator', 'layout_p1', true), page_3: page('page_3', 'Smoke Modeling', 'layout_p3', false), page_2: page('page_2', 'Outlooks & Typical Burn Days', 'layout_p2', false) },
    pageStructure: [{ page_1: [] }, { page_3: [] }, { page_2: [] }],
    layouts: LAY, widgets: W, sections: SEC, views: VIEWS, dialogs: {}, controllerPanels: {}, widgetsManifest: {},
    header: { layout: { LARGE: 'layout_header' }, height: { LARGE: 56 }, backgroundColor: '#0b3b63' }, footer: { layout: { LARGE: 'layout_footer' }, height: { LARGE: 0 } },
    dataSources: DS,
    utilities: { utility_1: { id: 'utility_1', type: 'GEOCODING', name: 'geocode', label: 'ArcGIS World Geocoding Service', url: 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer', source: 'org', index: 0 } },
    messageConfigs: MSG, customTheme: {}, permission: { restrictions: [] }, historyLabels: {}
  };
}
if (typeof module !== 'undefined') module.exports = { buildExb2 };
