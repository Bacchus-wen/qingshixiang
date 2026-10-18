"""Writes assets/models/shop/layout.json: fixed hero placements + seeded shelf fill (no overlaps, items sit on boards).
  python3 tools/shop_layout.py"""
import json, math, random
random.seed(7)
W = {'tube_radio_closed.glb': 0.5, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.37, 'cassette_recorder.glb': 0.5,
     'alarm_clock.glb': 0.13, 'thermos.glb': 0.17, 'toolbox.glb': 0.5, 'tube_radio_open.glb': 0.55, 'enamel_mug.glb': 0.1}
H = {'tube_radio_closed.glb': 0.33, 'crt_tv.glb': 0.5, 'desk_fan.glb': 0.46, 'cassette_recorder.glb': 0.36,
     'alarm_clock.glb': 0.16, 'thermos.glb': 0.36, 'toolbox.glb': 0.31, 'tube_radio_open.glb': 0.35, 'enamel_mug.glb': 0.1}
fixed = [
 {"name": "shelf_back", "type": "shelf", "pos": [-0.03, 0, -1.97], "w": 2.36, "d": 0.5, "h": 2.7, "levels": 6},
 {"name": "shelf_left", "type": "shelf", "pos": [-2.72, 0, -1.05], "ry": 90, "w": 1.7, "d": 0.5, "h": 2.7, "levels": 6},
 {"name": "shelf_left2", "type": "shelf", "pos": [-2.72, 0, 1.225], "ry": 90, "w": 1.35, "d": 0.45, "h": 1.9, "levels": 4},
 {"name": "wall_plank", "type": "plank", "pos": [-1.88, 2.3, -2.25], "w": 1.08, "d": 0.24},
 {"name": "plank_radio", "glb": "tube_radio_closed.glb", "pos": [-2.16, 0, -2.12], "ry": 6, "scale": 0.8, "on": "wall_plank", "tint": [0.72, 0.6, 0.5]},
 {"name": "plank_clock", "glb": "alarm_clock.glb", "pos": [-1.84, 0, -2.13], "ry": -18, "on": "wall_plank"},
 {"name": "plank_tv", "glb": "crt_tv.glb", "pos": [-1.58, 0, -2.12], "ry": -8, "scale": 0.6, "on": "wall_plank"},
 {"name": "workbench", "glb": "workbench.glb", "pos": [-1.6, 0, 0.9], "ry": 0},
 {"name": "bench_clock", "glb": "alarm_clock.glb", "pos": [-2.24, 0, 0.92], "ry": 22, "on": "workbench"},
 {"name": "spool_a", "type": "proc", "kind": "spool", "seed": 0, "pos": [-0.99, 0, 1.06], "on": "workbench"},
 {"name": "spool_b", "type": "proc", "kind": "spool", "seed": 1, "pos": [-2.22, 0, 1.02], "on": "workbench"},
 {"name": "screwdriver_a", "type": "proc", "kind": "screwdriver", "seed": 1, "pos": [-1.6, 0, 1.12], "ry": 18, "on": "workbench"},
 {"name": "screwdriver_b", "type": "proc", "kind": "screwdriver", "seed": 0, "pos": [-1.42, 0, 1.17], "ry": -25, "on": "workbench"},
 {"name": "screw_tin", "type": "proc", "kind": "tin", "pos": [-1.38, 0, 1.08], "on": "workbench"},
 {"name": "rag", "type": "proc", "kind": "rag", "pos": [-1.81, 0, 1.215], "ry": -6, "on": "workbench", "noDrop": True, "y": 0.0},
 {"name": "desk_lamp", "glb": "desk_lamp.glb", "pos": [-1.78, 0, 0.66], "ry": 32, "on": "workbench"},
 {"name": "tube_radio_open", "glb": "tube_radio_open.glb", "pos": [-1.2, 0, 0.73], "ry": -38, "on": "workbench"},
 {"name": "magnifier", "glb": "magnifier.glb", "pos": [-1.63, 0, 0.98], "ry": 25, "on": "workbench"},
 {"name": "soldering_iron", "glb": "soldering_iron.glb", "pos": [-2.06, 0, 1.11], "ry": 12, "on": "workbench"},
 {"name": "enamel_mug", "glb": "enamel_mug.glb", "pos": [-2.22, 0, 0.6], "ry": 30, "on": "workbench"},
 {"name": "robot", "glb": "robot.glb", "pos": [-0.55, 0, 1.16], "ry": -51},
 {"name": "broom", "type": "proc", "kind": "broom", "pos": [-2.8, 0, 0.36], "ry": 90, "roll": -6, "on": "floor"},
 {"name": "aframe", "type": "proc", "kind": "aframe", "pos": [1.12, 0, 2.0], "ry": -28, "scale": 0.7, "on": "floor"},
 {"name": "toolbox", "glb": "toolbox.glb", "pos": [-1.55, 0, 1.7], "ry": 14},
 {"name": "back_door", "glb": "back_door.glb", "pos": [1.75, 0, 0], "wall": "back"},
 {"name": "wall_clock", "glb": "wall_clock.glb", "pos": [2.63, 1.78, 0], "wall": "back"},
 {"name": "parts_cabinet", "glb": "parts_cabinet.glb", "pos": [2.62, 0, -0.6], "ry": -90},
 {"name": "stool_2", "glb": "stool.glb", "pos": [2.6, 0, -1.58], "ry": 15},
 {"name": "queue_carton", "type": "carton", "front": "box_a", "size": [0.46, 0.4, 0.4], "pos": [2.7, 0, 0.42], "ry": -92},
 {"name": "queue_tv", "glb": "crt_tv.glb", "pos": [2.68, 0, 0.42], "ry": -104, "on": "queue_carton"},
 {"name": "queue_fan", "glb": "desk_fan.glb", "pos": [2.7, 0, 0.84], "ry": -120},
 {"name": "queue_radio", "glb": "tube_radio_closed.glb", "pos": [2.75, 0, 1.42], "ry": -84},
 {"name": "meter_box", "glb": "../v2/meterbox.glb", "pos": [2.42, 1.72, 0], "ry": -90, "wall": "front-out"},
 {"name": "flat_cartons", "glb": "../v2/cardboard.glb", "pos": [2.42, 0, 1.95], "ry": 4, "scale": 0.6},
 {"name": "spare_arm", "glb": "spare_arm.glb", "pos": [2.9, 1.42, -0.88], "ry": -112, "wall": "right"},
 {"name": "work_carton", "type": "carton", "front": "box_c", "uv": [0.02, 0.55, 0.98, 0.93], "tape": True, "size": [0.34, 0.14, 0.23], "pos": [-0.793, 0, 1.559], "ry": 10, "on": "floor"},
 {"name": "spare_torso", "glb": "spare_torso.glb", "pos": [-0.8, 0, 1.54], "ry": 10, "on": "work_carton", "scale": 0.92},
 {"name": "spare_leg", "glb": "spare_leg.glb", "pos": [2.9, 1.12, -0.42], "ry": -150, "wall": "right"},
 {"name": "drop_carton_a", "type": "carton", "front": "box_b", "size": [0.4, 0.46, 0.34], "pos": [0.9, 0, 1.55], "ry": 24, "on": "floor"},
 {"name": "drop_carton_b", "type": "carton", "front": "box_a", "size": [0.42, 0.36, 0.38], "pos": [1.8, 0, 1.38], "ry": 8},
 {"name": "drop_fan", "glb": "desk_fan.glb", "pos": [1.8, 0, 1.38], "ry": -95, "on": "drop_carton_b", "tint": [0.95, 0.9, 0.78]},
  {"name": "thermos_floor", "glb": "thermos.glb", "pos": [2.55, 0, -0.98], "ry": 40, "on": "parts_cabinet"},
 {"name": "bicycle", "glb": "bicycle.glb", "pos": [2.35, 0, 2.95], "yaw0": 35.7, "ry": 183, "roll": 10, "scale": 0.84},
]
# shelf fill: heavy cartons at the bottom, mixed electronics above, never the same model twice side by side; a second
# row of small things (clocks, mugs, thermos) in front of the big ones so the shelves read deep and lived-in.
# Depth-aware: big items stand 1 cm off the back edge, small ones 0.5 cm behind the front edge (no interpenetration).
BIG = ['tube_radio_closed.glb', 'crt_tv.glb', 'desk_fan.glb', 'cassette_recorder.glb']
SMALL = ['alarm_clock.glb', 'thermos.glb', 'enamel_mug.glb']
D = {'tube_radio_closed.glb': 0.281, 'crt_tv.glb': 0.33, 'desk_fan.glb': 0.338, 'cassette_recorder.glb': 0.175,
     'alarm_clock.glb': 0.079, 'thermos.glb': 0.136, 'enamel_mug.glb': 0.081}
