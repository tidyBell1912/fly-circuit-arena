#!/usr/bin/env python3
"""Fetch one small, explicitly selected MaleCNS circuit through the public API.

No authentication or whole-dataset download is required as of 2026-09-12.
Python standard library + system curl. Writes data and exact query provenance.
Run: python3 extract_circuit.py [output-directory]
"""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SERVER = 'https://neuprint.janelia.org'
DATASET = 'male-cns:v1.0'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
OUT.mkdir(parents=True, exist_ok=True)
QUERIES = []


def query(name, cypher):
    request = {'dataset': DATASET, 'cypher': cypher}
    proc = subprocess.run(
        ['curl', '--fail-with-body', '--max-time', '90', '--silent', '--show-error',
         SERVER + '/api/custom/custom', '-H', 'Content-Type: application/json',
         '--data-binary', '@-'], input=json.dumps(request), text=True,
        capture_output=True, check=True)
    raw = json.loads(proc.stdout)
    if not isinstance(raw.get('data'), list):
        raise RuntimeError(f'Unexpected API response to {name}')
    QUERIES.append({'name': name, 'request': request, 'rows': len(raw['data']),
                    'responseSha256': hashlib.sha256(proc.stdout.encode()).hexdigest()})
    (OUT / (name + '.response.json')).write_text(proc.stdout)
    return [dict(zip(raw['columns'], row)) for row in raw['data']]


def ids(rows):
    return '[' + ','.join(str(row['bodyId']) for row in rows) + ']'


FIELDS = '''n.bodyId AS bodyId,n.type AS type,n.instance AS instance,
n.somaSide AS somaSide,n.class AS cellClass,n.consensusNt AS consensusNt,
n.predictedNt AS predictedNt,n.predictedNtConfidence AS predictedNtConfidence,
n.celltypePredictedNt AS celltypePredictedNt,
n.somaLocation AS somaLocation,n.hemibrainType AS hemibrainType'''

meta = query('01_meta', '''MATCH (m:Meta) RETURN m.dataset AS dataset,m.uuid AS uuid,
m.lastDatabaseEdit AS lastDatabaseEdit,m.voxelSize AS voxelSize,
m.voxelUnits AS voxelUnits,m.info AS info LIMIT 1''')[0]

kcs = query('02_shared_kcs', '''MATCH (n:Neuron)-[a:ConnectsTo]->(m:Neuron {bodyId:18603}),
(n)-[b:ConnectsTo]->(o:Neuron {bodyId:10704})
WHERE n.class='Kenyon_Cell' AND n.somaSide='L' AND a.weight>=1 AND b.weight>=1
RETURN ''' + FIELDS + ',a.weight AS toMbon07,b.weight AS toMbon11 ORDER BY bodyId')

pns = query('03_upstream_pns', '''MATCH (n:Neuron)-[c:ConnectsTo]->(k:Neuron)
WHERE n.class='ALPN' AND k.bodyId IN ''' + ids(kcs) + ''' AND c.weight>=1
RETURN DISTINCT ''' + FIELDS + ' ORDER BY bodyId')

context = query('04_context_neurons', '''MATCH (n:Neuron)
WHERE n.bodyId IN [18603,10704,10977] OR n.type IN ['PAM11','PPL101']
RETURN ''' + FIELDS + ' ORDER BY bodyId')

nodes = []
for role, rows in [('KC', kcs), ('PN', pns), ('context', context)]:
    for row in rows:
        node = dict(row)
        node['role'] = role if role != 'context' else (
            'MBON' if row['bodyId'] in (18603,10704) else
            'APL' if row['bodyId'] == 10977 else 'DAN')
        point = node.pop('somaLocation', None)
        node['somaVoxel'] = point.get('coordinates') if point else None
        nodes.append(node)
nodes.sort(key=lambda n: n['bodyId'])
lookup = {n['bodyId']: n for n in nodes}

