"""Original generic handheld, cartridges and collection tag."""
import bpy, math
from types import SimpleNamespace
from kit import cyl, torus
R=math.radians

def group_new(before,name,position,yaw):
    objects=set(bpy.data.objects)-before
    holder=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(holder)
    for ob in objects:ob.parent=holder
    holder.location=position;holder.rotation_euler.z=R(yaw)

def handheld(p,cfg,g):
    before=set(bpy.data.objects)
    # 桌面掌机 比例：窄边屏幕、独立圆弧 侧面控制器、错位摇杆与四向按键。
    g.cube('掌机_平板主体',(.305,.187,.019),(0,0,.020),p['ink'],w=.006)
    g.cube('掌机_玻璃屏框',(.292,.178,.004),(0,0,.032),p['black'],w=.005)
    g.flat('掌机_游戏画面',.278,.156,(0,0,.035),g.tex('handheld-screen.png',.4))
    for side in [-1,1]:
        x=side*.184
        g.cube('掌机_控制器分离滑轨',(.006,.174,.028),(side*.154,0,.025),p['silver'],w=.002)
        g.cube('掌机_独立控制器',(.057,.187,.029),(x,0,.025),p['red'] if side<0 else p['white'],w=.018)
        g.cube('掌机_肩键',(.045,.017,.012),(x,.083,.043),p['ink'],w=.007)
        yy=.039 if side<0 else -.036
        cyl('掌机_摇杆底座',.018,.006,(x,yy,.043),p['silver'],seg=48)
        cyl('掌机_摇杆帽',.014,.009,(x,yy,.050),p['ink'],seg=48)
        torus('掌机_摇杆环',.011,.001,(x,yy,.055),p['black'],seg=48,sub=8)
        yy=-.034 if side<0 else .033
        for dx,dy in [(0,.015),(0,-.015),(-.015,0),(.015,0)]:cyl('掌机_独立动作键',.0055,.005,(x+dx,yy+dy,.043),p['ink'],seg=24)
        g.cube('掌机_减号',(.012,.003,.003),(x,.065,.043),p['ink'],w=.0005)
        if side>0:g.cube('掌机_加号',(.003,.012,.003),(x,.065,.043),p['ink'],w=.0005)
        cyl('掌机_Home键' if side>0 else '掌机_截图键',.005,.003,(x,-.073,.042),p['ink'],seg=24)
    for x in [-.1,.1]:g.cube('掌机_扬声器',(.027,.002,.002),(x,-.084,.035),p['silver'],w=.0005)
    for ob in set(bpy.data.objects)-before:ob['hot']='games'
    group_new(before,'原创掌机',cfg['handheld'],-9)


def cartridges(p,cfg,g):
    before=set(bpy.data.objects)
    for i,(x,y,angle) in enumerate([(-.045,.012,-12),(.042,-.014,12)]):
        g.cube('卡带_塑料盒',(.096,.133,.014),(x,y,.015+i*.012),p['ink'],rot=(0,0,R(angle)),w=.004)
        g.flat('卡带_收藏标签',.077,.092,(x,y+.009,.024+i*.012),g.tex('cartridge-'+str(i)+'.png'),yaw=R(angle))
        for k in range(5):g.cube('卡带_金属触点',(.007,.017,.001),(x-.028+k*.014,y-.053,.023+i*.012),p['silver'],w=.0004)
    group_new(before,'收藏游戏卡带',cfg['cartridges'],8)

def pilot_card(p,cfg,g):
    before=set(bpy.data.objects)
    g.cube('收藏_收藏卡背板',(.143,.217,.005),(0,0,.004),p['red'],w=.004)
    g.flat('收藏_收藏卡画面',.135,.207,(0,0,.007),g.tex('pilot-card.png'))
    torus('收藏_钥匙圈',.022,.003,(.045,.11,.009),p['chrome'],seg=36,sub=8)
    g.curve('收藏_织带',[(.045,.13,.009),(.11,.17,.009),(.145,.12,.009),(.09,.06,.009)],.006,p['ink'])
    group_new(before,'收藏收藏卡',cfg['pilot_card'],18)

def populate(p,cfg,helpers):
    g=SimpleNamespace(**helpers)
    handheld(p,cfg,g);cartridges(p,cfg,g);pilot_card(p,cfg,g)