CART = {'box_a': (0.46, 0.4, 0.4), 'box_b': (0.4, 0.46, 0.34), 'box_c': (0.32, 0.3, 0.26), 'box_d': (0.42, 0.4, 0.26)}
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
cart_use = {}
def fill(shelf, along, x0, x1, back, front, levels, ry, clear):
    sgn = 1 if front > back else -1   # direction from the back edge to the front edge
    tags = shelf_tags.setdefault(shelf, [])
    below = []; faced = {'fan': 0}; tagtxt = set()   # (centre, model) of the level below; face-on fans on this shelf
    store = random.randrange(1, levels - 1) if levels >= 5 else -1                     # a storage board, mostly cartons
    gapl = random.choice([l for l in range(1, levels - 1) if l != store]) if levels >= 5 else -1   # a board left half empty
    for lv in range(levels):
        here = []
        x = x0 + random.uniform(0.01, 0.04); k = 0; last = None
        mode = 'gap' if lv == gapl else random.choice(['dense', 'dense', 'sparse', 'gap']) if lv > 0 else 'dense'
        xe = x1 if mode != 'gap' else x0 + (x1 - x0) * random.uniform(0.5, 0.7)   # 'gap': the rest of the board stays empty
        gap_lo, gap_hi = (0.0, 0.012) if mode == 'dense' else (0.1, 0.24) if mode == 'sparse' else (0.0, 0.03)
        while True:
            low = clear[lv] < 0.5   # the low top board: only radios stand there, so mix in (smaller) cartons
            if lv == 0 or (low and random.random() < 0.5) or (lv == store and random.random() < 0.7) or (0 < lv < levels - 1 and random.random() < 0.12):
                fitk = [k_ for k_ in CART if CART[k_][1] * (0.7 if low else 0.85) <= clear[lv] - 0.02]
                # never the same print twice in a row, and the shelf's prints used in turn (no wall of one brand)
                fitk = sorted([k_ for k_ in fitk if k_ != last] or fitk, key=lambda k_: (cart_use.get((shelf, k_), 0), random.random()))
                key = fitk[0]; cart_use[(shelf, key)] = cart_use.get((shelf, key), 0) + 1; last = key; w0, h, d0 = CART[key]
                sc = round(min(random.uniform(0.85, 1.0), (clear[lv] - 0.02) / h), 2); w0 *= sc; d0 *= sc
                cyaw = random.uniform(-9, 9) if lv == 0 else random.uniform(-18, 18)
                # (plain cardboard sides to the aisle read as placeholder blocks: prints always face out)
                ca = math.radians(cyaw)
                w = w0 * abs(math.cos(ca)) + d0 * abs(math.sin(ca)); dd = w0 * abs(math.sin(ca)) + d0 * abs(math.cos(ca))
                if dd > abs(front - back) - 0.02: cyaw = 0; w = w0; dd = d0
                if x + w > x1: break
                cx = x + w / 2; c = back + sgn * (dd / 2 + 0.01)
                pos = [cx, 0, c] if along == 'x' else [c, 0, cx]
                out.append({"name": f"{shelf}_{lv}_{k}", "type": "carton", "front": key, "size": [round(w0, 3), round(h * sc, 3), round(d0, 3)],
                            "pos": [round(pos[0], 3), 0, round(pos[2], 3)], "ry": ry + cyaw, "on": shelf, "level": lv})
                x += w + random.uniform(0.01, 0.03); k += 1; continue
            nfan = sum(1 for o in out if o.get('on') == shelf and o.get('level') == lv and o.get('glb') == 'desk_fan.glb')
            # no same model straight above the same model on the board below (columns of identical sets read as stock)
            under = {m for (c0, m) in below if abs(c0 - (x + 0.22)) < 0.32}
            nfs = sum(1 for o in out if o.get('on') == shelf and o.get('glb') == 'desk_fan.glb')
            ok = lambda g: H[g] <= clear[lv] and not (g == 'desk_fan.glb' and (nfan >= 1 or nfs >= 2))
            onlv = {m for (_, m) in here}
            cands = ([g for g in BIG if ok(g) and g != last and g not in under and g not in onlv] or [g for g in BIG if ok(g) and g != last and g not in onlv]
                     or [g for g in BIG if ok(g) and g != last and g not in under] or [g for g in BIG if ok(g) and g != last] or [g for g in BIG if ok(g)])
            if not cands: break
            g = random.choice(cands); last = g
            sc = round(random.uniform(0.78, 0.92) if g == 'crt_tv.glb' and random.random() < 0.5 else random.uniform(0.92, 1.0), 2)  # 14-inch and 18-inch sets
            r = random.random()   # not a shop display: most askew, some turned well round, a few side-on
            yaw = random.uniform(-4, 4) if r < 0.12 else random.uniform(-14, 14) if r < 0.7 else random.uniform(-32, 32) if r < 0.9 else random.choice([-1, 1]) * random.uniform(60, 90)
            if g in ('tube_radio_closed.glb', 'cassette_recorder.glb') and random.random() < 0.5: yaw = random.choice([-1, 1]) * random.uniform(18, 34)
            if g == 'crt_tv.glb' and random.random() < 0.3: yaw += 180   # turned round: back cover off
            if g == 'desk_fan.glb':
                if faced['fan'] >= 1 or nfan == 1: yaw = random.choice([1, -1]) * random.uniform(70, 95) if random.random() < 0.75 else 180 + random.uniform(-40, -25)  # side-on (or to the wall, turned)
                else: faced['fan'] += 1
            a = math.radians(yaw)
            w = (W[g] * abs(math.cos(a)) + D[g] * abs(math.sin(a))) * sc      # rotated footprint along the shelf
            dep = (W[g] * abs(math.sin(a)) + D[g] * abs(math.cos(a))) * sc    # ... and across it
            if x + w > xe: break
            cx = x + w / 2; c = back + sgn * (dep / 2 + 0.012)
            if dep > abs(front - back) - 0.01:   # too deep turned like that for this board: turn it less (sign kept), square last
                base = 180 if abs(yaw) > 120 else 0; rel = yaw - base
                for f in (0.75, 0.55, 0.4, 0.25, 0):
                    a = math.radians(rel * f); dep = (W[g] * abs(math.sin(a)) + D[g] * abs(math.cos(a))) * sc
                    if dep <= abs(front - back) - 0.01: break
                yaw = base + rel * f; w = (W[g] * abs(math.cos(a)) + D[g] * abs(math.sin(a))) * sc
                if x + w > x1: break
                cx = x + w / 2; c = back + sgn * (dep / 2 + 0.012)
            stg = random.uniform(0.02, max(0.02, abs(front - back) - dep - 0.035)) if random.random() < 0.45 else 0   # pulled forward on the board
            c += sgn * stg
            pos = [cx, 0, c] if along == 'x' else [c, 0, cx]
            it = {"name": f"{shelf}_{lv}_{k}", "glb": g, "pos": [round(pos[0], 3), 0, round(pos[2], 3)], "ry": ry + yaw,
                  "on": shelf, "level": lv, "scale": sc}
            t = tint_for(g)
            if t: it["tint"] = t
            out.append(it); here.append((cx, g))
            if random.random() < 0.07:   # a few hand-written tags, never the same card twice on one shelf
                free = [t for t in range(12) if t not in tagtxt]
                if free:
                    tg = random.choice(free); tagtxt.add(tg)
                    tags.append([round(cx - (x0 + x1) / 2 + random.uniform(-0.08, 0.08), 3) * (1 if along == 'x' else -1), lv, tg])
            # sometimes a small thing stacked on top (clock on a radio), when it clears the board above
            if g == 'tube_radio_closed.glb' and random.random() < 0.3 and H[g] * sc + 0.17 < clear[lv] - 0.02:
                out.append({"name": f"{shelf}_{lv}_{k}t", "glb": random.choice(['alarm_clock.glb', 'enamel_mug.glb']), "pos": [round(pos[0], 3), 0, round(pos[2], 3)],
                            "ry": ry + random.uniform(-30, 30), "on": f"{shelf}_{lv}_{k}", "scale": 0.95})
            room = abs(front - back) - dep - 0.03 - stg   # free depth in front of the big item
            fits = [x for x in SMALL if D[x] * 0.95 <= room and H[x] * 0.95 <= clear[lv] - 0.02]
            if fits and random.random() < 0.32:
                sg = random.choice(fits); fz = front - sgn * (D[sg] / 2 + 0.006)
                fx = cx + random.uniform(-w / 3, w / 3)
                fpos = [fx, 0, fz] if along == 'x' else [fz, 0, fx]
                out.append({"name": f"{shelf}_{lv}_{k}s", "glb": sg, "pos": [round(fpos[0], 3), 0, round(fpos[2], 3)], "ry": ry + random.uniform(-15, 15),
                            "on": shelf, "level": lv, "scale": 0.95})
            x += w + random.uniform(gap_lo, gap_hi); k += 1
        below = here
