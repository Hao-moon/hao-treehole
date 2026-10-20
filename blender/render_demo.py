"""Rebuild both demo backdrops and the original sculpture from parametric source.
Run: blender -b -t 8 -P blender/render_demo.py -- --width 2560 --samples 24
Then: python scripts/package-renders.py
"""
from pathlib import Path
import bpy, sys, math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import build_scene as desk
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
params=dict(zip(args[::2],args[1::2]));width=int(params.get('--width',2560));samples=int(params.get('--samples',24))
CACHE=ROOT/'.local/demo-renders';CACHE.mkdir(parents=True,exist_ok=True)
for world in ([params['--world']] if '--world' in params else ['persona','ghostblade']):
    scene,p=desk.setup(width,samples)
    for ob in scene.objects:
        if ob.name.startswith('书_'):ob.hide_render=True
        if ob.type=='LIGHT':ob.hide_render=True
    desk.area('Window sunlight',(5.4,2.7,4.2),(-1,-.2,.78),4200,'#fff1db',.2)
    desk.area('Soft reflected fill',(-2,-2,2.8),(0,0,1),85,'#d2dac8',3.5)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.2
    scene.view_settings.exposure=.3
    if world=='ghostblade':
        colors={'石墨色设备':'#273630','墨黑':'#152422','绯红':'#819087','桌面黑色收边':'#172725','漫画桌面底色':'#5b4432','墙面':'#647268'}
        for mat in bpy.data.materials:
            if not mat.use_nodes:continue
            bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if not bsdf:continue
            # setup appends numeric suffixes when the second scene is built.
            stem=mat.name.split('.')[0]
            if stem in colors:bsdf.inputs['Base Color'].default_value=desk.rgb(colors[stem])
            for node in mat.node_tree.nodes:
                if node.type=='TEX_IMAGE' and node.image:
                    name=Path(node.image.filepath).name
                    target=ROOT/'site/assets/worlds/ghostblade'/name
                    if name=='screen.png':target=target.with_name('daylight-screen.png')
                    if target.exists():node.image=bpy.data.images.load(str(target),check_existing=True)
            if stem=='漫画桌面底色':
                nodes=mat.node_tree.nodes;links=mat.node_tree.links
                coord=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(3,85,12)
                noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=3
                ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=desk.rgb('#2c211b');ramp.color_ramp.elements[1].color=desk.rgb('#85684e')
                bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.002
                links.new(coord.outputs['Generated'],mapping.inputs[0]);links.new(mapping.outputs[0],noise.inputs[0]);links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],bsdf.inputs['Base Color']);links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],bsdf.inputs['Normal'])
        # Plain colored city faces retain the desk's original view and scale.
        for ob in scene.objects:
            if ob.name.startswith('窗外楼群'):
                mat=desk.mat('City haze '+ob.name,'#809391',.85);ob.data.materials.clear();ob.data.materials.append(mat)
            if ob.name=='远处天空':
                mat=desk.mat('Sky haze','#cad3c5',.8,emit=.8);ob.data.materials.clear();ob.data.materials.append(mat)
            if ob.name=='绯红信标':
                mat=desk.mat('Beacon red','#c91431',.35,.12);ob.data.materials.clear();ob.data.materials.append(mat)
    desk.set_mode('beauty')
    scene.render.filepath=str(CACHE/(world+'.png'));bpy.ops.render.render(write_still=True)
    for ob in scene.objects:
        if ob.name.startswith('DJ_'):ob.hide_render=True
    scene.render.filepath=str(CACHE/(world+'-empty.png'));bpy.ops.render.render(write_still=True)

# This GLB has no external images, character assets or imports.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
dark=desk.mat('Basalt','#263b3c',.5,.2);gold=desk.mat('Brass','#c6a16d',.27,.65);red=desk.mat('Red ceramic','#b42b40',.3)
desk.cyl('Sculpture base',.35,.12,(0,0,.06),dark,seg=64)
desk.ball('Orbit core',.24,(0,0,.77),red)
for tilt in [-.55,.55]:desk.torus('Orbit ring',.50,.027,(0,0,.77),gold,rot=(math.pi/2,tilt,0),seg=96)
desk.rod('Stand',(0,0,.1),(0,0,.72),.035,gold)
desk.ball('Satellite',.08,(.38,0,1.10),gold)
desk.set_mode('beauty')
bpy.ops.object.select_all(action='SELECT')
out=ROOT/'site/assets/collectibles/models/orbit.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
print('PUBLIC_DEMO_RENDERED')
