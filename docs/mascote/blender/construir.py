"""Constrói o Granabô (W3 + boca L3) em Blender e salva granabo.blend.

Rodar: python construir.py   (precisa do pacote bpy: pip install bpy==5.2.2)
Frente do personagem = -Y. O G da marca é projetado ao longo de X.
"""
import bpy, bmesh, math, os
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
SVG = os.path.join(RAIZ, 'design-system', 'marca', 'simbolo-menta-sem-ponto.svg')
R2, ESP = 1.0, 0.13          # raio externo e espessura da carcaça
R1 = R2 - ESP                # raio do núcleo
GIRO_PONTA = 14.0            # W3: ponta de cima do G girada 14°

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

def mat(nome, **k):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    for chave, v in k.items():
        p.inputs[chave].default_value = v
    return m

M_CARCACA = mat('carcaca', **{'Base Color': (0.25, 0.58, 0.45, 1), 'Roughness': 0.40,
                              'Coat Weight': 0.25, 'Coat Roughness': 0.3, 'Sheen Weight': 0.3})
M_NUCLEO = mat('nucleo', **{'Base Color': (0.006, 0.030, 0.038, 1), 'Roughness': 0.08,
                            'Coat Weight': 1.0, 'Coat Roughness': 0.02, 'Specular IOR Level': 0.6})
M_OLHO = mat('olho', **{'Base Color': (0.0, 0.0, 0.0, 1), 'Emission Color': (0.10, 1, 0.42, 1),
                        'Emission Strength': 2.4, 'Roughness': 1.0, 'Specular IOR Level': 0.0})
M_BOCA = mat('boca', **{'Base Color': (0.01, 0.04, 0.05, 1), 'Roughness': 0.5})

# ---------- G a partir do SVG oficial ----------
antes = set(bpy.data.objects)
bpy.ops.import_curve.svg(filepath=SVG)
curvas = [o for o in bpy.data.objects if o not in antes and o.type == 'CURVE']
g = curvas[0]
if len(curvas) > 1:
    for o in curvas: o.select_set(True)
    bpy.context.view_layer.objects.active = g; bpy.ops.object.join()
pts = [p for s in g.data.splines for p in s.bezier_points]
xs = [p.co.x for p in pts]; ys = [p.co.y for p in pts]
cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
esc = 2 * R2 / max(max(xs) - min(xs), max(ys) - min(ys))

def warp(x, y):
    """Mesma regra do W3 em granabo_modelo.build(): só a ponta de cima gira."""
    phi = math.degrees(math.atan2(y, x)); rho = math.hypot(x, y)
    if x > 0 and y > 0.25 and -2 < phi < 80:   # só a ponta de cima, nunca a barra (y = 0,13)
        w = min(1, max(0, (80 - phi) / 40))
        a = math.radians(phi + GIRO_PONTA * w)
        return rho * math.cos(a), rho * math.sin(a)
    return x, y

for p in pts:
    for attr in ('co', 'handle_left', 'handle_right'):
        v = getattr(p, attr)
        x, y = (v.x - cx) * esc, (v.y - cy) * esc
        x, y = warp(x, y)
        setattr(p, attr, Vector((x, y, 0)))
