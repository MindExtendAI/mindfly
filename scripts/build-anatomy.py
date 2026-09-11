"""Build anatomical display points from the attributed MaleCNS derivative."""
import gzip, struct, json, pathlib, math, statistics, hashlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2: raise SystemExit('Usage: python scripts/build-anatomy.py PATH_TO_MALECNS_FLYB_GZ')
SOURCE=pathlib.Path(sys.argv[1])
b=gzip.decompress(SOURCE.read_bytes()); offset=4
def take(fmt):
    global offset
    v=struct.unpack_from('<'+fmt,b,offset); offset+=struct.calcsize('<'+fmt)
    return v[0] if len(v)==1 else v
def string(fmt):
    global offset
    n=take(fmt); s=b[offset:offset+n].decode(); offset+=n; return s
version,n,m,retina=take('4I'); dataset=string('H'); meta=json.loads(string('I'))
tables=[[string('H') for _ in range(take('H'))] for _ in range(10)]
ids=take(f'{n}q'); types=take(f'{n}I'); supers=take(f'{n}B'); classes=take(f'{n}B'); subclasses=take(f'{n}H')
nt=take(f'{n}B'); signs=take(f'{n}b'); sides=take(f'{n}B'); offset+=6*n
xyz=take(f'{n*3}f'); offset+=n*8
rows=take(f'{n+1}I'); posts=take(f'{m}I'); weights=take(f'{m}H')
typ=lambda i:tables[0][types[i]]
sup=lambda i:tables[1][supers[i]]
points=[]
for i in range(n):
    p=xyz[3*i:3*i+3]
    if all(math.isfinite(x) for x in p) :
        region=2 if ('vnc' in sup(i) or sup(i)=='ascending_neuron') else (1 if sup(i).startswith('ol_') else 0)
        points.append([round(x,1) for x in p]+[region])
out={'dataset':dataset,'totalNeurons':n,'displayPoints':len(points),'points':points,'provenance':{'source':'https://male-cns.janelia.org/','derivative':'https://github.com/blendi-remade/fly-brain-minecraft','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'minSynapses':5,'model':'Anatomical soma coordinates for visual context; the walking circuit is provided separately in bpn-walking.json.'}}
(ROOT/'public/data/malecns.json').write_text(json.dumps(out,separators=(',',':')))
print('ANATOMY', len(points))
for group in range(3):
    ps=[p for p in points if p[3]==group]; print(group,[round(statistics.median(p[d] for p in ps)) for d in range(3)])
