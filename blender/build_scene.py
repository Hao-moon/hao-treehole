"""Original parametric desk. See NOTICE.md for MIT helper attribution."""
import bpy, bmesh, math, os, sys, json, random
from pathlib import Path
from mathutils import Vector, Euler
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from kit import M, MATS, SURFACES, rgb, lin, box, cyl, ball, torus, plane, light, set_mode, add

R=math.radians; T=.78; WY=.69
HOT={'computer':1,'music':2,'books':3,'headphones':4,'mask':5,'board':6,'asuka':7,'tower':8,'keyboard':9,'games':10,
     'board-gallery':12,'board-projects':13,'board-links':14,'board-quotes':15}
CONFIG={
    'camera':{'position':(0,-2.55,2.62),'target':(.06,.12,1.10),'lens':25},
    'monitor':(-.28,.29,1.27),'computer':(.98,.28,1.08),
    'cd':(-1.01,-.20,T),'headphones':(-.80,-.66,T),
    'book':(1.05,-.55,T),'mask':(.17,-.08,T),
    'asuka':(.49,.26,T),'handheld':(.46,-.73,T),
    'cartridges':(.79,-.73,T),'pilot_card':(.72,-.18,T),
}

def mat(name,col,rough=.5,metal=0,emit=0): return M(name,col,rough,metal=metal,emit=emit)
def bevel(ob,w=.008,seg=3):
    m=ob.modifiers.new('精细倒角','BEVEL');m.width=w;m.segments=seg
    m=ob.modifiers.new('加权法线','WEIGHTED_NORMAL')
    return ob
def cube(name,size,loc,mt,hot=None,rot=(0,0,0),w=.008):
    return bevel(box(name,size,loc,mt,rot=rot,hot=hot),min(w,min(size)/3),3)
def rod(name,a,b,r,mt,hot=None):
    a,b=Vector(a),Vector(b)
    return cyl(name,r,(b-a).length,(a+b)/2,mt,rot=(b-a).to_track_quat('Z','Y').to_euler(),seg=20,hot=hot)
def curve(name,pts,r,mt,hot=None):
    cr=bpy.data.curves.new(name,'CURVE');cr.dimensions='3D';cr.resolution_u=20;cr.bevel_depth=r;cr.bevel_resolution=3
    sp=cr.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cr);bpy.context.collection.objects.link(ob);cr.materials.append(mt)
    if hot:ob['hot']=hot
    return ob
def tex(name,emit=0,rough=.6):
    m=mat('纹理_'+name,'#ffffff',rough,emit=emit)
    nt=m.node_tree;tx=nt.nodes.new('ShaderNodeTexImage');tx.image=bpy.data.images.load(str(ROOT/'textures'/name));tx.image.pack()
    for n in nt.nodes:
        if n.type=='BSDF_PRINCIPLED':
            nt.links.new(tx.outputs['Color'],n.inputs['Base Color']);nt.links.new(tx.outputs['Color'],n.inputs['Emission Color'])
        if n.type=='EMISSION':nt.links.new(tx.outputs['Color'],n.inputs['Color'])
    return m
def flat(name,w,h,loc,mt,hot=None,yaw=0):return plane(name,w,h,loc,mt,rot=(-math.pi/2,0,yaw),hot=hot)
def area(name,pos,target,power,col,size):
    ob=light(name,'AREA','all',power,col,pos,size=size);ob.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();return ob

def materials():
    return dict(
      black=mat('石墨色设备','#202127',.28,.35),ink=mat('墨黑','#111216',.7),
      silver=mat('喷砂铝','#a4a4a3',.27,.72),chrome=mat('抛光金属','#d4d5d4',.18,.85),
      white=mat('象牙白','#e6e4dc',.46),red=mat('绯红','#c91431',.35,.12),
      rubber=mat('皮革软垫','#17191d',.87),light=mat('暖白指示灯','#fff2d8',.28,emit=2),
      desk=mat('漫画桌面底色','#4b5058',.72,.12),wall=mat('墙面','#c9cbc5',.92),
      line=mat('边缘墨线','#22242b',.6),city=tex('city.png',.45,.8),
      sky=tex('sky.png',.55,.8),
      glass=mat('烟色玻璃','#363c4a',.18,.45),
    )

