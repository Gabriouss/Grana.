"""Anima o Granabô para o Reels de apresentação e renderiza os quadros com
fundo transparente em docs/marketing/reels-granabo/blender/ (fora do git).

Trechos (quadros a 30 fps, no tempo do Reels):
  A: 117-252  entrada de perfil, giro com antecipação, olhos ligando, piscada,
              inclinação de cabeça e flutuação, olhar para baixo antes do celular
  B: 558-657  volta de frente, olhos felizes com pulinho, flutuação
A subida de baixo do quadro e a ida até o botão são feitas na montagem
(montar.py), que também desenha a sombra no chão.

Uso: python animar.py [A|B] [amostras]
"""
import bpy, math, os, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.environ.get('GRANABO_SAIDA') or os.path.abspath(os.path.join(AQUI, '..', '..', 'marketing', 'reels-granabo', 'blender'))
trecho = sys.argv[1] if len(sys.argv) > 1 else 'A'
amostras = int(sys.argv[2]) if len(sys.argv) > 2 else 48

bpy.ops.wm.open_mainfile(filepath=os.path.join(AQUI, 'granabo.blend'))
c = bpy.context.scene
corpo = bpy.data.objects['corpo']; olhar = bpy.data.objects['olhar']
bpy.data.objects['chao'].hide_render = True          # a sombra é da montagem
cam = bpy.data.objects['cam']; cam.data.lens = 176; cam.location = (0, -11.5, 0.0); cam.rotation_euler = (math.radians(90), 0, 0)
c.render.resolution_x = c.render.resolution_y = 700
c.cycles.samples = amostras
c.render.use_motion_blur = True; c.render.motion_blur_shutter = 0.5
olho_mat = bpy.data.materials['olho'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
chaves = [bpy.data.objects[o].data.shape_keys.key_blocks for o in ('olho_esq', 'olho_dir')]
BRILHO = 2.4

def k(obj, path, f, valor, idx=None, interp='BEZIER'):
    if idx is None:
        setattr(obj, path, valor); obj.keyframe_insert(path, frame=f)
    else:
        getattr(obj, path)[idx] = valor; obj.keyframe_insert(path, index=idx, frame=f)

def rz(f, graus): k(corpo, 'rotation_euler', f, math.radians(graus), 2)
def rx(f, graus): k(corpo, 'rotation_euler', f, math.radians(graus), 0)
def ry(f, graus): k(corpo, 'rotation_euler', f, math.radians(graus), 1)
def z(f, v): k(corpo, 'location', f, v, 2)
def brilho(f, v): olho_mat.default_value = v * BRILHO; olho_mat.keyframe_insert('default_value', frame=f)
def forma(f, nome, v):
    for kb in chaves:
        kb[nome].value = v; kb[nome].keyframe_insert('value', frame=f)
def olho(f, cima=0, lado=0):
    olhar.rotation_euler = (math.radians(cima), 0, math.radians(lado)); olhar.keyframe_insert('rotation_euler', frame=f)

def s(t): return round(t * 30)     # segundos do Reels -> quadro

if trecho == 'A':
    ini, fim = 117, 252
    # perfil (G para a câmera), olhos apagados; inclinado para trás na subida
    rz(ini, 90); rx(ini, -9); ry(ini, 0); z(ini, 0); brilho(ini, 0); forma(ini, 'pisca', 0); forma(ini, 'feliz', 0); olho(ini)
    rx(s(4.43), 3); rx(s(4.80), 0)                      # endireita com leve passada
    # giro com antecipação, passada e acomodação
    rz(s(4.80), 90); rz(s(4.95), 98)                    # antecipação: recua 8°
    rz(s(5.55), -7)                                     # passa do ponto
    rz(s(5.85), 0)                                      # acomoda
    ry(s(4.95), 0); ry(s(5.40), -4); ry(s(5.85), 0)     # o corpo "deita" um pouco na curva
    # olhos ligam com tremulação, como visor acendendo
    brilho(s(5.25), 0); brilho(s(5.32), 0.7); brilho(s(5.38), 0.15); brilho(s(5.47), 1.0)
    # piscada: fecha rápido (3 quadros), abre devagar (5 quadros), com uma leve descida do corpo
    f0 = s(6.0); forma(f0, 'pisca', 0); forma(f0 + 3, 'pisca', 1); forma(f0 + 4, 'pisca', 1); forma(f0 + 9, 'pisca', 0)
    z(s(5.95), 0); z(f0 + 3, -0.025); z(f0 + 10, 0)
    # inclinação de cabeça simpática depois da piscada
    ry(s(6.35), 0); ry(s(6.75), 7); ry(s(7.25), 6); ry(s(7.60), 0)
    # flutuação lenta e balanço
    for i, t in enumerate([6.4, 6.9, 7.4, 7.9, 8.4]):
        z(s(t), 0.035 if i % 2 == 0 else -0.01)
    rx(s(6.4), 0); rx(s(7.2), 2.5); rx(s(8.0), -1.5)
    # antes do celular subir: olha para baixo, os olhos chegam antes do corpo
    olho(s(7.15)); olho(s(7.40), cima=-9); olho(s(8.4), cima=-9)
    rx(s(7.45), 0); rx(s(7.70), 6)
else:
    ini, fim = 558, 657
    rz(ini, 0); rx(ini, -8); ry(ini, 0); z(ini, 0); brilho(ini, 1); forma(ini, 'pisca', 0); forma(ini, 'feliz', 0); olho(ini)
    rx(s(19.13), 3); rx(s(19.5), 0)
    # olhos felizes: antecipação (aperta um pouco), troca, e pulinho
    forma(s(19.50), 'pisca', 0); forma(s(19.58), 'pisca', 0.35); forma(s(19.66), 'pisca', 0)
    forma(s(19.58), 'feliz', 0); forma(s(19.80), 'feliz', 1)
    z(s(19.55), 0); z(s(19.62), -0.05); z(s(19.80), 0.16); z(s(20.0), -0.02); z(s(20.15), 0)
    ry(s(19.6), 0); ry(s(19.85), -6); ry(s(20.3), 5); ry(s(20.8), 0)
    for i, t in enumerate([20.3, 20.8, 21.3, 21.8]):
        z(s(t), 0.03 if i % 2 == 0 else -0.01)

# curvas: ease in/out com tangentes automáticas suaves
for ob in (corpo, olhar):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves if hasattr(ob.animation_data.action, 'fcurves') else []:
            for p in fc.keyframe_points: p.interpolation = 'BEZIER'; p.handle_left_type = p.handle_right_type = 'AUTO_CLAMPED'

os.makedirs(SAIDA, exist_ok=True)
c.frame_start, c.frame_end = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (ini, fim)
c.render.filepath = os.path.join(SAIDA, trecho + '_')
c.render.image_settings.file_format = 'PNG'; c.render.image_settings.color_mode = 'RGBA'
c.render.use_overwrite = False; c.render.use_placeholder = True
bpy.ops.render.render(animation=True)
print('ok', trecho)
