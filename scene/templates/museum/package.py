"""Regenerate template metadata, file hashes and the standalone delivery ZIP."""
from pathlib import Path
import hashlib, json, zipfile
root=Path(__file__).resolve().parent
read=lambda f:json.loads((root/f).read_text())
inspection=read('validation/model-inspection.json')
browser=read('validation/browser-validation.json')
assets=read('assets/catalogue.json')
if not inspection['allChecksPass']: raise SystemExit('Model checks must pass before packaging.')
if not browser['allChecksPass']: raise SystemExit('Browser checks must pass before packaging.')
data={
 'schemaVersion':1,'templateId':'art-gallery-space-between-sparse-v2','kind':'complete-scene-template','displayName':'留白之间 · 美术馆展区','status':'local-delivery',
 'model':{'path':'museum.glb','format':'glTF 2.0 binary','bytes':inspection['bytes'],'sha256':inspection['sha256'],'embeddedImages':inspection['embeddedImages'],'externalResources':len(inspection['externalResources'])},
 'dimensions':{'width':20,'depth':14,'floorArea':280,'units':'meters','upAxis':'+Y','basis':'Concept design; not surveyed','surveyedSize':None},
 'assumptions':{'visitors':3,'staff':1,'exhibition':'当代艺术主题展区','collection':'All artworks and installations are fictional, original examples; no real museum collection is represented'},
 'layers':['Museum_Architecture','Museum_Exhibition','Museum_Lighting','Museum_Visitors','Museum_Staff'],
 'capabilities':{'independentGlbLoad':True,'views':['overview','top','inside'],'rotateAndZoom':True,'wallToggle':True,'lightingRigToggle':True,'peopleToggle':True,'zoneLabels':True,'visitorCountControl':{'min':0,'max':36,'scope':'Changes schematic visitor visibility and preset positions only; fixtures remain fixed'},'phases':['setup','open','tour','closed'],'screenshotExport':True,'downloadGlbIsFixedDefaultSnapshot':True,'automaticFurnitureRelayout':False,'liveCrowdSimulation':False,'websiteMaterialLibraryConnected':False,'generationApiConnected':False},
 'provenance':{'authored':'Architecture, plinths, original abstract paintings, sculptures, signs, figures and lighting','props':assets['assets'],'notes':'ASSET-SOURCES.md'},
 'preview':{'page':'index.html','localUrl':'http://127.0.0.1:8775/','images':['previews/museum-overview.jpg','previews/museum-top.jpg','previews/museum-interior.jpg']},
 'validation':{'gltf':'validation/gltf-validation.json','inspection':'validation/model-inspection.json','phases':'validation/phase-layout-check.json','browser':'validation/browser-validation.json','summary':{**inspection['validator'],'nodes':inspection['nodeCount'],'meshInstances':inspection['meshInstances'],'triangleInstances':inspection['triangleInstances'],'visitors':inspection['visitors'],'staff':inspection['staff'],'worldBounds':inspection['worldBounds']},'limitations':'Static geometric proxy checks only; no on-site fire, load, accessibility, capacity or regulatory verification'},
 'integration':{'frontend':'Standalone local preview','backend':'Not registered','github':'Not pushed'},
}
(root/'template.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
files=sorted(p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name not in ('museum-template.zip','SHA256SUMS.txt') and not p.name.endswith('.tmp'))
(root/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(root).as_posix()+'\n' for p in files))
files.append(root/'SHA256SUMS.txt')
with zipfile.ZipFile(root/'museum-template.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for p in files: archive.write(p,'museum/'+p.relative_to(root).as_posix())
print(json.dumps({'zip':str(root/'museum-template.zip'),'bytes':(root/'museum-template.zip').stat().st_size,'files':len(files),'modelSha256':inspection['sha256']},ensure_ascii=False,indent=2))