def room(p):
    cube('桌面',(2.95,1.52,.055),(0,-.16,T-.032),p['desk'],w=.018)
    cube('桌面黑色收边',(2.96,1.53,.014),(0,-.16,T-.060),p['ink'],w=.006)
    for x in [-1.22,1.22]:
        cube('桌架',(0.045,1.1,.045),(x,-.16,T-.12),p['silver'])
        for y in [-.67,.33]:cube('桌腿',(.055,.055,.79),(x,y,.35),p['ink'])
    cube('后墙左',(4,.16,4),(-1.25,WY+.08,1.8),p['wall'])
    cube('后墙右',(6,.16,4),(5.15,WY+.08,1.8),p['wall'])
    cube('窗下墙',(1.65,.16,.52),(1.42,WY+.08,.2),p['wall'])
    # 地板延伸出画面，没有房屋外轮廓。
    cube('地面',(12,8,.1),(0,WY-4,-.13),p['ink'])
    for x in [.62,1.39,2.15]:cube('窗竖框',(.052,.085,2.85),(x,WY,1.77),p['ink'])
    for z in [.35,1.26,2.18,3.1]:cube('窗横框',(1.59,.085,.052),(1.385,WY,z),p['ink'])
    cube('窗台',(1.7,.23,.045),(1.39,WY-.04,.39),p['silver'])
    plane('远处天空',90,100,(2,38,-5),p['sky'])
    rng=random.Random(31)
    for i in range(66):
        x=rng.uniform(-8,18);y=rng.uniform(9,35);h=45+rng.uniform(-13,0)
        ww,dd=rng.uniform(.9,2.2),rng.uniform(1.0,2.0)
        bm=bmesh.new();uv=bm.loops.layers.uv.verify();bmesh.ops.create_cube(bm,size=1,calc_uvs=True)
        bmesh.ops.scale(bm,vec=(ww,dd,h),verts=bm.verts);bm.normal_update()
        for face in bm.faces:
            for lp in face.loops:
                v=lp.vert.co
                u=(v.y/dd+.5)*.32 if abs(face.normal.x)>.5 else (v.x/ww+.5)*.32
                lp[uv].uv=(u,(v.z/h+.5)*1.4)
        add('窗外楼群',bm,p['city'],loc=(x,y,h/2-45))
    # 建筑缝、插座与沿墙线槽为设备提供真实连接关系。
    for x in [-2,-1.2,-.4]:cube('墙面接缝',(.004,.004,3),(x,WY-.005,1.5),p['silver'],w=.001)
    cube('墙角走线槽',(2.8,.025,.035),(-.55,WY-.035,.87),p['silver'])
    cube('电源面板',(.18,.018,.08),(-1.3,WY-.055,.92),p['white'])
    for x in [-1.34,-1.27]:
        for z in [.911,.931]:cube('插座孔',(.013,.004,.006),(x,WY-.068,z),p['ink'],w=.001)

