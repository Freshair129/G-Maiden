import sys, json, subprocess, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'runtime/python'))
from PIL import Image
A=ROOT/'assets'
frames=sorted((A/'frames').glob('crest-*.png'))
assert len(frames)==90,len(frames)
for sheet in range(3):
    atlas=Image.new('RGBA',(3840,1600))
    for f in range(30):
        with Image.open(frames[sheet*30+f]) as im:
            atlas.paste(im,(f%6*640,f//6*320))
    atlas.save(A/f'atlas-{sheet}.png',optimize=True)
cmd=[r'C:\Program Files\FormatFactory\ffmpeg.exe','-hide_banner','-y','-framerate','30','-start_number','1','-i',str(A/'frames/crest-%04d.png'),'-c:v','libvpx-vp9','-pix_fmt','yuva420p','-crf','24','-b:v','0','-deadline','good','-cpu-used','4','-row-mt','1','-an',str(A/'crest.webm')]
with (ROOT/'encode.log').open('w') as log:subprocess.run(cmd,stdout=log,stderr=log,timeout=300,check=True)
files=[*A.glob('*.png'),A/'crest.webm',A/'mesh.json',A/'maiden-crest.blend']
manifest={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
manifest['decodedRGBAEstimates']={'layersBytes':4*640*320*4,'spriteBytes':90*640*320*4,'note':'Pixel buffer estimates only; excludes decoder, browser, GPU driver copies, mipmaps.'}
(ROOT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2))
print('Packaged',len(frames),'frames; WebM bytes:',(A/'crest.webm').stat().st_size)
