"""Writes assets/models/shop/layout.json: fixed hero placements + seeded shelf fill (no overlaps, items sit on boards).
  python3 tools/shop_layout.py"""
import json, random
random.seed(7)
W = {'tube_radio_closed.glb': 0.5, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.37, 'cassette_recorder.glb': 0.5,
     'alarm_clock.glb': 0.13, 'thermos.glb': 0.17, 'toolbox.glb': 0.5, 'tube_radio_open.glb': 0.55, 'enamel_mug.glb': 0.1}
H = {'tube_radio_closed.glb': 0.33, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.46, 'cassette_recorder.glb': 0.36,
     'alarm_clock.glb': 0.16, 'thermos.glb': 0.36, 'toolbox.glb': 0.31, 'tube_radio_open.glb': 0.35, 'enamel_mug.glb': 0.1}
fixed = [
 {"name": "shelf_back", "type": "shelf", "pos": [-0.1, 0, -1.97], "w": 2.1, "d": 0.5, "h": 2.55, "levels": 5},
 {"name": "shelf_left", "type": "shelf", "pos": [-2.72, 0, -1.05], "ry": 90, "w": 1.7, "d": 0.5, "h": 2.3, "levels": 4},
 {"name": "workbench", "glb": "workbench.glb", "pos": [-1.6, 0, 0.2], "ry": 0},
 {"name": "desk_lamp", "glb": "desk_lamp.glb", "pos": [-2.12, 0, 0.05], "ry": 40, "on": "workbench"},
 {"name": "tube_radio_open", "glb": "tube_radio_open.glb", "pos": [-1.45, 0, 0.02], "ry": 8, "on": "workbench"},
 {"name": "magnifier", "glb": "magnifier.glb", "pos": [-1.02, 0, 0.27], "ry": -30, "on": "workbench"},
 {"name": "soldering_iron", "glb": "soldering_iron.glb", "pos": [-1.85, 0, 0.4], "ry": 15, "on": "workbench"},
 {"name": "enamel_mug", "glb": "enamel_mug.glb", "pos": [-2.25, 0, 0.45], "ry": 30, "on": "workbench"},
 {"name": "robot", "glb": "robot.glb", "pos": [-0.5, 0, 0.5], "ry": -58},
 {"name": "toolbox", "glb": "toolbox.glb", "pos": [-1.0, 0, 1.0], "ry": 20},
 {"name": "back_door", "glb": "back_door.glb", "pos": [1.75, 0, 0], "wall": "back"},
 {"name": "wall_clock", "glb": "wall_clock.glb", "pos": [2.65, 1.45, 0], "wall": "back"},
 {"name": "parts_cabinet", "glb": "parts_cabinet.glb", "pos": [2.62, 0, -0.6], "ry": -90},
 {"name": "stool_2", "glb": "stool.glb", "pos": [1.25, 0, 0.55], "ry": 12},
 {"name": "thermos_floor", "glb": "thermos.glb", "pos": [1.05, 0, 0.75], "ry": 40},
 {"name": "bicycle", "glb": "bicycle.glb", "pos": [2.35, 0, 2.95], "ry": -78},
]
pool = ['tube_radio_closed.glb', 'crt_tv.glb', 'desk_fan.glb', 'cassette_recorder.glb', 'alarm_clock.glb', 'thermos.glb', 'tube_radio_closed.glb', 'crt_tv.glb']
out = list(fixed)
def fill(shelf, along, x0, x1, z, levels, ry, top_clear):
    for lv in range(levels):
        x = x0 + random.uniform(0.02, 0.08)
        k = 0
        while True:
            g = random.choice(pool)
            if H[g] > top_clear[lv]: continue_ok = [p for p in pool if H[p] <= top_clear[lv]]; g = random.choice(continue_ok)
            sc = round(random.uniform(0.82, 1.0), 2)
            w = W[g] * sc
            if x + w > x1: break
            cx = x + w / 2
            pos = [cx, 0, z] if along == 'x' else [z, 0, cx]
            out.append({"name": f"{shelf}_{lv}_{k}", "glb": g, "pos": [round(pos[0], 3), 0, round(pos[2], 3)], "ry": ry + random.uniform(-8, 8),
                        "on": shelf, "level": lv, "scale": sc})
            x += w + random.uniform(0.03, 0.09); k += 1
# back shelf: x from -1.13 to 0.93, boards at levels 0..4; clearance between boards ~0.6 m (top board: open above)
fill('shelf_back', 'x', -1.12, 0.92, -1.95, 5, 0, [0.58, 0.58, 0.58, 0.58, 0.9])
fill('shelf_left', 'z', -1.87, -0.23, -2.72, 4, 90, [0.66, 0.66, 0.66, 0.9])
json.dump(out, open('assets/models/shop/layout.json', 'w'), indent=1)
print(len(out), 'items')
