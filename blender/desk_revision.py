"""立体任务墙、无字硬壳书与无线耳机；沿用房间的原创几何和色板。"""
import math
import bpy
from mathutils import Vector, Matrix
from kit import plane, cyl, torus

R = math.radians


def mission_board(p, g, wall_y):
    before=set(bpy.data.objects)
    x, y, z = -.72, wall_y-.035, 1.79
    w, h, hot = 1.52, .72, None
    g.cube('任务墙_黑色外框', (w+.035,.032,h+.035), (x,y,z), p['ink'],hot,w=.004)
    g.cube('任务墙_冷银内衬', (w+.008,.008,h+.008), (x,y-.020,z), p['silver'],hot,w=.002)
    g.cube('任务墙_炭黑底板', (w,.008,h), (x,y-.026,z), p['black'],hot,w=.002)
    # 纸厚和错层仍是真实几何；印刷面随后统一到背板的两条轴向。
    cards=[]
    def card(name, texture, dx, dz, cw, ch, angle=0, depth=0, action=None):
        cy=y-.041-depth
        paper=g.cube('任务墙_'+name+'_纸边',(cw+.008,.005,ch+.008),(x+dx,cy,z+dz),p['white'],action,rot=(0,R(angle),0),w=.001)
        face=plane('任务墙印刷_'+name,cw,ch,(x+dx,cy-.003,z+dz),g.tex(texture),hot=action,rot=(0,R(angle),0),surface=action)
        pin=cyl('任务墙_图钉',.005,.006,(x+dx,cy-.008,z+dz+ch*.43),p['red'],rot=(R(90),0,0),hot=action,seg=24)
        cards.append((face,paper,pin))
        return face
    # 中央 HAO 保持既有纸张尺寸、原始印刷纹理与位置；周围改为四种独立物件。
    card('夜城照片','board-gallery.png',-.565,.105,.265,.34,0,0,'board-gallery')
    card('身份档案','mission-profile.png',-.075,.015,.57,.29,3,.007,'board')
    card('项目档案','board-projects.png',.49,.13,.32,.32,0,.004,'board-projects')
    card('网站车票','board-links.png',-.075,.27,.57,.115,0,.004,'board-links')
    card('阅读摘录','board-quotes.png',-.43,-.235,.50,.135,0,.012,'board-quotes')
    # 档案袋有独立页层与标签，阅读纸片带实体回形针；底板留白不命中任何入口。
    g.cube('任务墙_项目档案页层',(.29,.004,.30),(x+.50,y-.042,z+.145),p['silver'],'board-projects',w=.001)
    g.cube('任务墙_项目档案标签',(.14,.005,.035),(x+.398,y-.043,z+.305),p['white'],'board-projects',w=.001)
    for dx in [-.447,-.421]:
        g.rod('任务墙_摘录银夹',(x+dx,y-.065,z-.165),(x+dx,y-.065,z-.215),.002,p['silver'],'board-quotes')
    g.rod('任务墙_摘录银夹',(x-.447,y-.065,z-.165),(x-.421,y-.065,z-.165),.002,p['silver'],'board-quotes')
    # 夹子和底部短轨道让墙面具有模型的厚度与工艺。
    for dx in [-.70,.70]:
        for dz in [-.31,.31]:cyl('任务墙_角钉',.006,.008,(x+dx,y-.034,z+dz),p['silver'],rot=(R(90),0,0),hot=hot)
    # 保留已确认的位置、尺寸，接着以右后竖边为轴整体转向桌前。
    center=Vector((x,y,z));new_center=Vector((-.66,y,1.66))
    board=set(bpy.data.objects)-before
    for ob in board:
        ob.location=new_center+(ob.location-center)*1.24
        ob.scale*=1.24
    bpy.context.view_layer.update()
    for face,paper,pin in cards:
        pivot=face.location.copy()
        unroll=Matrix.Translation(pivot) @ Matrix.Rotation(-face.rotation_euler.y,4,'Y') @ Matrix.Translation(-pivot)
        for ob in [face,paper,pin]:ob.matrix_world=unroll @ ob.matrix_world
    bpy.context.view_layer.update()
    frame=bpy.data.objects['任务墙_黑色外框']
    bounds=[frame.matrix_world @ Vector(v) for v in frame.bound_box]
    left=min(v.x for v in bounds);right=max(v.x for v in bounds);back=max(v.y for v in bounds)
    pivot=Vector((right,back,frame.location.z))
    turn=Matrix.Translation(pivot) @ Matrix.Rotation(R(10),4,'Z') @ Matrix.Translation(-pivot)
    # 一次刚体变换包含边框、卡片、文字、图钉与连线；不对单张纸做朝向相机处理。
    for ob in board:ob.matrix_world=turn @ ob.matrix_world
    for height in [1.44,1.91]:
        end=turn @ Vector((left+.085,back+.002,height))
        start=Vector((end.x,wall_y-.015,end.z))
        g.cube('任务墙_支架墙面固定片',(.055,.014,.065),start,p['ink'],hot,w=.002)
        g.rod('任务墙_支架',start,end,.006,p['silver'],hot)