# back shelf: x from -1.13 to 0.93, board z from -2.21 (back) to -1.72 (front)
fill('shelf_back', 'x', -1.17, 1.11, -2.21, -1.72, 6, 0, [0.5, 0.5, 0.5, 0.5, 0.5, 0.33])  # six boards to 2.66 m: stock to the ceiling
# left shelf (rotated 90 deg: its local x runs along -z of the room... tags use shelf-local x): board x from -2.96 to -2.47
fill('shelf_left', 'z', -1.85, -0.25, -2.96, -2.47, 6, 90, [0.5, 0.5, 0.5, 0.5, 0.5, 0.33])
fill('shelf_left2', 'z', 0.6, 1.85, -2.95, -2.5, 4, 90, [0.56, 0.56, 0.56, 0.9])
for f in fixed:
    if f['name'] in shelf_tags: f['tags'] = shelf_tags[f['name']]
# cartons on the floor: a stack in the back-right corner by the door, two under the bench end
for i, (key, x, z, ry, lvl) in enumerate([('box_a', 0.7, -1.48, 6, 0), ('box_b', 0.71, -1.48, -3, 1), ('box_b', -2.3, 2.03, 8, 0)]):
    w, h, dd = CART[key]
    it = {"name": f"floor_carton_{i}", "type": "carton", "front": key, "size": [w, h, dd], "pos": [x, 0, z], "ry": ry}
    if lvl == 0: it["on"] = "floor"
    out.append(it)
# after the floor cartons (its support must be placed first)
out.append({"name": "tv_on_cartons", "glb": "crt_tv.glb", "pos": [0.71, 0, -1.48], "ry": 24, "on": "floor_carton_1", "scale": 0.78, "tint": [0.62, 0.64, 0.66]})
json.dump(out, open('assets/models/shop/layout.json', 'w'), indent=1)
print(len(out), 'items')
