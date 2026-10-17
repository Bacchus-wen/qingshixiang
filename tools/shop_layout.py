"""Writes assets/models/shop/layout.json: fixed hero placements + seeded shelf fill (no overlaps, items sit on boards).
  python3 tools/shop_layout.py"""
import json, math, random
random.seed(7)
W = {'tube_radio_closed.glb': 0.5, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.37, 'cassette_recorder.glb': 0.5,
     'alarm_clock.glb': 0.13, 'thermos.glb': 0.17, 'toolbox.glb': 0.5, 'tube_radio_open.glb': 0.55, 'enamel_mug.glb': 0.1}
H = {'tube_radio_closed.glb': 0.33, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.46, 'cassette_recorder.glb': 0.36,
     'alarm_clock.glb': 0.16, 'thermos.glb': 0.36, 'toolbox.glb': 0.31, 'tube_radio_open.glb': 0.35, 'enamel_mug.glb': 0.1}
fixed = [
 {"name": "shelf_back", "type": "shelf", "pos": [-0.1, 0, -1.97], "w": 2.1, "d": 0.5, "h": 2.55, "levels": 5},
 {"name": "shelf_left", "type": "shelf", "pos": [-2.72, 0, -1.05], "ry": 90, "w": 1.7, "d": 0.5, "h": 2.3, "levels": 4},
 {"name": "shelf_left2", "type": "shelf", "pos": [-2.72, 0, 1.225], "ry": 90, "w": 1.35, "d": 0.45, "h": 1.9, "levels": 4},
 {"name": "workbench", "glb": "workbench.glb", "pos": [-1.6, 0, 0.9], "ry": 0},
 {"name": "bench_clock", "glb": "alarm_clock.glb", "pos": [-1.0, 0, 0.6], "ry": 24, "on": "workbench"},
 {"name": "spool_a", "type": "proc", "kind": "spool", "seed": 0, "pos": [-1.08, 0, 0.82], "on": "workbench"},
 {"name": "spool_b", "type": "proc", "kind": "spool", "seed": 1, "pos": [-2.22, 0, 1.02], "on": "workbench"},
 {"name": "screwdriver_a", "type": "proc", "kind": "screwdriver", "seed": 1, "pos": [-1.6, 0, 1.12], "ry": 18, "on": "workbench"},
 {"name": "screwdriver_b", "type": "proc", "kind": "screwdriver", "seed": 0, "pos": [-1.42, 0, 1.17], "ry": -25, "on": "workbench"},
 {"name": "screw_tin", "type": "proc", "kind": "tin", "pos": [-1.32, 0, 1.06], "on": "workbench"},
 {"name": "rag", "type": "proc", "kind": "rag", "pos": [-1.96, 0, 1.215], "on": "workbench", "noDrop": True, "y": 0.0},
 {"name": "desk_lamp", "glb": "desk_lamp.glb", "pos": [-1.93, 0, 0.68], "ry": 40, "on": "workbench"},
 {"name": "tube_radio_open", "glb": "tube_radio_open.glb", "pos": [-1.38, 0, 0.7], "ry": 8, "on": "workbench"},
 {"name": "magnifier", "glb": "magnifier.glb", "pos": [-1.02, 0, 0.97], "ry": -30, "on": "workbench"},
 {"name": "soldering_iron", "glb": "soldering_iron.glb", "pos": [-1.85, 0, 1.1], "ry": 15, "on": "workbench"},
 {"name": "enamel_mug", "glb": "enamel_mug.glb", "pos": [-2.25, 0, 1.15], "ry": 30, "on": "workbench"},
 {"name": "robot", "glb": "robot.glb", "pos": [-0.5, 0, 1.2], "ry": -40},
 {"name": "toolbox", "glb": "toolbox.glb", "pos": [-1.55, 0, 1.7], "ry": 14},
 {"name": "back_door", "glb": "back_door.glb", "pos": [1.75, 0, 0], "wall": "back"},
 {"name": "wall_clock", "glb": "wall_clock.glb", "pos": [2.63, 1.78, 0], "wall": "back"},
 {"name": "parts_cabinet", "glb": "parts_cabinet.glb", "pos": [2.62, 0, -0.6], "ry": -90},
 {"name": "stool_2", "glb": "stool.glb", "pos": [1.25, 0, 0.55], "ry": 12},
 {"name": "queue_carton", "type": "carton", "front": "box_a", "size": [0.46, 0.4, 0.4], "pos": [2.7, 0, 0.42], "ry": -92},
 {"name": "queue_tv", "glb": "crt_tv.glb", "pos": [2.68, 0, 0.42], "ry": -104, "on": "queue_carton"},
 {"name": "queue_fan", "glb": "desk_fan.glb", "pos": [2.7, 0, 0.84], "ry": -120},
 {"name": "queue_radio", "glb": "tube_radio_closed.glb", "pos": [2.75, 0, 1.42], "ry": -84},
 {"name": "meter_box", "glb": "../v2/meterbox.glb", "pos": [2.42, 1.72, 0], "ry": -90, "wall": "front-out"},
 {"name": "flat_cartons", "glb": "../v2/cardboard.glb", "pos": [2.42, 0, 1.95], "ry": 4, "scale": 0.6},
 {"name": "spare_arm", "glb": "spare_arm.glb", "pos": [2.9, 1.32, -0.92], "ry": -90, "wall": "right"},
 {"name": "spare_torso", "glb": "spare_torso.glb", "pos": [-1.02, 0, 1.78], "ry": 150},
 {"name": "spare_leg", "glb": "spare_leg.glb", "pos": [2.9, 1.3, -0.48], "ry": -90, "wall": "right"},
 {"name": "drop_carton_a", "type": "carton", "front": "box_b", "size": [0.4, 0.46, 0.34], "pos": [1.45, 0, 1.62], "ry": -14},
 {"name": "drop_carton_b", "type": "carton", "front": "box_a", "size": [0.42, 0.36, 0.38], "pos": [1.97, 0, 1.4], "ry": 8},
 {"name": "drop_fan", "glb": "desk_fan.glb", "pos": [1.97, 0, 1.4], "ry": -150, "on": "drop_carton_b", "tint": [0.95, 0.9, 0.78]},
 {"name": "stool_tv", "glb": "stool.glb", "pos": [0.45, 0, -1.05], "ry": -18},
 {"name": "tv_on_stool", "glb": "crt_tv.glb", "pos": [0.45, 0, -1.05], "ry": 32, "on": "stool_tv", "scale": 0.82, "tint": [0.62, 0.64, 0.66]},
 {"name": "thermos_floor", "glb": "thermos.glb", "pos": [1.25, 0, 0.55], "ry": 40, "on": "stool_2"},
 {"name": "bicycle", "glb": "bicycle.glb", "pos": [2.35, 0, 2.95], "yaw0": 35.7, "ry": 183, "roll": 10, "scale": 0.84},
]
# shelf fill: heavy cartons at the bottom, mixed electronics above, never the same model twice side by side; a second
# row of small things (clocks, mugs, thermos) in front of the big ones so the shelves read deep and lived-in.
# Depth-aware: big items stand 1 cm off the back edge, small ones 0.5 cm behind the front edge (no interpenetration).
BIG = ['tube_radio_closed.glb', 'crt_tv.glb', 'desk_fan.glb', 'cassette_recorder.glb']
SMALL = ['alarm_clock.glb', 'thermos.glb', 'enamel_mug.glb']
D = {'tube_radio_closed.glb': 0.281, 'crt_tv.glb': 0.33, 'desk_fan.glb': 0.338, 'cassette_recorder.glb': 0.175,
     'alarm_clock.glb': 0.079, 'thermos.glb': 0.136, 'enamel_mug.glb': 0.081}
