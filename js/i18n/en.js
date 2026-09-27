/**
 * i18n/en.js
 * ============================================================================
 * ENGLISH DICTIONARY
 *
 * Every key in `tr.js` (the fallback language) must exist here with the same
 * name. The parity check in `tools/test-i18n.js` enforces this — a key that
 * only exists in one language is a bug, not a cosmetic issue: it silently
 * shows Turkish text to an English user.
 *
 * WHAT DOES *NOT* BELONG HERE
 * ---------------------------
 *   - Values that depend on live data. `{count}` placeholders are fine, but do
 *     not build sentences here. Compose them with `t('key', { count })`.
 *   - Number / date formatting. Use `n()` and `pct()` from `format.js` so the
 *     separator, grouping and decimal marks follow the active locale instead
 *     of being frozen into a template.
 *   - Markup. The help modal is the one place that needs a little HTML; the
 *     interpolation escapes user values, but keys themselves are trusted.
 */

export default {
  /* =======================================================================
     APPLICATION
     ======================================================================= */
  'app.title': 'Three.js Map Editor — 3D Level Editor',
  'app.brand.title': 'Map Editor',
  'app.brand.sub': 'Three.js Level Studio',
  'app.noscript': 'This editor requires JavaScript.',
  'app.webgl.missing.title': 'WebGL is not supported',
  'app.webgl.missing.body':
    'This editor uses three.js (WebGL). Please try again with an up-to-date ' +
    'browser and hardware acceleration enabled.',
  'app.boot.info': 'A 3D level editor built with three.js  ·  JSON import/export  ·  press "?" for help',

  /* =======================================================================
     LANGUAGE SELECTOR
     ======================================================================= */
  'lang.label': 'Language',
  'lang.tr': 'Türkçe',
  'lang.en': 'English',
  'lang.short.tr': 'TR',
  'lang.short.en': 'EN',

  /* =======================================================================
     TOP BAR
     ======================================================================= */
  'topbar.group.mapsize': 'Map Size',
  'topbar.group.cell': 'Cell',
  'topbar.group.view': 'View',
  'topbar.cell.title': 'Grid cell size (units)',
  'topbar.aria.mapsize': 'Map size',
  'topbar.aria.mode': 'Transform mode',
  'topbar.aria.space': 'Space',

  'topbar.view.grid': 'Grid',
  'topbar.view.grid.title': 'Grid (G)',
  'topbar.view.axes': 'Axes',
  'topbar.view.axes.title': 'Axes (A)',
  'topbar.view.bounds': 'Bounds',
  'topbar.view.bounds.title': 'Map bounds (B)',
  'topbar.view.checker': 'Texture',
  'topbar.view.checker.title': 'Ground texture',
  'topbar.view.snap': 'Snap',
  'topbar.view.snap.title': 'Snap to grid (X)',

  'topbar.btn.undo': 'Undo',
  'topbar.btn.undo.title': 'Undo (Ctrl+Z)',
  'topbar.btn.redo': 'Redo',
  'topbar.btn.redo.title': 'Redo (Ctrl+Y)',
  'topbar.btn.play': 'Preview',
  'topbar.btn.play.title': 'Game preview (Space)',
  'topbar.btn.play.stop.title': 'Stop preview (Space)',
  'topbar.btn.new': 'New',
  'topbar.btn.new.title': 'New map',
  'topbar.btn.save': 'Save',
  'topbar.btn.save.title': 'Save to browser (Ctrl+S)',
  'topbar.btn.load': 'Restore',
  'topbar.btn.load.title': 'Load from browser',
  'topbar.btn.export': 'Export JSON',
  'topbar.btn.export.title': 'Export as JSON',
  'topbar.btn.import': 'Import',
  'topbar.btn.import.title': 'Load a JSON project · .npy heightmap · .smd model (Ctrl+O)',
  'topbar.btn.help.title': 'Help / shortcuts (?)',

  'topbar.undo.with': 'Undo: {ad}',
  'topbar.redo.with': 'Redo: {ad}',

  /* =======================================================================
     VIEWPORT TOOLBOX
     ======================================================================= */
  'vp.mode.translate': 'Move',
  'vp.mode.translate.title': 'Move (G / W)',
  'vp.mode.rotate': 'Rotate',
  'vp.mode.rotate.title': 'Rotate (R / E)',
  'vp.mode.scale': 'Scale',
  'vp.mode.scale.title': 'Scale (T / S)',
  'vp.space.world': 'World',
  'vp.space.world.title': 'World space',
  'vp.space.local': 'Local',
  'vp.space.local.title': 'Local space',
  'vp.rotSnap.title': 'Rotation step (degrees)',

  'vp.btn.focus': 'Focus',
  'vp.btn.focus.title': 'Focus on selection (F)',
  'vp.btn.frameAll': 'Frame All',
  'vp.btn.frameAll.title': 'Frame the whole map (Home)',
  'vp.btn.topView': 'Top',
  'vp.btn.topView.title': 'Top-down view (7)',

  'vp.hint.mouse':
    'Left click: select · Shift+Left click: multi-select · Right drag: orbit · ' +
    'Middle drag: pan · Wheel: zoom',
  'vp.dropHint': 'Drop: .npy terrain · .smd / .glb model · .json project',

  /* =======================================================================
     PANEL HEADINGS
     ======================================================================= */
  'panel.assets': 'Asset Panel',
  'panel.outliner': 'Outliner',
  'panel.inspector': 'Properties',
  'panel.map': 'Map Settings',

  /* =======================================================================
     ASSET PANEL
     ======================================================================= */
  'asset.search.placeholder': 'Search assets (cube, tree, fence, torch…)',
  'asset.search.aria': 'Search assets',
  'asset.hint.before': 'To add to the scene,',
  'asset.hint.action': 'click',
  'asset.hint.or': 'or',
  'asset.hint.action2': 'drag and drop',
  'asset.hint.after': '.',

  'asset.count.one': '{count} asset',
  'asset.count': '{count} assets',
  'asset.count.library.one': '{count} asset · {kitap} libraries',
  'asset.count.library': '{count} assets · {kitap} libraries',
  'asset.count.zero': '0 assets',
  'asset.empty': 'No matching assets found.',
  'asset.more.one': '… show {count} more model',
  'asset.more': '… show {count} more models',
  'asset.cat.count': '{label} · {count}',
  'asset.cat.first': '{label} · {count} (first {gosterilen})',

  'asset.tip.static': '{ad}\nSize: {olcu}\nClick: add · Drag: place',
  'asset.tip.triangles.one': '{count} triangle',
  'asset.tip.triangles': '{count} triangles',
  'asset.tip.action': 'Click: add · Drag: place',
  'asset.tip.kat': 'Category',
  'asset.tip.ucgen': 'Triangles',
  'asset.tip.kose': 'Vertices',
  'asset.tip.mesh': 'Meshes',
  'asset.tip.boyut': 'Size',
  'asset.tip.doku': 'Textures',
  'asset.tip.animasyon': 'Animations',
  'asset.tip.kemik': 'Bones',
  'asset.tip.ktx2': 'KTX2 texture (Basis)',
  'asset.tip.meshopt': 'Meshopt compression',
  'asset.tip.nothumb': 'No preview (fallback icon used)',
  'asset.tip.warn': '⚠ {not}',
  'asset.unit.mb': '{size} MB',
  'asset.unit.kb': '{size} KB',

  /* --- asset categories -------------------------------------------------- */
  'asset.cat.basic': 'Basic Geometry',
  'asset.cat.nature': 'Nature',
  'asset.cat.structure': 'Structure & Decor',
  'asset.cat.game': 'Game Objects',
  'asset.cat.light': 'Light & Camera',
  'asset.cat.imported': 'Imported',

  /* --- asset names ------------------------------------------------------- */
  'asset.name.cube': 'Cube',
  'asset.name.box': 'Box',
  'asset.name.sphere': 'Sphere',
  'asset.name.cylinder': 'Cylinder',
  'asset.name.cone': 'Cone',
  'asset.name.torus': 'Torus',
  'asset.name.plane': 'Plane',
  'asset.name.stairs': 'Stairs',
  'asset.name.tree': 'Tree',
  'asset.name.pine': 'Pine',
  'asset.name.bush': 'Bush',
  'asset.name.rock': 'Rock',
  'asset.name.mountain': 'Mountain',
  'asset.name.water': 'Water',
  'asset.name.house': 'House',
  'asset.name.tower': 'Tower',
  'asset.name.wall': 'Wall',
  'asset.name.platform': 'Platform',
  'asset.name.bridge': 'Bridge',
  'asset.name.crate': 'Crate',
  'asset.name.barrel': 'Barrel',
  'asset.name.fence': 'Fence',
  'asset.name.torch': 'Torch',
  'asset.name.npc': 'NPC',
  'asset.name.playerSpawn': 'Player Spawn',
  'asset.name.npcSpawn': 'NPC Spawn',
  'asset.name.waypoint': 'Waypoint',
  'asset.name.trigger': 'Trigger',
  'asset.name.portal': 'Portal',
  'asset.name.pickup': 'Pickup',
  'asset.name.chest': 'Chest',
  'asset.name.barrier': 'Barrier',
  'asset.name.cameraMarker': 'Camera Marker',
  'asset.name.pointLight': 'Point Light',
  'asset.name.spotLight': 'Spot Light',
  'asset.name.ambientLight': 'Ambient Light',
  'asset.name.terrain': 'Terrain',
  'asset.name.importedMesh': 'Imported Mesh',
  'asset.name.importedLib': 'External Model',

  /* =======================================================================
     INSPECTOR
     ======================================================================= */
  'inspector.chip.none': 'No selection',
  'inspector.chip.count.one': '{count} object',
  'inspector.chip.count': '{count} objects',

  'inspector.empty.title': 'Nothing selected',
  'inspector.empty.body':
    'Click an object in the scene, or add one from the asset panel on the ' +
    'left. Position, rotation, scale and gameplay fields of the selected ' +
    'object are edited here.',

  'inspector.type.multi': 'Multiple selection',
  'inspector.type.external': 'External model · {kategori}',
  'inspector.type.category': 'library',
  'inspector.sub.count.one': '{count} different object',
  'inspector.sub.count': '{count} different objects',

  'inspector.group.transform': 'Transform',
  'inspector.group.appearance': 'Appearance',
  'inspector.group.props': 'Gameplay Fields',
  'inspector.group.info': 'Object Info',

  'inspector.field.name': 'Name',
  'inspector.field.tag': 'Tag',
  'inspector.field.position': 'Position',
  'inspector.field.rotation': 'Rotation (°)',
  'inspector.field.scale': 'Scale',
  'inspector.field.color': 'Colour',
  'inspector.field.castShadow': 'Cast Shadow',
  'inspector.field.receiveShadow': 'Receive Shadow',
  'inspector.axis.title': '{axis} axis',

  'inspector.btn.reset': 'Reset',
  'inspector.btn.snapGround': 'Drop to Ground',
  'inspector.btn.focus': 'Focus',
  'inspector.btn.hide': 'Hide',
  'inspector.btn.show': 'Show',
  'inspector.btn.lock': 'Lock',
  'inspector.btn.unlock': 'Unlock',
  'inspector.btn.duplicate': 'Duplicate',
  'inspector.btn.delete': 'Delete',
  'inspector.btn.npcJump': 'Jump to Nearest Waypoint',

  'inspector.placeholder.auto': 'auto',
  'inspector.mixed.one': '{count} object',
  'inspector.mixed': '{count} objects',

  'inspector.info.type': 'Type',
  'inspector.info.category': 'Category',
  'inspector.info.role': 'Role',
  'inspector.info.worldPos': 'World Position',
  'inspector.info.footprint': 'Base Size',
  'inspector.info.id': 'ID',
  'inspector.info.external': 'External model · {bicim}',
  'inspector.info.measuring': 'measuring…',
  'inspector.info.heightOnly': 'y = {yukseklik} units',

  'inspector.history.transform': 'transform',
  'inspector.history.color': 'colour',

  'role.prop': 'prop',
  'role.actor': 'actor',
  'role.marker': 'marker',
  'role.zone': 'zone',
  'role.light': 'light',
  'role.item': 'item',

  /* =======================================================================
     OUTLINER
     ======================================================================= */
  'outliner.btn.selectAll': 'All',
  'outliner.btn.selectAll.title': 'Select all (Ctrl+A)',
  'outliner.btn.delete': 'Delete',
  'outliner.btn.delete.title': 'Delete selection (Del)',
  'outliner.empty.title': 'Scene is empty',
  'outliner.empty.body':
    'Pick an object from the asset panel on the left, or drag one onto the map.',
  'outliner.btn.visible.title': 'Visibility',
  'outliner.btn.hide': 'Hide',
  'outliner.btn.show': 'Show',
  'outliner.btn.lock': 'Lock',
  'outliner.btn.unlock': 'Unlock',

  /* =======================================================================
     MAP SETTINGS PANEL
     ======================================================================= */
  'map.field.size': 'Size (units)',
  'map.field.groundColor': 'Ground colour',
  'map.field.gridColor': 'Grid colour',
  'map.field.fog': 'Opacity',

  'map.stat.size': 'Size',
  'map.stat.cells': 'Cells',
  'map.stat.objects': 'Objects',
  'map.stat.spawns': 'NPCs / Markers',

  /* =======================================================================
     STATUS BAR
     ======================================================================= */
  'status.objects': 'Objects: {count}',
  'status.selection': 'Selection: {count}',
  'status.hover': 'Hovering: {ad}',
  'status.playing': 'PREVIEW',
  'status.fps': '{fps} fps',
  'status.pointer.empty': 'x: -  y: -  z: -',

  /* =======================================================================
     MODAL (generic)
     ======================================================================= */
  'modal.close': 'Close',
  'modal.close.title': 'Close',
  'modal.cancel': 'Cancel',
  'modal.confirm': 'Confirm',

  /* =======================================================================
     MAP SIZE DIALOG
     ======================================================================= */
  'mapsize.title': 'Map size {size}',
  'mapsize.toast': 'Map size set to {size} units · {etiket}',
  'mapsize.label.keep': 'Keep layout',
  'mapsize.label.scale': 'Scale',
  'mapsize.label.clear': 'Clear',
  'mapsize.label.change': 'Change',
  'mapsize.desc.keep': 'Objects stay at the same coordinates; only the map bounds change.',
  'mapsize.desc.scale': 'All objects are scaled by {oran}x.',
  'mapsize.desc.clear': 'All objects are deleted, leaving an empty map.',
  'mapsize.desc.change': 'Create a new {size}-unit map.',
  'mapsize.warn.empty': 'The scene is empty — the change will be applied directly.',
  'mapsize.body.count.one': 'There is {count} object in the scene.',
  'mapsize.body.count': 'There are {count} objects in the scene. What should happen to the current layout when switching to the new size?',
  'mapsize.body.empty': 'The scene is empty; the new size can be applied directly.',
  'mapsize.result.keep': 'layout kept',
  'mapsize.result.scale': 'layout scaled',
  'mapsize.result.clear': 'scene cleared',

  /* =======================================================================
     JSON EXPORT / IMPORT
     ======================================================================= */
  'export.title': 'Export JSON',
  'export.opt.compact': 'Metadata + preview only (recommended)',
  'export.opt.compact.desc':
    'Terrain data is reduced to a 64×64 preview; .smd models are stored as ' +
    'source text. The file stays small.',
  'export.opt.full': 'Embed raw heightmaps too',
  'export.opt.full.desc':
    'All .npy data is written as base64 — lossless, but the file can get large.',
  'export.cancel': 'Cancel',
  'import.title': 'Import JSON',
  'import.ok.one': '{count} object loaded',
  'import.ok': '{count} objects loaded',
  'import.failed.one': '{count} file could not be loaded: {adlar}',
  'import.failed': '{count} files could not be loaded: {adlar}',
  'import.restore.one': '{count} imported asset restored',
  'import.restore': '{count} imported assets restored',
  'import.restore.degraded.one': '{count} asset used a preview because data was missing',
  'import.restore.degraded': '{count} assets used a preview because data was missing',
  'import.ok.title': 'Project loaded',
  'import.ok.body.one': '{count} object placed in the scene. {not}',
  'import.ok.body': '{count} objects placed in the scene. {not}',
  'import.confirm': 'Load',
  'import.confirm.body.one':
    '“{ad}” will be loaded: {count} object, a {boyut}-unit map. Your ' +
    'current {mevcut} objects will be deleted.',
  'import.confirm.body':
    '“{ad}” will be loaded: {count} objects, a {boyut}-unit map. Your ' +
    'current {mevcut} objects will be deleted.',
  'import.cancel': 'Cancel',

  /* =======================================================================
     SAVE / RESTORE / NEW
     ======================================================================= */
  'save.ok': 'Saved to browser storage',
  'save.fail': 'Could not save: browser storage may be full',
  'load.notFound': 'No saved map found',
  'load.corrupt': 'Save data is corrupt',
  'load.ok': 'Saved map loaded',
  'load.restored': 'Last session restored',
  'new.title': 'New map',
  'new.body':
    'Every object in the scene will be deleted and an empty 2048-unit map will be created.',
  'new.ok': 'New map created',
  'new.confirm': 'New Map',
  'new.cancel': 'Cancel',

  /* =======================================================================
     HELP & SHORTCUTS
     ======================================================================= */
  'help.title': 'Help & Shortcuts',
  'help.sec.keys': 'Keyboard',
  'help.sec.mouse': 'Mouse',
  'help.sec.formats': 'Import Formats',
  'help.sec.terrain': 'Terrain (.npy)',
  'help.sec.model': 'Model (.smd)',
  'help.sec.external': 'External Data',
  'help.sec.json': 'JSON Structure',

  'help.key.g': 'Move mode',
  'help.key.r': 'Rotate mode',
  'help.key.t': 'Scale mode',
  'help.key.q': 'Toggle World / Local space',
  'help.key.x': 'Snap to grid',
  'help.key.f': 'Focus on selection',
  'help.key.home': 'Frame the whole map',
  'help.key.7': 'Top-down view',
  'help.key.h': 'Toggle panels',
  'help.key.space': 'Game preview',
  'help.key.del': 'Delete selected objects',
  'help.key.ctrld': 'Duplicate',
  'help.key.ctrla': 'Select all',
  'help.key.ctrlz': 'Undo',
  'help.key.ctrls': 'Save to browser',
  'help.key.ctrle': 'Export JSON',
  'help.key.ctrlo': 'Import a file (.json / .npy / .smd)',
  'help.key.esc': 'Clear selection',
  'help.key.slash': 'Search assets',
  'help.key.ctrly': 'Redo',

  'help.mouse.left': 'Select object',
  'help.mouse.shift': 'Multi-select',
  'help.mouse.orbit': 'Orbit camera',
  'help.mouse.pan': 'Pan',
  'help.mouse.zoom': 'Zoom in',
  'help.mouse.scrub': 'Change the value by dragging',
  'help.mouse.assetDrag': 'Drop onto the map',
  'help.mouse.fileDrag': 'Load .npy / .smd / .json',

  'help.fmt.json': 'Project file (replaces the scene)',
  'help.fmt.npy': 'NumPy heightmap → Terrain',
  'help.fmt.smd': 'Valve Source model → BufferGeometry',
  'help.fmt.glb': '3D model → Meshopt + KTX2 supported',

  'help.terrain.body':
    'The height field is normalised to the 0..1 range and written to the mesh ' +
    'vertices (bilinear sampling). Height Scale, Segments, Terrain Size, the ' +
    'colour ramp and contour settings live in the Inspector.',
  'help.model.body':
    'Triangle/vertex/normal/UV blocks are parsed. Because the source text is ' +
    'kept in the cache, an embedded model is reproduced losslessly.',

  'help.ext.cached': 'Cached content',
  'help.ext.terrain': 'Terrain',
  'help.ext.model': 'Model',

  /* =======================================================================
     NOTIFICATIONS & ERRORS
     ======================================================================= */
  'msg.deleted.one': '{count} object deleted',
  'msg.deleted': '{count} objects deleted',
  'msg.deleted.locked': '{count} locked skipped',
  'msg.locked.delete': 'Locked objects cannot be deleted',
  'msg.asset.unknown': 'Unknown asset: {id}',
  'msg.asset.added': '{ad} added ({x}, {z})',
  'msg.library.missing': 'Model not found in the library: {id}',
  'msg.library.nomesh':
    '"{ad}" contains no mesh (animation data only) — an invisible object was added.',
  'msg.terrain.flat': 'Warning: the heightmap is flat (all values identical). A flat terrain was created.',
  'msg.terrain.nan.one': '{count} invalid value (NaN/Inf) found and counted as 0.',
  'msg.terrain.nan': '{count} invalid values (NaN/Inf) found and counted as 0.',
  'msg.grid.flat': 'Warning: the grid is flat (all values identical). A flat terrain was created.',
  'msg.grid.nan.one': '{count} invalid value (NaN) found and counted as 0.',
  'msg.grid.nan': '{count} invalid values (NaN) found and counted as 0.',
  'msg.preview.noNpc': 'Add at least one NPC to the scene to use the preview',
  'msg.npc.moved': '{ad} moved to the nearest waypoint',
  'msg.npc.noWaypoint': 'No waypoint found within the radius',
  'msg.file.unreadable': 'File could not be read',
  'msg.webgl.lost': 'WebGL context lost, please reload the page',
  'msg.model.failed': '{ad}: {hata}',
  'msg.i18n.missing': 'Missing translation key: {anahtar}',

  /* --- import / export reports ------------------------------------------- */
  'msg.gltf.loaded': '{ad} loaded · {ucgen} triangles · {mesh} meshes · {kb} KB',
  'msg.gltf.anim.one': ' · {count} animation',
  'msg.gltf.anim': ' · {count} animations',
  'msg.terrain.created': 'Terrain created: {genislik}×{yukseklik} → {bolum}² segments',
  'msg.smd.loaded': 'Model loaded: {ad} · {ucgen} triangles, {kose} vertices, {grup} groups',
  'msg.warn.count.one': ' · {count} warning',
  'msg.warn.count': ' · {count} warnings',
  'msg.bgrid.read': 'Binary grid read: {coz}×{coz} → {bolum}² segments',
  'msg.bgrid.skipped': ' · {mb} MB not read',
  'msg.exported.one': '{count} object exported ({kb} KB)',
  'msg.exported': '{count} objects exported ({kb} KB)',
  'msg.exported.embedded.one': ' · {count} asset embedded',
  'msg.exported.embedded': ' · {count} assets embedded',
  'msg.exported.preview.one': ' · {count} asset as preview',
  'msg.exported.preview': ' · {count} assets as preview',
  'msg.saved.withSize': 'Saved to browser storage ({kb} KB)',
  'msg.saved.previewOnly.one': ' · {count} asset as preview only',
  'msg.saved.previewOnly': ' · {count} assets as preview only',
  'msg.library.missingManifest.one':
    '{count} external model not found in the library (the manifest may be ' +
    'missing: node tools/scan-assets.mjs).',
  'msg.library.missingManifest':
    '{count} external models not found in the library (the manifest may be ' +
    'missing: node tools/scan-assets.mjs).',
  'msg.library.sessionOnly.one':
    '{count} model was only valid for this session (the file was not copied ' +
    'to the server). Drag the file onto the viewport to load it again.',
  'msg.library.sessionOnly':
    '{count} models were only valid for this session (the file was not copied ' +
    'to the server). Drag the file onto the viewport to load it again.',
  'msg.project.invalid': 'Invalid project file.',

  /* =======================================================================
     INSPECTOR FIELD LABELS  ·  prop.<assetId>.<schemaKey>
     -----------------------------------------------------------------------
     Keys are qualified by ASSET ID, not by field name alone.

     WHY? `waypoint.radius` is "Radius" but `portal.radius` is "Activation
     Radius"; `torch.intensity` is "Intensity" but `spotLight.penumbra` is
     "Softness". Deduplicating by field name either collides or shows the
     wrong text under a misleading key. This block MUST match the
     normalisation pass in `catalog.js`, which stamps
     `labelKey = prop.<assetId>.<key>` onto every `propsSchema` entry.
     ======================================================================= */

  /* --- Water ------------------------------------------------------------- */
  'prop.water.wave': 'Wave Speed',
  'prop.water.deepColor': 'Deep Colour',

  /* --- Torch ------------------------------------------------------------- */
  'prop.torch.intensity': 'Intensity',
  'prop.torch.distance': 'Range',

  /* --- NPC --------------------------------------------------------------- */
  'prop.npc.npcName': 'NPC Name',
  'prop.npc.role': 'Role',
  'prop.npc.speed': 'Speed',
  'prop.npc.health': 'Health',
  'prop.npc.patrolRadius': 'Patrol Radius',
  'prop.npc.autoPatrol': 'Auto Patrol',
  'prop.npc.loopPatrol': 'Loop Waypoints',
  'propopt.npc.role.neutral': 'Neutral',
  'propopt.npc.role.friendly': 'Friendly',
  'propopt.npc.role.enemy': 'Hostile',
  'propopt.npc.role.merchant': 'Merchant',
  'propopt.npc.role.quest': 'Quest Giver',

  /* --- Player Spawn ------------------------------------------------------ */
  'prop.playerSpawn.playerIndex': 'Player Index',
  'prop.playerSpawn.yaw': 'Yaw (°)',
  'prop.playerSpawn.team': 'Team',

  /* --- NPC Spawn --------------------------------------------------------- */
  'prop.npcSpawn.spawnType': 'Type',
  'prop.npcSpawn.count': 'Count',
  'propopt.npcSpawn.spawnType.guard': 'Guard',
  'propopt.npcSpawn.spawnType.villager': 'Villager',
  'propopt.npcSpawn.spawnType.enemy': 'Hostile',
  'propopt.npcSpawn.spawnType.animal': 'Animal',

  /* --- Waypoint ---------------------------------------------------------- */
  'prop.waypoint.order': 'Order',
  'prop.waypoint.pause': 'Pause (s)',
  'prop.waypoint.radius': 'Radius',

  /* --- Trigger ----------------------------------------------------------- */
  'prop.trigger.action': 'Trigger Event',
  'prop.trigger.once': 'Fire Once',
  'prop.trigger.target': 'Target Object Name',
  'propopt.trigger.action.onEnter': 'On Enter',
  'propopt.trigger.action.onExit': 'On Exit',
  'propopt.trigger.action.teleport': 'Teleport',
  'propopt.trigger.action.damage': 'Damage',
  'propopt.trigger.action.dialogue': 'Dialogue',

  /* --- Portal ------------------------------------------------------------ */
  'prop.portal.destination': 'Target Scene',
  'prop.portal.radius': 'Activation Radius',
  'prop.portal.bidirectional': 'Bidirectional',

  /* --- Pickup ------------------------------------------------------------ */
  'prop.pickup.itemId': 'Item Code',
  'prop.pickup.amount': 'Amount',
  'prop.pickup.respawn': 'Respawns',

  /* --- Chest ------------------------------------------------------------- */
  'prop.chest.lootTable': 'Loot Table',
  'prop.chest.locked': 'Locked',

  /* --- Barrier ----------------------------------------------------------- */
  'prop.barrier.autoBreak': 'Auto Break',
  'prop.barrier.hp': 'Durability',

  /* --- Camera Marker ----------------------------------------------------- */
  'prop.cameraMarker.fov': 'FOV',
  'prop.cameraMarker.dolly': 'Smoothing',
  'prop.cameraMarker.active': 'Active',

  /* --- Point Light ------------------------------------------------------- */
  'prop.pointLight.intensity': 'Intensity',
  'prop.pointLight.distance': 'Range',
  'prop.pointLight.decay': 'Decay',
  'prop.pointLight.lightColor': 'Light Colour',

  /* --- Spot Light -------------------------------------------------------- */
  'prop.spotLight.intensity': 'Intensity',
  'prop.spotLight.distance': 'Range',
  'prop.spotLight.angle': 'Angle (°)',
  'prop.spotLight.penumbra': 'Softness',

  /* --- Ambient Light ----------------------------------------------------- */
  'prop.ambientLight.intensity': 'Intensity',
  'prop.ambientLight.lightColor': 'Light Colour',

  /* --- Terrain ----------------------------------------------------------- */
  'prop.terrain.source': 'Source File',
  'prop.terrain.heightMode': 'Height Mode',
  'prop.terrain.heightBase': 'Reference Plane',
  'prop.terrain.heightScale': 'Height Scale',
  'prop.terrain.flipRows': 'Flip Rows',
  'prop.terrain.terrainSize': 'Terrain Size',
  'prop.terrain.segments': 'Segments (per axis)',
  'prop.terrain.waterLevel': 'Water Level (blank = auto)',
  'prop.terrain.beachWidth': 'Shore Band (units)',
  'prop.terrain.waterColor': 'Water Colour',
  'prop.terrain.sandColor': 'Shore / Sand Colour',
  'prop.terrain.lowColor': 'Low Colour',
  'prop.terrain.midColor': 'Mid Colour',
  'prop.terrain.highColor': 'High Colour',
  'prop.terrain.peakColor': 'Peak Colour',
  'prop.terrain.contourStep': 'Contour Step',
  'prop.terrain.wireframe': 'Wireframe',
  'prop.terrain.flatShading': 'Flat Shading',
  'propopt.terrain.heightMode.absolute': 'Absolute (world units)',
  'propopt.terrain.heightMode.normalized': 'Normalised (compressed 0-1)',

  /* --- Imported Mesh ----------------------------------------------------- */
  'prop.importedMesh.source': 'Source File',
  'prop.importedMesh.modelName': 'Model Name',
  'prop.importedMesh.triangles': 'Triangles',
  'prop.importedMesh.vertexCount': 'Vertices',
  'prop.importedMesh.groupCount': 'Groups',
  'prop.importedMesh.boneCount': 'Bone Weights',
  'prop.importedMesh.convertSource': 'Source Coordinate System',

  /* --- External Model (shared library schema) --------------------------- */
  'prop.importedLib.source': 'Source File',
  'prop.importedLib.kitapKategori': 'Library Category',
  'prop.importedLib.bicim': 'Format',
  'prop.importedLib.ucgen': 'Triangles',
  'prop.importedLib.kose': 'Vertices',
  'prop.importedLib.doku': 'Textures',
  'prop.importedLib.animasyon': 'Animations',
  'prop.importedLib.yukseklik': 'Measured Height',
  'prop.importedLib.boyut': 'File Size (bytes)',
  'prop.importedLib.hedefYukseklik': 'Target Height (0 = 1:1)',
  'prop.importedLib.tabanDuzelt': 'Sit on Ground',
  'prop.importedLib.not': 'Note',
};