def computer(p):
    x,y,z=CONFIG['monitor'];hot='computer'
    cube('显示器底座',(.38,.24,.025),(x,y-.02,T+.018),p['black'],hot,w=.011)
    cube('显示器立柱',(.065,.06,.25),(x,y+.05,T+.16),p['silver'],hot)
    cube('显示器后盖',(.94,.052,.55),(x,y,z),p['black'],hot,w=.014)
    cube('显示器银色边框',(.926,.010,.534),(x,y-.03,z),p['chrome'],hot,w=.007)
    plane('显示器画面',.895,.504,(x,y-.036,z+.003),tex('screen.png',.55,.27),hot=hot,surface='screen')
    cyl('开机指示灯',.0025,.003,(x+.43,y-.037,z-.255),p['light'],rot=(R(90),0,0),hot=hot)
    # 独立机箱，前端风道与玻璃侧板。
    x,y,z=CONFIG['computer'];hot='tower'
    cube('台式机装甲骨架',(.31,.43,.55),(x,y,z),p['white'],hot,w=.018)
    cube('台式机正面深色风道',(.270,.024,.50),(x,y-.224,z),p['ink'],hot,w=.008)
    for zz in [z-.118,z+.118]:
        cyl('机箱风扇暗底',.096,.008,(x,y-.242,zz),p['black'],rot=(R(90),0,0),hot=hot,seg=64)
        torus('机箱风扇银色外环',.090,.005,(x,y-.250,zz),p['chrome'],rot=(R(90),0,0),hot=hot,seg=64)
        torus('机箱风扇绯红光环',.078,.006,(x,y-.255,zz),p['red'],rot=(R(90),0,0),hot=hot,seg=64)
        for a in [i*math.tau/7 for i in range(7)]:
            polygon('机箱风扇叶片',[(math.cos(a)*.025,-.258,math.sin(a)*.025),(math.cos(a+.28)*.070,-.258,math.sin(a+.28)*.070),(math.cos(a+.74)*.067,-.258,math.sin(a+.74)*.067),(math.cos(a+.5)*.029,-.258,math.sin(a+.5)*.029)],(x,y,zz),p['silver'],hot)
        cyl('机箱风扇红色轮毂',.024,.013,(x,y-.262,zz),p['red'],rot=(R(90),0,0),hot=hot)
    cube('机箱侧面黑色观察窗',(.009,.365,.462),(x-.16,y,z),p['ink'],hot,w=.004)
    # 侧面可见的硬件线条，保持黑底、冷银外骨架和绯红切线。
    cube('机箱显卡银色护甲',(.013,.265,.055),(x-.167,y,z-.075),p['silver'],hot,w=.005)
    cube('机箱显卡红色灯带',(.014,.26,.010),(x-.177,y,z-.06),p['red'],hot,w=.002)
    for yy in [y-.09,y-.035,y+.02]:cube('机箱内存护甲',(.016,.024,.13),(x-.169,yy,z+.10),p['white'],hot,w=.004)
    rod('机箱绯红斜撑',(x-.18,y-.17,z-.21),(x-.18,y+.15,z+.19),.009,p['red'],hot)
    for yy in [y-.155,y+.155]:
        for zz in [z-.21,z+.21]:cyl('机箱侧面紧固件',.008,.011,(x-.18,yy,zz),p['chrome'],rot=(0,R(90),0),hot=hot)
    cube('机箱顶部黑色散热口',(.23,.28,.006),(x,y,z+.278),p['ink'],hot,w=.007)
    for i in range(5):cube('机箱顶部散热格栅',(.19,.006,.003),(x,y-.10+i*.047,z+.283),p['silver'],hot,w=.001)
    cyl('电源按钮',.011,.005,(x+.09,y-.242,z+.229),p['red'],rot=(R(90),0,0),hot=hot)
    for dx in [-.09,-.04]:cube('机箱接口',(.03,.004,.009),(x+dx,y-.242,z+.23),p['white'],hot,w=.002)
    # 有可见层次的键帽与键盘金属外壳。
    x,y=-.26,-.33;hot='keyboard'
    cube('桌垫',(.98,.49,.006),(x+.07,y-.10,T+.006),p['black'],w=.015)
    cube('键盘铝制外壳',(.57,.204,.032),(x,y,T+.025),p['silver'],hot,w=.011)
    cube('键盘深色定位板',(.553,.188,.008),(x,y,T+.044),p['ink'],hot,w=.008)
    for row in range(5):
        n=15 if row<4 else 5
        for col in range(n):
            if row<4: xx=x-.257+col*.0365; wid=.030
            else:xx=x-.238+col*.115;wid=.095 if col==2 else .07
            mt=p['red'] if (row==0 and col==0) or (row==2 and col==14) else p['white'] if (row+col)%5 else p['silver']
            cube('机械键帽',(wid,.029,.017),(xx,y+.074-row*.035,T+.056),mt,hot,w=.004)
    # 鼠标没有文字品牌，分缝与滚轮可见。
    x,y=.25,-.40
    ball('鼠标',.065,(x,y,T+.028),p['white'],scale=(.66,1,.48),hot=hot)
    curve('鼠标中缝',[(x,y-.04,T+.055),(x,y,T+.060),(x,y+.05,T+.038)],.0013,p['ink'],hot)
    cyl('滚轮',.009,.012,(x,y+.018,T+.059),p['black'],rot=(0,R(90),0),hot=hot)
    curve('键盘线', [(-.53,-.24,T+.035),(-.65,-.10,T+.025),(-.55,.12,T+.01),(-.38,.50,T+.02)],.003,p['rubber'],hot)
    curve('主机连接线',[(.96,.47,.84),(.5,.51,T+.005),(.15,.47,T+.007),(-.22,.38,T+.01)],.003,p['rubber'],hot)