CART = {'box_a': (0.46, 0.4, 0.4), 'box_b': (0.4, 0.46, 0.34)}
# colour variants per model: multiplier on the base colour (None = as generated)
TINT = {'cassette_recorder.glb': [None, [0.32, 0.32, 0.34], [0.55, 0.5, 0.46], [0.85, 0.42, 0.36]],
        'crt_tv.glb': [None, [0.62, 0.64, 0.66], [0.75, 0.6, 0.5]],
        'tube_radio_closed.glb': [None, [0.72, 0.6, 0.5], [0.95, 0.88, 0.78]],
        'desk_fan.glb': [None, [0.72, 0.92, 0.84], [0.95, 0.9, 0.78]]}
tint_i = {}
def tint_for(g):
    v = TINT.get(g)
    if not v: return None
    i = tint_i.get(g, random.randrange(len(v))); tint_i[g] = (i + 1) % len(v)
    return v[i]
out = list(fixed)
shelf_tags = {}
def fill(shelf, along, x0, x1, back, front, levels, ry, clear):
    sgn = 1 if front > back else -1   # direction from the back edge to the front edge
    tags = shelf_tags.setdefault(shelf, [])
    for lv in range(levels):
        x = x0 + random.uniform(0.01, 0.04); k = 0; last = None
        while True:
            if lv == 0:
                key = random.choice(list(CART)); w, h, dd = CART[key]
                sc = round(random.uniform(0.85, 1.0), 2); w *= sc; dd *= sc
                if x + w > x1: break
                cx = x + w / 2; c = back + sgn * (dd / 2 + 0.01)
                pos = [cx, 0, c] if along == 'x' else [c, 0, cx]
                out.append({"name": f"{shelf}_{lv}_{k}", "type": "carton", "front": key, "size": [round(w, 3), round(h * sc, 3), round(dd, 3)],
                            "pos": [round(pos[0], 3), 0, round(pos[2], 3)], "ry": ry + random.uniform(-3, 3), "on": shelf, "level": lv})
                x += w + random.uniform(0.01, 0.03); k += 1; continue
            cands = [g for g in BIG if H[g] <= clear[lv] and g != last]
            g = random.choice(cands); last = g
            sc = round(random.uniform(0.78, 0.92) if g == 'crt_tv.glb' and random.random() < 0.5 else random.uniform(0.92, 1.0), 2)  # 14-inch and 18-inch sets
            yaw = random.uniform(-12, 12) if random.random() < 0.6 else random.uniform(-4, 4)   # not a shop display: some are askew
            a = math.radians(yaw)
            w = (W[g] * abs(math.cos(a)) + D[g] * abs(math.sin(a))) * sc      # rotated footprint along the shelf
            dep = (W[g] * abs(math.sin(a)) + D[g] * abs(math.cos(a))) * sc    # ... and across it
            if x + w > x1: break
            cx = x + w / 2; c = back + sgn * (dep / 2 + 0.012)
            if dep > abs(front - back) - 0.01: yaw = 0; a = 0; dep = D[g] * sc; w = W[g] * sc; c = back + sgn * (dep / 2 + 0.012)
            pos = [cx, 0, c] if along == 'x' else [c, 0, cx]
            it = {"name": f"{shelf}_{lv}_{k}", "glb": g, "pos": [round(pos[0], 3), 0, round(pos[2], 3)], "ry": ry + yaw,
                  "on": shelf, "level": lv, "scale": sc}
            t = tint_for(g)
            if t: it["tint"] = t
            out.append(it)
            if random.random() < 0.5:
                tags.append([round(cx - (x0 + x1) / 2 + random.uniform(-0.08, 0.08), 3) * (1 if along == 'x' else -1), lv,
                             random.choice(range(10)) if random.random() < 0.8 else random.choice([10, 11])])
            # sometimes a small thing stacked on top (clock on a radio), when it clears the board above
            if g == 'tube_radio_closed.glb' and random.random() < 0.45 and H[g] * sc + 0.17 < clear[lv] - 0.02:
                out.append({"name": f"{shelf}_{lv}_{k}t", "glb": random.choice(['alarm_clock.glb', 'enamel_mug.glb']), "pos": [round(pos[0], 3), 0, round(pos[2], 3)],
                            "ry": ry + random.uniform(-30, 30), "on": f"{shelf}_{lv}_{k}", "scale": 0.95})
            room = abs(front - back) - dep - 0.03   # free depth in front of the big item
            fits = [x for x in SMALL if D[x] * 0.95 <= room]
            if fits and random.random() < 0.7:
                sg = random.choice(fits); fz = front - sgn * (D[sg] / 2 + 0.006)
                fx = cx + random.uniform(-w / 3, w / 3)
                fpos = [fx, 0, fz] if along == 'x' else [fz, 0, fx]
                out.append({"name": f"{shelf}_{lv}_{k}s", "glb": sg, "pos": [round(fpos[0], 3), 0, round(fpos[2], 3)], "ry": ry + random.uniform(-15, 15),
                            "on": shelf, "level": lv, "scale": 0.95})
            x += w + random.uniform(0.005, 0.025); k += 1
