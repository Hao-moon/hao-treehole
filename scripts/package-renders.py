"""Encode generated Blender renders for the browser; no third-party image inputs."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.local/demo-renders'
for world in ['persona','ghostblade']:
    root=ROOT/'site/assets'/('scene' if world=='persona' else 'worlds/ghostblade')
    name='persona5-base' if world=='persona' else 'base'
    with Image.open(CACHE/(world+'.png')) as source:
        im=source.convert('RGB')
        for suffix,size in [('',im.size),('-medium',im.size),('-preview',(1280,720))]:
            im.resize(size,Image.Resampling.LANCZOS).save(root/(name+suffix+'.webp'),quality=90,method=6)
        if world=='persona':
            im.save(root/'persona5.webp',quality=90,method=6)
            im.resize((1280,720),Image.Resampling.LANCZOS).save(root/'persona5-preview.webp',quality=88)
    with Image.open(CACHE/(world+'-empty.png')) as source:
        scale=source.width/7680
        crop=source.crop(tuple(round(p*scale) for p in (1056,2400,2688,3360)))
        target=(ROOT/'site/assets/turntable') if world=='persona' else root
        crop.save(target/'empty-desktop-slot.webp',quality=94)
print('Browser backdrops packaged.')