raw_edges = query('05_selected_edges', '''MATCH (p:Neuron)-[c:ConnectsTo]->(q:Neuron)
WHERE p.bodyId IN ''' + ids(nodes) + ''' AND q.bodyId IN ''' + ids(nodes) + ''' AND c.weight>=1
AND ((p.class='ALPN' AND q.class='Kenyon_Cell')
 OR (p.class='Kenyon_Cell' AND q.bodyId IN [18603,10704])
 OR (p.type IN ['PAM11','PPL101'] AND (q.class='Kenyon_Cell' OR q.bodyId IN [18603,10704]))
 OR (p.bodyId=10977 AND q.class='Kenyon_Cell')
 OR (p.class='Kenyon_Cell' AND q.bodyId=10977))
RETURN p.bodyId AS source,q.bodyId AS target,c.weight AS synapses ORDER BY source,target''')

edges = []
for edge in raw_edges:
    src, dst = lookup[edge['source']], lookup[edge['target']]
    edge['role'] = f"{src['role']}->{dst['role']}"
    edges.append(edge)

assert len(nodes) == len(lookup), 'duplicate node'
assert all(e['synapses'] >= 1 and isinstance(e['synapses'], int) for e in edges)
assert len({(e['source'],e['target']) for e in edges}) == len(edges), 'duplicate edge'
for kc in kcs:
    assert all(any(e['source']==kc['bodyId'] and e['target']==m for e in edges) for m in (18603,10704))

summary = {
    'nodes': len(nodes), 'edges': len(edges),
    'nodeRoles': dict(collections.Counter(n['role'] for n in nodes)),
    'edgeRoles': dict(collections.Counter(e['role'] for e in edges)),
    'synapsesByRole': dict(collections.Counter({role: sum(e['synapses'] for e in edges if e['role']==role)
                                               for role in sorted({e['role'] for e in edges})})),
    'kcTypes': dict(collections.Counter(n['type'] for n in nodes if n['role']=='KC')),
    'nodesWithSomaCoordinates': sum(n['somaVoxel'] is not None for n in nodes)
}
provenance = {
    'source': SERVER, 'dataset': DATASET,
    'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'api': '/api/custom/custom', 'authentication': 'public unauthenticated read',
    'metadata': meta,
    'license': 'CC-BY-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
    'sourceProject': 'https://male-cns.janelia.org/',
    'selectedOutputs': [
        {'bodyId': 18603, 'type': 'MBON07', 'compartment': 'alpha1', 'somaSide': 'L'},
        {'bodyId': 10704, 'type': 'MBON11', 'compartment': 'gamma1pedc', 'somaSide': 'L'}
    ],
    'selection': 'All left Kenyon cells with >=1 recorded synapse to each selected MBON; all ALPN cells with >=1 synapse into those KCs; PAM11 and PPL101 cells in both hemispheres; APL_L 10977. Includes only PN->KC, KC->selected MBON, DAN->KC/selected MBON, APL->KC, KC->APL edges.',
    'limitations': [
        'This is an explicitly selected subgraph, not an entire fly brain or a validated complete functional mushroom-body circuit.',
        'Synapse counts are structural observations; no conductances, membrane dynamics, sensory coding, motor choices, reward rule or decision policy is supplied by the connectome.',
        'SomaSide labels the soma, not all axonal territory. Both hemispheres of PAM11 and PPL101 are retained because real projections to selected left MBONs cross hemispheres.',
        'consensusNt is retained separately from raw predictions, which disagree for many KCs. Neurotransmitter alone does not determine every postsynaptic receptor sign.',
        'DAN edges are contextual structural edges; volume transmission and receptor-specific plasticity are not represented by these counts.',
        'No anatomical left/right action meaning is attributed to the two selected MBON channels. Any game action decoder is engineered.',
        '3 KCg-m cells appear in the 850 shared KCs at the permissive one-synapse threshold; do not silently call every selected KC alpha/beta.',
        'Soma coordinates are positions in dataset voxel space. Multiply elementwise by Meta voxelSize to obtain nanometers; straight-line visual edges are illustrative, not reconstructed neurites.'
    ],
    'queries': QUERIES, 'summary': summary
}
artifact = {'schemaVersion': 1, 'provenance': provenance, 'nodes': nodes, 'edges': edges}
serialized = json.dumps(artifact, ensure_ascii=False, separators=(',', ':'))
(OUT / 'male-cns-circuit.json').write_text(serialized)
provenance['artifactSha256'] = hashlib.sha256(serialized.encode()).hexdigest()
(OUT / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2))
print(json.dumps({**summary, 'jsonBytes': len(serialized.encode()),
                  'artifactSha256': provenance['artifactSha256'], 'output': str(OUT)}, indent=2))