g.data.dimensions = '2D'; g.data.fill_mode = 'BOTH'; g.data.extrude = 1.5
g.data.resolution_u = 48
g.location = (0, 0, 0)
# local X (abertura do G) -> frente (-Y); local Y -> cima (Z); extrusão -> X
g.matrix_world = Matrix(((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
bpy.context.view_layer.objects.active = g; g.select_set(True)
bpy.ops.object.convert(target='MESH')

# ---------- carcaça ----------
bpy.ops.mesh.primitive_uv_sphere_add(segments=192, ring_count=96, radius=R2, rotation=(0, math.pi / 2, 0))
casca = bpy.context.object; casca.name = 'carcaca'
bpy.ops.object.transform_apply(rotation=True)
sol = casca.modifiers.new('esp', 'SOLIDIFY'); sol.thickness = ESP; sol.offset = -1
bpy.ops.object.modifier_apply(modifier='esp')
bo = casca.modifiers.new('G', 'BOOLEAN'); bo.operation = 'INTERSECT'; bo.object = g; bo.solver = 'EXACT'
bpy.ops.object.modifier_apply(modifier='G')
bpy.data.objects.remove(g)
bv = casca.modifiers.new('borda', 'BEVEL'); bv.width = 0.035; bv.segments = 5
bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(35); bv.harden_normals = False
bpy.ops.object.shade_smooth()
casca.data.materials.clear(); casca.data.materials.append(M_CARCACA)
for p in casca.data.polygons: p.material_index = 0

# ---------- núcleo ----------
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=R1 - 0.002, rotation=(0, math.pi / 2, 0))
bpy.ops.object.transform_apply(rotation=True)
nucleo = bpy.context.object; nucleo.name = 'nucleo'
bpy.ops.object.shade_smooth(); nucleo.data.materials.append(M_NUCLEO)

def na_esfera(lon, lat, r):
    return Vector((r * math.sin(lon) * math.cos(lat), -r * math.cos(lon) * math.cos(lat), r * math.sin(lat)))

# ---------- olhos: faixa de 2 x K vértices, com shape keys contínuas ----------
# A forma é desenhada no plano tangente ao núcleo no centro do olho (a, b em
# unidades do raio) e projetada de volta na esfera: oval é oval de verdade.
K = 40
EX, EY = 0.29, 0.33           # longitude e latitude do centro (rad)
EW, EH = 0.085, 0.125         # meia largura e meia altura

def linhas(forma):
    topo, base = [], []
    for i in range(K):
        u = -1 + 2 * i / (K - 1)
        s = math.sqrt(max(0.0, 1 - u * u))
        if forma == 'oval':
            topo.append((EW * u, EH * s)); base.append((EW * u, -EH * s))
        elif forma == 'pisca':      # pálpebra desce: linha fina um pouco abaixo do centro
            topo.append((EW * 1.08 * u, -0.30 * EH + 0.10 * EH * s)); base.append((EW * 1.08 * u, -0.30 * EH - 0.10 * EH * s))
        elif forma == 'feliz':      # arco (^): faixa entre dois semicírculos
            th = math.pi * (1 - (u + 1) / 2)
            c = -0.40 * EH
            topo.append((EW * 1.15 * math.cos(th), c + EH * 0.95 * math.sin(th)))
            base.append((EW * 0.55 * math.cos(th), c + EH * 0.45 * math.sin(th)))
    return topo, base

def no_olho(lon0, lat0, a, b, r):
    n = na_esfera(lon0, lat0, 1.0)
    t1 = Vector((math.cos(lon0), math.sin(lon0), 0))          # leste
    t2 = n.cross(t1).normalized()                              # norte
    if t2.z < 0: t2 = -t2
    return (n + a * t1 + b * t2).normalized() * r

olhar = bpy.data.objects.new('olhar', None); cena.collection.objects.link(olhar)
for lado in (-1, 1):
    me = bpy.data.meshes.new(f'olho{lado}'); ob = bpy.data.objects.new('olho_' + ('esq' if lado < 0 else 'dir'), me)
    cena.collection.objects.link(ob); ob.parent = olhar
    LINHAS = 8                  # faixas na vertical: a malha acompanha a curvatura do núcleo
    def pontos(forma):
        topo, base = linhas(forma)
        out = []
        for r in range(LINHAS + 1):
            f = r / LINHAS
            for (ta, tb), (ba, bb) in zip(topo, base):
                out.append(no_olho(lado * EX, EY, ta + (ba - ta) * f, tb + (bb - tb) * f, R1 + 0.004))
        return out
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pontos('oval')]
    for r in range(LINHAS):
        for i in range(K - 1):
            a, b = vs[r * K + i], vs[r * K + i + 1]
            c, d = vs[(r + 1) * K + i + 1], vs[(r + 1) * K + i]
            try: bm.faces.new((a, b, c, d))
            except ValueError: pass
    bm.to_mesh(me); bm.free()
    ob.shape_key_add(name='Basis')
    for forma in ('pisca', 'feliz'):
        sk = ob.shape_key_add(name=forma); sk.value = 0.0
        for n, p in enumerate(pontos(forma)):
            sk.data[n].co = p
    for f in me.polygons: f.use_smooth = True
    me.materials.append(M_OLHO)

# ---------- boca L3: arco gravado na barra do G ----------
me = bpy.data.meshes.new('boca'); boca = bpy.data.objects.new('boca', me); cena.collection.objects.link(boca)
bm = bmesh.new(); KB = 48
r, a, t, y0 = 0.22, math.radians(36), 0.020, -0.045
top, bot = [], []
for i in range(KB):
    ang = -a + 2 * a * i / (KB - 1)
    taper = math.sqrt(max(0.0, 1 - ((ang / a) ** 8)))   # pontas arredondadas
    lon = r * math.sin(ang); latc = y0 + r - r * math.cos(ang)
    top.append(bm.verts.new(na_esfera(lon, latc + t * taper, R2 + 0.003)))
    bot.append(bm.verts.new(na_esfera(lon, latc - t * taper, R2 + 0.003)))
for i in range(KB - 1):
    bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
bm.to_mesh(me); bm.free(); me.materials.append(M_BOCA)

# ---------- hierarquia ----------
corpo = bpy.data.objects.new('corpo', None); cena.collection.objects.link(corpo)
for o in (casca, nucleo, olhar, boca): o.parent = corpo

# ---------- luz, mundo, câmera, chão ----------
mundo = bpy.data.worlds.new('mundo'); cena.world = mundo; mundo.use_nodes = True
mundo.node_tree.nodes['Background'].inputs[0].default_value = (0.010, 0.045, 0.055, 1)
mundo.node_tree.nodes['Background'].inputs[1].default_value = 0.6
def luz(nome, tipo, loc, energia, tam=2.0, cor=(1, 1, 1)):
    d = bpy.data.lights.new(nome, tipo); d.energy = energia; d.color = cor
    if tipo == 'AREA': d.size = tam
    o = bpy.data.objects.new(nome, d); cena.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
luz('principal', 'AREA', (-3.5, -3.0, 5.5), 420, 5.0)
luz('recorte', 'AREA', (3.5, 3.0, 2.5), 160, 2.0, (0.75, 1.0, 0.95))
luz('preenche', 'AREA', (4.5, -3.0, -1.5), 80, 6.0)
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -1.25))
chao = bpy.context.object; chao.name = 'chao'; chao.is_shadow_catcher = True
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 85
cam = bpy.data.objects.new('cam', cam_d); cena.collection.objects.link(cam)
cam.location = (0, -11.5, 0.35); cam.rotation_euler = (math.radians(88.3), 0, 0)
cena.camera = cam

cena.render.engine = 'CYCLES'; cena.cycles.device = 'CPU'
cena.cycles.samples = 64; cena.cycles.use_denoising = True
cena.render.film_transparent = True
cena.render.resolution_x = cena.render.resolution_y = 700
cena.render.fps = 30
cena.view_settings.view_transform = 'AgX'; cena.view_settings.look = 'AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, 'granabo.blend'))
print('salvo granabo.blend')
