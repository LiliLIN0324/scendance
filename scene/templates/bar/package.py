"""Build the archive manifest, checksums and standalone ZIP after validation."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parent
read=lambda p:json.loads((root/p).read_text())
i=read('validation/model-inspection.json');b=read('validation/browser-validation.json')
if not i['allChecksPass'] or not b['allChecksPass']:raise SystemExit('Complete model and browser verification before packaging.')
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
data={
 'schemaVersion':1,'templateId':'bar-amber-room-12x9-v1','kind':'complete-scene-template','displayName':'琥珀间 · 酒吧','status':'local-ready',
 'model':{'path':'bar.glb','format':'glTF 2.0 binary','bytes':i['bytes'],'sha256':i['sha256'],'embeddedImages':i['embeddedImages'],'externalResources':len(i['externalResources'])},
 'dimensions':{'width':12,'depth':9,'height':i['rootMetadata'].get('designHeight',3.4),'floorArea':108,'units':'meters','upAxis':'+Y','basis':'Authored concept space; not a surveyed venue','surveyedSizeMeters':None,'sceneBounds':i['worldBounds'],'boundsMeaning':'Whole model bounds including roof/wall thickness, not net usable floor area'},
 'components':{'structure':'Bar_Structure','walls':'Bar_Walls','furniture':'Bar_Furniture','equipment':'Bar_Equipment','lighting':'Bar_Lighting','roof':'Bar_Roof','objectNaming':'Bar_Role_001; each inventory item is an independent named group'},
 'layers':['Bar_Structure','Bar_Furniture','Bar_Equipment','Bar_Lighting','Bar_Roof'],
 'counts':{'nodes':i['nodeCount'],'meshInstances':i['meshInstances'],'triangles':i['triangleInstances'],'materials':i['materials'],'textures':i['textures'],'editableObjects':i['inventoryObjects'],'objectsByRole':i['counts'],'people':0,'animations':0,'punctualLights':i['lighting']['punctualLights']},
 'inventory':i['inventory'],
 'capabilities':{'independentGlbLoad':True,'rotateAndZoom':True,'presetViews':['overview','top','inside'],'wallToggle':True,'roofToggle':True,'reconstructionSourceIncluded':True,'individuallyNamedFurnitureAndEquipment':True,'downloadGlbIsFixedCompleteScene':True,'people':False,'attendanceControl':False,'eventStages':False,'crowdSimulation':False,'automaticFurnitureRelayout':False,'generationApiConnected':False},
 'integration':{'frontend':'Standalone GLTFLoader preview at ./bar.glb; formal viewer not changed','backend':'Not registered or uploaded; serve.py exposes local static files only','suggestedFrontendPath':'scene/templates/bar/bar.glb','suggestedManifestPath':'scene/templates/bar/template.json','suggestedBackendStaticRoutes':['/scene/templates/bar/bar.glb','/scene/templates/bar/template.json'],'sceneWireSchema':'Archive metadata; not a replacement for the production backend Scene schema','singleMaterialAssetImportCompatible':False,'reason':'Complete multi-object scene; split and validate individual objects before single-material upload','github':'Not pushed','deployed':False},
 'provenance':{'authored':'All architecture, furniture, equipment, bottles, glassware, graphics and procedural textures','externalModelAssets':[],'referencePhotos':None,'generatedByExternalModelApi':False,'sourceNotes':'ASSET-SOURCES.md','assetCatalogue':'assets/catalogue.json','sources':[{'path':p,'sha256':sha(p)} for p in ['model.js','scene-kit.js']],'runtime':'Locally vendored Three.js with MIT license retained'},
 'preview':{'page':'index.html','localUrl':'http://127.0.0.1:8779/','images':['previews/bar-overview.jpg','previews/bar-top.jpg','previews/bar-interior.jpg']},
 'validation':{'gltfReport':'validation/gltf-validation.json','inspection':'validation/model-inspection.json','layoutReport':'validation/layout-check.json','browserReport':'validation/browser-validation.json','validator':i['validator'],'allChecksPass':True,'scope':'GLB format, named hierarchy, embedded textures, declared static footprints and browser interactions; not site building/fire/capacity certification'}
}
(root/'template.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
files=sorted(p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name not in ('bar-template.zip','SHA256SUMS.txt') and not p.name.endswith('.tmp'))
(root/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(root).as_posix()+'\n' for p in files));files.append(root/'SHA256SUMS.txt')
with zipfile.ZipFile(root/'bar-template.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in files:z.write(p,'bar/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(root/'bar-template.zip') as z:
 assert z.testzip() is None
 for line in z.read('bar/SHA256SUMS.txt').decode().splitlines():
  expected,path=line.split('  ',1);assert hashlib.sha256(z.read('bar/'+path)).hexdigest()==expected,path
print(json.dumps({'zip':str(root/'bar-template.zip'),'bytes':(root/'bar-template.zip').stat().st_size,'files':len(files),'allArchiveHashesVerified':True,'modelSha256':i['sha256']},indent=2))
