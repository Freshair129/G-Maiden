"""Original Blender scene: four renderer comparison, no imported art or game data."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)
(ASSETS / 'frames').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES' if '--cycles' in sys.argv else 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 640
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 90
scene.world.color = (.13, .17, .22)
scene.view_settings.view_transform = 'AgX'

def material(name, color, metallic=.65, roughness=.24):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m

ice = material('Glacial cyan', (.08,.53,.77), .7)
silver = material('Moon silver', (.6,.84,.94), .82)
deep = material('Obsidian blue', (.008,.04,.075), .5, .34)
gold = material('Pale champagne', (.72,.52,.25), .8)
light = material('Frost light', (.2,.85,1), .35)
light.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (.03,.36,.6,1)
light.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.1
groups = {}
for name in ['core','wings','ring','shards']:
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    groups[name] = o

def prism(name, pts, depth, mat, group, z=0):
    n=len(pts)
    verts=[(x,y,z-d) for d in [0,depth] for x,y in pts]
    faces=[tuple(range(n)),tuple(range(n,2*n))[::-1]]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(o)
    o.data.materials.append(mat)
    o.parent=groups[group]
    return o

def crystal(name,x,y,length,width,angle,mat,group,z=.15):
    coords=[(0,length/2,0),(-width/2,0,0),(0,-length/2,0),(width/2,0,0),(0,0,width*.65),(0,0,-width*.25)]
    ca,sa=math.cos(angle),math.sin(angle)
    verts=[(x+a*ca-b*sa,y+a*sa+b*ca,z+c) for a,b,c in coords]
    faces=[(i,(i+1)%4,4) for i in range(4)]+[((i+1)%4,i,5) for i in range(4)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
    o.data.materials.append(mat);o.parent=groups[group]

# Open angular frame leaves the live typography as the visual focal point.
for sign in [-1,1]:
    prism('Upper silver rail',[(sign*.2,.45),(sign*2.1,.45),(sign*2.55,.13),(sign*2.05,.32),(sign*.2,.32)],.09,silver,'core',.12)
    prism('Lower champagne rail',[(sign*.25,-.53),(sign*1.8,-.53),(sign*2.4,-.16),(sign*1.8,-.65),(sign*.25,-.65)],.07,gold,'core',.15)
    prism('Shadow wing',[(sign*1.9,.2),(sign*3.3,.58),(sign*2.95,-.35),(sign*2.0,-.45)],.16,deep,'wings')
    for i in range(5):
        crystal('Wing facet',sign*(2.05+i*.26),.06+i*.15,.7+i*.12,.19,sign*(-.7-i*.1),ice if i%2 else silver,'wings')
    for i in range(16):
        a=i*2.39996
        x=sign*(1.3+(i%7)*.38)
        y=math.sin(a)*(.55+(i%3)*.16)
        crystal('Drifting frost',x,y,.06+(i%4)*.025,.035,a,light,'shards',.3)

crystal('Crown keystone',0,.77,.83,.49,0,ice,'core',.36)
crystal('Crown highlight',0,.87,.45,.16,0,silver,'core',.58)
for sign in [-1,1]:
    crystal('Crown prong',sign*.34,.71,.56,.18,sign*-.53,silver,'core',.28)
    crystal('Lower pendant',sign*.13,-.73,.32,.1,sign*.32,ice,'core',.1)
for i in range(48):
    a=i*math.tau/48
    if 16 < i < 33: continue
    r=.71
    x,y=math.cos(a)*r, .62+math.sin(a)*r
    crystal('Halo tick',x,y,.09 if i%4 else .15,.025,-a+math.pi/2,gold,'ring',-.15)

bpy.ops.object.camera_add(location=(0,0,14))
camera=bpy.context.object
camera.data.type='ORTHO';camera.data.ortho_scale=8.5
camera.rotation_euler=(0,0,0)
scene.camera=camera
for name,loc,power,size,color in [
    ('Cold key',(-3,4,6),1300,5,(.58,.82,1)),
    ('White edge',(4,1,4),1700,3,(.9,.97,1)),
    ('Warm glint',(1,-4,5),1100,3,(1,.72,.35))]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.data.color=color
    l.rotation_euler=(Vector((0,0,0))-l.location).to_track_quat('-Z','Y').to_euler()

def motion(t):
    a=min(1,max(0,t/.4));a=1-(1-a)**3
    b=min(1,max(0,(t-2.4)/.6));b=b*b
    return a*(1-b), (1-a)*.22-b*.12

for f in range(1,91):
    t=(f-1)/30
    scale,angle=motion(t)
    for name,g in groups.items():
        offset=(1-scale)*(.45 if name=='shards' else 0)
        g.scale=(scale+offset,scale+offset,scale)
        g.rotation_euler.z=angle*(-1 if name=='ring' else 1)
        g.keyframe_insert('scale',frame=f);g.keyframe_insert('rotation_euler',frame=f)

# Export the original mesh for real-time WebGL, without requiring a 3D library.
scene.frame_set(36)
meshes=[]
for o in scene.objects:
    if o.type!='MESH':continue
    mesh=o.data;mesh.calc_loop_triangles()
    positions=[];normals=[]
    for tri in mesh.loop_triangles:
        normal=tri.normal
        for index in tri.vertices:
            positions.extend(mesh.vertices[index].co)
            normals.extend(normal)
    meshes.append(dict(name=o.name,group=o.parent.name,positions=positions,normals=normals,color=list(o.data.materials[0].diffuse_color)[:3]))
(ASSETS/'mesh.json').write_text(json.dumps(dict(meshes=meshes,ortho=8.5,width=640,height=320)),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'maiden-crest.blend'))

if '--preview' in sys.argv:
    scene.render.filepath=str(ASSETS/'preview.png')
    bpy.ops.render.render(write_still=True)
else:
    for name in groups:
        for o in scene.objects:
            if o.type=='MESH':o.hide_render=o.parent.name!=name
        scene.render.filepath=str(ASSETS/f'{name}.png')
        bpy.ops.render.render(write_still=True)
    for o in scene.objects:
        if o.type=='MESH':o.hide_render=False
    scene.render.filepath=str(ASSETS/'frames'/'crest-')
    bpy.ops.render.render(animation=True)
