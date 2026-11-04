# -*- coding: utf-8 -*-
import os, json, glob, io

SRC = r"C:\temp\20260908 heart\01_서울대 HH model 학생실습\param"
OUT = r"C:\temp\20260908 heart\heart_html\js\params.js"

def readlines(path):
    with io.open(path, 'r', encoding='cp949', errors='replace') as f:
        return f.read().splitlines()

def parse_kv(path):
    """Mimic CFileIO: split each line at first '=', name left, value right (spaces stripped)."""
    out = []
    for line in readlines(path):
        if '=' not in line:
            continue
        name, val = line.split('=', 1)
        out.append((name.strip(), val.replace(' ', '').strip()))
    return out

def num(s):
    try:
        return float(s)
    except ValueError:
        # atof-like: parse leading number
        import re
        m = re.match(r'\s*[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?', s)
        return float(m.group(0)) if m else 0.0

prm, sfs = {}, {}
for p in sorted(glob.glob(os.path.join(SRC, '*.prm'))):
    kv = parse_kv(p)
    prm[os.path.basename(p)[:-4]] = [num(v) for _, v in kv][:19]
for p in sorted(glob.glob(os.path.join(SRC, '*.sfs'))):
    kv = parse_kv(p)
    sfs[os.path.basename(p)[:-4]] = [num(v) for _, v in kv][:17]

ion = [num(v) for _, v in parse_kv(os.path.join(SRC, 'default.ion'))][:7]
con = [num(v) for _, v in parse_kv(os.path.join(SRC, 'default.con'))][:4]

# colors from default.cls  ->  index 1..N
colors = ['#ffffff']
for line in readlines(os.path.join(SRC, 'default.cls')):
    line = line.strip()
    if not line:
        continue
    rgbpart = line.split('\t')[0].split()[0]
    parts = rgbpart.split(',')
    if len(parts) < 3:
        continue
    try:
        r, g, b = (int(float(x)) for x in parts[:3])
    except ValueError:
        continue
    colors.append('#%02x%02x%02x' % (r, g, b))

# names for UI labels, from default files
prm_names = [n for n, _ in parse_kv(os.path.join(SRC, 'default.prm'))][:19]
sfs_names = [n for n, _ in parse_kv(os.path.join(SRC, 'default.sfs'))][:17]
ion_names = [n for n, _ in parse_kv(os.path.join(SRC, 'default.ion'))][:7]
con_names = [n for n, _ in parse_kv(os.path.join(SRC, 'default.con'))][:4]

data = {
    'PRM': prm, 'SFS': sfs, 'ION': ion, 'CON': con, 'COLORS': colors,
    'PRM_NAMES': prm_names, 'SFS_NAMES': sfs_names,
    'ION_NAMES': ion_names, 'CON_NAMES': con_names,
}

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Auto-generated from "01_\uc11c\uc6b8\ub300 HH model \ud559\uc0dd\uc2e4\uc2b5/param" -- do not edit by hand.\n')
    f.write('// PRM: Pulse[0..18], SFS: file order -> SF[3..14] then SF[19..23]\n')
    f.write('var PARAMS = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')

print('prm:', list(prm))
print('sfs:', list(sfs))
print('ion:', ion)
print('con:', con)
print('colors:', len(colors), colors[:5], colors[13:16])
print('names:', sfs_names)
