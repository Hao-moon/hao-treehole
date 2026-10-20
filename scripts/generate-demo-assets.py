"""Generate original geometric demo textures, a synth loop and a lighting probe.

Requires Python 3.10+ and Pillow. No downloaded artwork, samples or fonts.
The rendered text uses a local font; font files are never copied or distributed.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, random, struct, wave, shutil

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'site/assets'; TEX=ROOT/'blender/textures';TEX.mkdir(parents=True,exist_ok=True)
def font(size):
    candidates=['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/System/Library/Fonts/Helvetica.ttc']
    for p in candidates:
        if Path(p).exists():return ImageFont.truetype(p,size)
    return ImageFont.load_default(size=size)
def save(im,p):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);im.save(p)
def card(title,subtitle,size=(960,540),dark=False,accent='#d32142'):
    w,h=size; bg='#172b2b' if dark else '#eee9dd'; fg='#eee9dd' if dark else '#172425'
    im=Image.new('RGB',size,bg);d=ImageDraw.Draw(im)
    d.rectangle((18,18,w-19,h-19),outline=fg,width=3)
    d.rectangle((36,36,w-37,47),fill=accent)
    s=min(int(w/max(6,len(title))*.9),int(h*.24));s=max(18,s)
    d.text((w*.07,h*.30),title,font=font(s),fill=fg)
    d.text((w*.07,h*.76),subtitle,font=font(max(12,int(h*.046))),fill=fg)
    d.line((w*.07,h*.68,w*.91,h*.68),fill=fg,width=2)
    return im
def wallpaper(kind='sun',size=(1600,900)):
    w,h=size; im=Image.new('RGB',size);d=ImageDraw.Draw(im)
    a,b=((33,63,69),(211,218,193)) if kind=='sun' else ((20,21,30),(111,25,46))
    for y in range(h):
        t=y/h;d.line((0,y,w,y),fill=tuple(int(a[i]*(1-t)+b[i]*t) for i in range(3)))
    d.ellipse((w*.62,h*.13,w*.86,h*.56),fill='#f8e3b6' if kind=='sun' else '#ef355a')
    colors=['#8daba5','#4c7376','#274f59'] if kind=='sun' else ['#762a43','#40273c','#191f2e']
    for n,col in enumerate(colors):
        points=[(0,h)]
        for x in range(0,w+1,20):points.append((x,int(h*(.53+n*.13)+math.sin(x/w*8+n)*h*.09)))
        points.append((w,h));d.polygon(points,fill=col)
    d.text((w*.07,h*.13),'AFTER HOURS' if kind=='night' else 'SLOW DAYS',font=font(int(w*.047)),fill='#f5ecda')
    d.text((w*.07,h*.24),'A SMALL PLACE TO KEEP WHAT MATTERS',font=font(int(w*.012)),fill='#d3d9ca')
    return im

for world,root,accent,dark in [('persona',ASSETS/'scene','#e91b42',False),('ghostblade',ASSETS/'worlds/ghostblade','#a28e61',True)]:
    specs={'mission-profile.png':('HAO / 01','READ / LISTEN / COLLECT',(1520,780),False),
      'board-gallery.png':('AFTER HOURS','PHOTOGRAPHS / 01',(1060,1360),True),
      'board-projects.png':('IN PROGRESS','PROJECT FILES / 02',(1280,1280),dark),
      'board-links.png':('ELSEWHERE','SAVED LINKS / INSPIRATION',(2280,460),False),
      'board-quotes.png':('WORDS TO KEEP','CLIPPINGS / PERSONAL',(2000,540),False),
      'book-cover.png':('H / 02','READING / AFTER HOURS',(960,1280),True)}
    for name,(title,sub,size,is_dark) in specs.items():save(card(title,sub,size,is_dark,accent),root/name)
    if world=='persona':
        for name in specs:shutil.copyfile(root/name,TEX/('book-symbol.png' if name=='book-cover.png' else name))
    save(wallpaper('sun'),ASSETS/'worlds/ghostblade/daylight-screen.png')
save(wallpaper('sun',(1060,1360)),ASSETS/'worlds/ghostblade/city-study.png')
save(wallpaper('night'),ASSETS/'screens/night-wallpaper.png')
save(wallpaper('sun'),ASSETS/'screens/hills-wallpaper.png')
save(card('ORBIT / 02','AN ORIGINAL GEOMETRIC STUDY',(1600,900),True),ASSETS/'screens/orbit-wallpaper.png')
save(wallpaper('night'),TEX/'screen.png')
save(wallpaper('night'),ASSETS/'scene/screen.png')
for name,title in [('handheld-screen.png','CONTINUE'),('cartridge-0.png','01'),('cartridge-1.png','02'),('pilot-card.png','H / 02'),('figure-number.png','01')]:
    save(card(title,'PERSONAL COLLECTION',(800,500),True),TEX/name)
for name,title in [('orbit','ORBIT LETTER'),('afterhours','AFTER HOURS')]:save(card(title,'DEMO COLLECTION',(600,800),True),ASSETS/f'games/{name}.png')
icon=Image.new('RGBA',(256,256),(0,0,0,0));d=ImageDraw.Draw(icon);d.ellipse((12,12,244,244),fill='#c91d3c');d.ellipse((58,58,198,198),outline='#eee9dd',width=12);d.ellipse((111,111,145,145),fill='#eee9dd')
save(icon,ASSETS/'scene/mask-icon.png');save(icon,ASSETS/'turntable/orbit-decal.png')
city=Image.new('RGB',(256,1024),'#151821');d=ImageDraw.Draw(city);rng=random.Random(8)
for y in range(16,1024,46):
    for x in range(12,256,37):
        if rng.random()>.26:d.rectangle((x,y,x+8,y+28),fill='#dad7c9')
save(city,TEX/'city.png')
save(Image.new('RGB',(64,64),'#c61135'),TEX/'sky.png')
# Self-contained mellow additive synthesis, no sampled/commercial music.
rate=22050;duration=24;pcm=bytearray()
for i in range(rate*duration):
    t=i/rate
    envelope=math.sin(math.pi*t/duration)**2
    sample=sum(math.sin(2*math.pi*f*t+math.sin(t*.21+j)*.12)/(j+2) for j,f in enumerate([130.8128,196,261.6256,329.6276]))*.13*envelope
    pcm+=struct.pack('<h',max(-32767,min(32767,round(sample*32767))))
path=ASSETS/'audio/room-tone.wav';path.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(path),'wb') as out:out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate);out.writeframes(pcm)
# Original neutral sky/ground radiance; ordinary RGBE (no borrowed HDRI).
path=ASSETS/'worlds/ghostblade/room-environment.hdr';out=bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n')
for y in range(32):
    for x in range(64):
        t=y/31;v=[.45*(1-t)+.08*t,.55*(1-t)+.06*t,.58*(1-t)+.04*t]
        m=max(v);mantissa,e=math.frexp(m);s=mantissa*256/m
        out+=bytes([int(a*s) for a in v]+[e+128])
path.write_bytes(out)
print('Original demo textures, audio and environment generated.')