# back shelf: x from -1.13 to 0.93, board z from -2.21 (back) to -1.72 (front)
fill('shelf_back', 'x', -1.1, 0.9, -2.21, -1.72, 5, 0, [0.58, 0.58, 0.58, 0.58, 0.45])  # top board 2.51 m: 0.49 m to the ceiling
# left shelf (rotated 90 deg: its local x runs along -z of the room... tags use shelf-local x): board x from -2.96 to -2.47
fill('shelf_left', 'z', -1.85, -0.25, -2.96, -2.47, 4, 90, [0.66, 0.66, 0.66, 0.9])
fill('shelf_left2', 'z', 0.6, 1.85, -2.95, -2.5, 4, 90, [0.56, 0.56, 0.56, 0.9])
for f in fixed:
    if f['name'] in shelf_tags: f['tags'] = shelf_tags[f['name']]
# cartons on the floor: a stack in the back-right corner by the door, two under the bench end
for i, (key, x, z, ry, lvl) in enumerate([('box_a', 0.98, -1.2, 6, 0), ('box_b', 0.99, -1.2, -3, 1), ('box_b', -2.1, 1.93, 18, 0)]):
    w, h, dd = CART[key]
    it = {"name": f"floor_carton_{i}", "type": "carton", "front": key, "size": [w, h, dd], "pos": [x, 0, z], "ry": ry}
    out.append(it)
json.dump(out, open('assets/models/shop/layout.json', 'w'), indent=1)
print(len(out), 'items')