def dj_turntable(p,g,cfg):
    """参考用户选择的 SL1200 布局重建；非 Sketchfab 原文件。"""
    x,y,z=cfg['cd'];hot='music';top=z+.072
    g.cube('DJ_黑色减震底盘',(.48,.37,.036),(x,y,z+.028),p['ink'],hot,w=.012)
    g.cube('DJ_银色铝面板',(.49,.38,.024),(x,y,z+.060),p['silver'],hot,w=.006)
    for dx in [-.185,.185]:
        for dy in [-.135,.135]:cyl('DJ_隔振脚',.034,.022,(x+dx,y+dy,z+.012),p['rubber'],hot=hot)
    px,py=x-.057,y+.015
    cyl('DJ_黑色转盘基座',.151,.014,(px,py,top+.008),p['ink'],hot=hot,seg=128)
    cyl('DJ_银色频闪盘沿',.148,.018,(px,py,top+.020),p['chrome'],hot=hot,seg=128)
    for zz in [.016,.024]:
        for i in range(72):
            a=i*math.tau/72
            cyl('DJ_频闪圆点',.0017,.0015,(px+math.cos(a)*.148,py+math.sin(a)*.148,top+zz),p['ink'],rot=(R(90),0,a),hot=hot,seg=8)
    cyl('DJ_黑胶唱片',.139,.004,(px,py,top+.032),p['ink'],hot=hot,seg=128)
    for radius in [.068,.084,.101,.117,.132]:torus('DJ_唱片刻纹',radius,.00065,(px,py,top+.035),p['black'],hot=hot,seg=128)
    cyl('DJ_绯红唱片标',.039,.001,(px,py,top+.035),p['red'],hot=hot,seg=64)
    g.polygon('DJ_唱片白色切角',[(-.025,-.018,0),(.027,.015,0),(.006,.018,0),(-.027,-.009,0)],(px,py,top+.036),p['white'],hot)
    cyl('DJ_转轴',.004,.018,(px,py,top+.039),p['chrome'],hot=hot)
    ax,ay=x+.14,y+.115
    cyl('DJ_唱臂座',.038,.016,(ax,ay,top+.012),p['ink'],hot=hot)
    cyl('DJ_唱臂银环',.030,.016,(ax,ay,top+.026),p['chrome'],hot=hot)
    g.rod('DJ_唱臂支架',(ax-.025,ay,top+.025),(ax-.025,ay,top+.072),.005,p['ink'],hot)
    g.rod('DJ_唱臂支架',(ax+.025,ay,top+.025),(ax+.025,ay,top+.072),.005,p['ink'],hot)
    g.rod('DJ_唱臂转轴',(ax-.025,ay,top+.070),(ax+.025,ay,top+.070),.007,p['silver'],hot)
    cyl('DJ_配重',.018,.035,(ax,ay+.032,top+.066),p['black'],rot=(R(90),0,0),hot=hot)
    g.curve('DJ_S形唱臂',[(ax,ay+.035,top+.066),(ax,ay,top+.066),(ax+.013,ay-.07,top+.063),(ax-.003,ay-.13,top+.052),(ax-.045,ay-.19,top+.048)],.0045,p['chrome'],hot)
    g.cube('DJ_黑色唱头',(.021,.040,.012),(ax-.046,ay-.198,top+.045),p['ink'],hot,rot=(0,0,R(-20)),w=.002)
    g.cube('DJ_绯红唱针',(.011,.018,.005),(ax-.048,ay-.210,top+.037),p['red'],hot,w=.001)
    g.cube('DJ_推子槽',(.035,.14,.002),(x+.207,y-.045,top+.002),p['black'],hot,w=.001)
    g.cube('DJ_推子滑轨',(.003,.12,.002),(x+.207,y-.045,top+.004),p['silver'],hot,w=.0005)
    for i in range(9):g.cube('DJ_推子刻度',(.011,.001,.001),(x+.23,y-.101+i*.014,top+.003),p['ink'],hot,w=.0002)
    g.cube('DJ_银色推子帽',(.030,.014,.010),(x+.207,y-.03,top+.009),p['chrome'],hot,w=.002)
    g.cube('DJ_推子红线',(.028,.002,.002),(x+.207,y-.03,top+.015),p['red'],hot,w=.0005)
    g.cube('DJ_启停键',(.055,.037,.007),(x-.19,y-.145,top+.005),p['ink'],hot,w=.002)
    g.cube('DJ_启停银面',(.045,.027,.002),(x-.19,y-.145,top+.010),p['white'],hot,w=.001)
    for dx in [-.137,-.108]:g.cube('DJ_转速键',(.023,.011,.004),(x+dx,y-.16,top+.003),p['red'] if dx==-.137 else p['ink'],hot,w=.001)
    cyl('DJ_电源旋钮',.013,.017,(x-.205,y-.092,top+.008),p['ink'],hot=hot)
    g.cube('DJ_绯红前沿',(.12,.004,.007),(x+.14,y-.192,z+.060),p['red'],hot,w=.001)


