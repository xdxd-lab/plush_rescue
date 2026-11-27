#!/usr/bin/env python3
"""Build inline indexed meshes from the four authorised 3DGarden downloads.

Run outside the browser: python tools/pack-garden-props.py OUTPUT.js INPUT_DIRECTORY
Dependencies: DracoPy 2.2, NumPy, Pillow. Input layout is 1/vintage-street-light.glb,
2/city-plant-01.glb, 3/sucette-spirale.zip, 4/hot-hair-ballon-02.glb.
The optional JavaScript from the lollipop ZIP is not imported or executed.
"""
import base64
import io
import json
from pathlib import Path
import struct
import sys
import zipfile

import DracoPy
import numpy as np
from PIL import Image


def parse_glb(data):
    magic, version, end, n, fmt = struct.unpack_from('<4sIIII', data)
    assert (magic, version, end, fmt) == (b'glTF', 2, len(data), 0x4E4F534A)
    doc = json.loads(data[20:20+n])
    size, typ = struct.unpack_from('<II', data, 20+n)
    assert typ == 0x004E4942 and 28+n+size == len(data)
    buf = data[28+n:]

    def view(i):
        v = doc['bufferViews'][i]
        assert v['buffer'] == 0
        start = v.get('byteOffset', 0)
        stop = start + v['byteLength']
        assert 0 <= start < stop <= len(buf)
        return buf[start:stop]

    for mesh in doc['meshes']:
        for prim in mesh['primitives']:
            assert prim['mode'] == 4
            a = prim['extensions']['KHR_draco_mesh_compression']
            obj = DracoPy.decode(view(a['bufferView']))
            attrs = {b['unique_id']: b['data'] for b in obj.attributes}
            p, n, uv = [np.asarray(attrs[a['attributes'][k]], dtype=np.float64) for k in ('POSITION', 'NORMAL', 'TEXCOORD_0')]
            ids = np.asarray(obj.faces)
            assert len(p) < 65536 and ids.min() >= 0 and ids.max() < len(p)
            assert np.isfinite(p).all() and np.isfinite(n).all() and np.isfinite(uv).all()
            if 'images' in doc:
                im = np.asarray(Image.open(io.BytesIO(view(doc['images'][0]['bufferView']))).convert('RGB'))
                h,w = im.shape[:2]
                # The source images are colour-ramp atlases; use bilinear ramp colours
                # at Draco vertices and interpolate inside the resulting triangles.
                xy = uv * [w,h] - .5
                lo = np.floor(xy).astype(np.int32)
                u = (xy[:,0]-lo[:,0])[:,None]; v = (xy[:,1]-lo[:,1])[:,None]
                x,y=lo[:,0],lo[:,1]
                c=(im[y%h,x%w]*(1-u)+im[y%h,(x+1)%w]*u)*(1-v)+(im[(y+1)%h,x%w]*(1-u)+im[(y+1)%h,(x+1)%w]*u)*v
            else:
                c=None
            yield p, n, ids, c


def encode(a, dtype):
    return base64.b64encode(np.asarray(a,dtype=dtype).tobytes()).decode('ascii')


def package(p, n, ids, c, material):
    extent = max(abs(p).flat) / 32767
    return {
        'scale': round(float(extent), 12),
        'p': encode(np.round(p/extent), '<i2'),
        'n': encode(np.round(np.clip(n,-1,1)*127), 'i1'),
        'c': encode(np.round(np.clip(c,0,255)), 'u1'),
        'i': encode(ids, '<u2'), 'mat': material,
    }


def run(out, folder):
    f = Path(folder)
    z = f/'3/sucette-spirale.zip'
    # Read exactly one member, with a size bound; never unpack code or paths.
    with zipfile.ZipFile(z) as files:
        model = files.getinfo('sucette-spirale/sucette-spirale.glb')
        assert model.file_size < 100000
        spiral = files.read(model)
    sources = {
        'lamp': (f/'1/vintage-street-light.glb').read_bytes(),
        'plant': (f/'2/city-plant-01.glb').read_bytes(),
        'spiral': spiral,
        'balloon': (f/'4/hot-hair-ballon-02.glb').read_bytes(),
    }
    result = {}
    for name, data in sources.items():
        parts=[]
        for k,(p,n,ids,c) in enumerate(parse_glb(data)):
            material = 'stone'
            if name == 'spiral':
                # Rotate original flat model around X to put the stick upright;
                # author muted strawberry/cream colours on the original spiral.
                if k == 0:
                    angle=np.arctan2(p[:,2],p[:,0]); radius=np.hypot(p[:,0],p[:,2])
                    weight=(.5+.5*np.sin(angle-radius*43))[:,None]**.3
                    c=(1-weight)*[234,200,171]+weight*[181,98,130]
                else:
                    c=np.tile([178,148,111],(len(p),1))
                p=np.column_stack((p[:,0],.64-p[:,2],p[:,1]))
                n=np.column_stack((n[:,0],-n[:,2],n[:,1]))
                material='candy' if k==0 else 'wood'
            elif name == 'lamp':
                # Warm, legible glass inset; leave the charcoal painted metal alone.
                glass=(p[:,1]>3.2)&(c[:,0]>160)&(c[:,1]>130)&(c[:,2]<70)
                c[glass]=[255,231,172]
            elif name == 'balloon':
                # Original generic shape, custom Moonbeam palette; no logo or
                # licensed game trade dress is imported from the source atlas.
                a=np.arctan2(p[:,2],p[:,0])
                y=p[:,1]
                w=np.clip((np.sin(5*a)*.5+.5)*2-.5,0,1)[:,None]
                c=(1-w)*[133,147,199]+w*[184,149,167]
                c[y<.86]=[149,118,94]
                c[(y>=.86)&(y<1.91)]=[178,160,137]
                material='balloon'
            parts.append(package(p,n,ids,c,material))
        result[name]=parts
    out=Path(out)
    out.write_text('// Derived from four 3DGarden models. See docs/garden-props.md.\nexport const gardenPropData = '+json.dumps(result,separators=(',',':'))+';\n')
    print(out, out.stat().st_size,'bytes')


if __name__=='__main__':
    if len(sys.argv)!=3: sys.exit(f'Usage: {sys.argv[0]} OUTPUT.js INPUT_DIRECTORY')
    run(*sys.argv[1:])
