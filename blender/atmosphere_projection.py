"""Fixed-camera projection for a physical window-to-record light shaft."""
import math
from mathutils import Vector


def convex_hull(points):
    points=sorted(set(tuple(p) for p in points))
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[];upper=[]
    for p in points:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return [list(p) for p in lower[:-1]+upper[:-1]]


def window_beam_projection(scene,project,config):
    source=Vector((1.55,.635,1.72))
    x,y,z=config['cd'];target=Vector((x-.057,y+.015,z+.1073))
    axis=(target-source).normalized();distance=(target-source).length
    # Continue to desktop level. The existing depth pass terminates the shaft at
    # the real record surface, while pickup can reveal its continued table light.
    length=distance*(source.z-.779)/(source.z-target.z)
    end=source+axis*length
    u=axis.cross(Vector((0,0,1))).normalized();v=axis.cross(u).normalized()
    r0=.018;r1=.070
    def ring(center,r):
        return [project(center+r*(math.cos(a)*u+math.sin(a)*v)) for a in [i*math.tau/32 for i in range(32)]]
    end_radius=r0+(r1-r0)*length/distance
    radius=.139
    deck_quad=[project(target+Vector((dx,dy,0))) for dx,dy in [(-radius,radius),(radius,radius),(radius,-radius),(-radius,-radius)]]
    deck_circle=[project(target+Vector((math.cos(a)*radius,math.sin(a)*radius,0))) for a in [i*math.tau/64 for i in range(64)]]
    matrix=scene.camera.matrix_world
    return {'version':1,'sourceWorldBlender':list(source),'targetWorldBlender':list(target),
            'source':project(source),'target':project(target),'axisWorldBlender':list(axis),
            'lengthWorld':length,'sourceRadiusWorld':r0,'targetRadiusWorld':r1,'targetDistanceWorld':distance,
            'polygon':convex_hull(ring(source,r0)+ring(end,end_radius)),
            'corePolygon':convex_hull(ring(source,r0*.45)+ring(end,end_radius*.45)),
            'deckQuad':deck_quad,'deckCircle':deck_circle,
            'maskImage':'window-beam-mask.webp','recordLightImage':'window-record-light.webp',
            'texture':'window-beam-mask.webp','discTexture':'window-record-light.webp',
            'maskSize':[3840,2160],'color':'#f6f2e8','occlusion':'camera-ray/cone intersection clipped against native depth; printed screen excluded',
            'cameraWorldMatrixBlender':[[matrix[r][c] for c in range(4)] for r in range(4)],
            'tanHalfFovX':scene.camera.data.sensor_width/(2*scene.camera.data.lens)}