def cd_player(p):
    from desk_revision import dj_turntable
    from types import SimpleNamespace
    g=SimpleNamespace(**{k:globals()[k] for k in ['cube','curve','rod','flat','tex','polygon']})
    return dj_turntable(p,g,CONFIG)

def polygon(name,coords,loc,mt,hot=None):
    bm=bmesh.new();v=[bm.verts.new(c) for c in coords];bm.faces.new(v);ob=add(name,bm,mt,loc=loc,hot=hot);return ob

def mask(p):
    x,y,z=CONFIG['mask'];hot='mask'
    cyl('世界信标底座',.095,.03,(x,y,z+.024),p['ink'],hot=hot,seg=64)
    cyl('绯红信标',.085,.018,(x,y,z+.047),p['red'],hot=hot,seg=64)
    torus('信标圆环',.056,.004,(x,y,z+.059),p['white'],hot=hot,seg=64)
    ball('信标中心',.012,(x,y,z+.063),p['white'],hot=hot)

def setup(width,samples):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    from types import SimpleNamespace
    from desk_revision import mission_board, hardcover, wireless_headphones
    g=SimpleNamespace(**{k:globals()[k] for k in ['cube','curve','rod','flat','tex','polygon']})
    p=materials();room(p);mission_board(p,g,WY);computer(p);cd_player(p);wireless_headphones(p,g,CONFIG);hardcover(p,g,CONFIG,T);mask(p)
    from scene_props import populate
    populate(p,CONFIG,{k:globals()[k] for k in ['cube','curve','rod','flat','tex','polygon']})
    scene=bpy.context.scene
    cd=bpy.data.cameras.new('固定机位');cam=bpy.data.objects.new('固定机位',cd);scene.collection.objects.link(cam)
    cfg=CONFIG['camera'];cam.location=cfg['position'];cam.rotation_euler=(Vector(cfg['target'])-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=cfg['lens'];cd.shift_y=cfg.get('shift_y',0);scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.samples=samples;scene.cycles.use_denoising=True
    try:
        pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='OPTIX';pref.get_devices()
        for dev in pref.devices:dev.use=dev.type!='CPU'
        scene.cycles.device='GPU'
    except Exception as e:print('设备选择:',e)
    scene.render.resolution_x=width;scene.render.resolution_y=width*9//16;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=rgb('#d8d7d2');bg.inputs[1].default_value=.4
    area('窗外主光',(4,-.3,5.0),(-.5,0,.5),850,'#f7f2df',3)
    area('前方柔光',(-1,-2,3.7),(0,.2,.9),240,'#d6dde7',3.5)
    area('右侧轮廓光',(1.8,.1,2.5),(0,0,1),60,'#ed3346',1.8)
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    set_mode('beauty');bpy.context.view_layer.update()
    return scene,p
