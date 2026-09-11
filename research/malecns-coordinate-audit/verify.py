"""Reproduce with Python + pyarrow: verify.py /path/to/official-annotations.feather.
Source: https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather
"""
import collections, hashlib, json, pathlib, sys
import pyarrow.feather as feather
root = pathlib.Path(__file__).resolve().parents[2]
source = pathlib.Path(sys.argv[1])
rows = feather.read_table(source).to_pylist()
by_id = {str(r['bodyId']): r for r in rows}
official_positions = {tuple(r['somaLocation']) for r in rows if r['somaLocation'] is not None}
model = json.loads((root/'public/data/bpn-walking.json').read_text())
anatomy = json.loads((root/'public/data/malecns.json').read_text())
evidence = []
for node in model['nodes']:
    official = by_id[node['id']]
    assert node['position'] == official['somaLocation'], node['id']
    assert node['type'] == official['type'], node['id']
    assert node['side'] == official['somaSide'], node['id']
    evidence.append({k: official[k] for k in ['bodyId','type','somaSide','somaLocation','superclass','somaNeuromere']})
assert all(tuple(p[:3]) in official_positions for p in anatomy['points'])
report = {
    'dataset': 'male-cns:v1.0',
    'annotation_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'annotation_rows': len(rows),
    'exact_model_coordinate_matches': len(evidence),
    'exact_background_coordinate_matches': len(anatomy['points']),
    'input_type_counts': dict(collections.Counter(n['type'] for n in model['nodes'] if n['input'])),
    'neurons': evidence,
}
(root/'research/malecns-coordinate-audit/result.json').write_text(json.dumps(report, indent=2)+'\n')
print({k:v for k,v in report.items() if k != 'neurons'})