def hardcover(p, g, cfg, tabletop):
    from mathutils import Vector, Matrix
    x,y,z=cfg['book']; yaw=R(-12); w,h=.26,.36;hot='books'
    rotate=Matrix.Rotation(yaw,3,'Z')
    def at(dx,dy,dz):return Vector((x,y,z))+rotate@Vector((dx,dy,dz))
    g.cube('书_象牙纸芯',(w-.017,h-.014,.036),at(.003,0,.028),p['white'],hot,rot=(0,0,yaw),w=.001)
    for height in [.006,.050]:g.cube('书_墨黑硬壳',(w,h,.008),at(0,0,height),p['ink'],hot,rot=(0,0,yaw),w=.003)
    g.cube('书_绯红圆脊',(.022,h,.050),at(-w/2+.008,0,.029),p['red'],hot,rot=(0,0,yaw),w=.005)
    g.flat('书_无字封面',w-.025,h-.016,at(.008,0,.055),g.tex('book-symbol.png'),hot,yaw)
    for dz in [.018,.024,.030,.036,.042]:
        g.rod('书_纸页细层',at(-w/2+.027,-h/2+.007,dz),at(w/2-.012,-h/2+.007,dz),.00045,p['silver'],hot)
    g.cube('书_绯红书签',(.020,.10,.001),at(.057,-h/2+.01,.021),p['red'],hot,rot=(0,0,yaw),w=.0003)


def wireless_headphones(p,g,cfg):
    x,y,z=cfg['headphones'];hot='headphones'
    # 双轨悬浮头梁、黑色耳垫和分层机甲耳罩；无外接线和悬臂麦克风。
    for radius,zz,thick,mt in [(.175,.068,.011,p['ink']),(.153,.053,.010,p['rubber']),(.177,.080,.003,p['silver'])]:
        pts=[(x+math.cos(a)*radius,y+math.sin(a)*.14,z+zz) for a in [i*math.pi/48 for i in range(49)]]
        g.curve('无线耳机_悬浮头梁',pts,thick,mt,hot)
    for dx in [-.156,.156]:
        cy=y-.036
        cushion=cyl('无线耳机_黑色耳垫',.065,.028,(x+dx,cy,z+.022),p['rubber'],seg=64,hot=hot);cushion.scale.y=1.22
        shell=cyl('无线耳机_斜切外壳',.073,.033,(x+dx,cy,z+.050),p['ink'],seg=8,rot=(0,0,R(22.5)),hot=hot);shell.scale.y=1.19
        armor=cyl('无线耳机_银白护甲',.065,.009,(x+dx,cy,z+.071),p['white'],seg=8,rot=(0,0,R(22.5)),hot=hot);armor.scale.y=1.17
        face=cyl('无线耳机_炭黑面板',.052,.005,(x+dx,cy,z+.078),p['black'],seg=8,rot=(0,0,R(22.5)),hot=hot);face.scale.y=1.15
        for side in [-1,1]:
            g.rod('无线耳机_绯红光刃',(x+dx+side*.043,cy-.034,z+.084),(x+dx+side*.043,cy+.034,z+.084),.0025,p['red'],hot)
            g.rod('无线耳机_金属悬架',(x+dx+side*.041,y+.008,z+.038),(x+dx+side*.018,y+.066,z+.060),.004,p['silver'],hot)
        torus('无线耳机_圆环标志',.025,.003,(x+dx,cy,z+.084),p['white'],hot=hot,seg=32)
        cyl('无线耳机_绯红转轴',.014,.008,(x+dx,y+.042,z+.069),p['red'],seg=32,hot=hot)
        for dy in [-.018,0,.018]:g.cube('无线耳机_散热切槽',(.010,.006,.002),(x+dx+.055,cy+dy,z+.077),p['ink'],hot,w=.001)
