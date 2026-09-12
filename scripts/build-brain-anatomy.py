#!/usr/bin/env python3
"""Rebuild the small public MaleCNS anatomy asset without credentials or bulk data.

Usage: python3 scripts/build-brain-anatomy.py --output-dir artifacts/brain-anatomy
Requirements: Python 3.10+ and curl. No pip packages. Cached source files are reused.
Downloads 62 selected SWCs (~12.2 MB) and 3 ROI OBJ meshes (~16.6 MB decoded),
not the whole connectome. The final combined JSON is ~3.35 MB when gzip-compressed.
"""
import collections, concurrent.futures, datetime, gzip, hashlib, json, math, pathlib, struct, subprocess

import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]/'artifacts/brain-anatomy')
args=parser.parse_args()
OUT=args.output_dir.resolve(); OUT.mkdir(parents=True,exist_ok=True)
SWC=OUT/'swc'; SWC.mkdir(exist_ok=True)
BASE='https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/'
TOLERANCE=32.0
# Fixed body IDs and metadata from the original small public query (2026-09-12).
# Static IDs make the anatomical display sample reproducible if annotations change.
SAMPLES=json.loads(r'''[{"bodyId":10013,"type":"MBON01","role":"anatomy","kind":"context","somaVoxel":[47491,8285,17919]},{"bodyId":10039,"type":"VL2a_adPN","role":"anatomy","kind":"context","somaVoxel":[39114,30616,11430]},{"bodyId":10043,"type":"ER5","role":"anatomy","kind":"context","somaVoxel":[60239,22191,16291]},{"bodyId":10060,"type":"MeVPOL1","role":"anatomy","kind":"context","somaVoxel":[69055,18358,32957]},{"bodyId":10075,"type":"DA1_lPN","role":"PN","kind":"circuit","somaVoxel":[63230,27190,13412]},{"bodyId":10079,"type":"MBON06","role":"anatomy","kind":"context","somaVoxel":[34885,21638,17997]},{"bodyId":10084,"type":"DP1m_adPN","role":"anatomy","kind":"context","somaVoxel":[40874,34504,14786]},{"bodyId":10099,"type":"ExR6","role":"anatomy","kind":"context","somaVoxel":[40307,36461,18115]},{"bodyId":10176,"type":"DM1_lPN","role":"anatomy","kind":"context","somaVoxel":[33364,26746,14922]},{"bodyId":10198,"type":"VA7l_adPN","role":"anatomy","kind":"context","somaVoxel":[42680,34237,12722]},{"bodyId":10262,"type":"V_ilPN","role":"PN","kind":"circuit","somaVoxel":null},{"bodyId":10267,"type":"MBON14","role":"anatomy","kind":"context","somaVoxel":[43288,34422,17616]},{"bodyId":10275,"type":"MeVPMe13","role":"anatomy","kind":"context","somaVoxel":[48408,18372,33022]},{"bodyId":10298,"type":"MeVPMe13","role":"anatomy","kind":"context","somaVoxel":[50542,16646,33366]},{"bodyId":10324,"type":"ExR1","role":"anatomy","kind":"context","somaVoxel":[44472,19435,35654]},{"bodyId":10330,"type":"MeVPOL1","role":"anatomy","kind":"context","somaVoxel":[26902,18912,32890]},{"bodyId":10358,"type":"MeVPMe12","role":"anatomy","kind":"context","somaVoxel":[46850,23240,37156]},{"bodyId":10396,"type":"FB2F_a","role":"anatomy","kind":"context","somaVoxel":[67550,12099,32998]},{"bodyId":10443,"type":"MeVPMe12","role":"anatomy","kind":"context","somaVoxel":[50025,17640,32908]},{"bodyId":10451,"type":"MeVPMe12","role":"anatomy","kind":"context","somaVoxel":[51589,21822,36398]},{"bodyId":10453,"type":"FB6A_a","role":"anatomy","kind":"context","somaVoxel":[63046,11054,33262]},{"bodyId":10495,"type":"MBON05","role":"anatomy","kind":"context","somaVoxel":[35810,22057,18888]},{"bodyId":10513,"type":"Delta7","role":"anatomy","kind":"context","somaVoxel":[43971,19800,36766]},{"bodyId":10514,"type":"FB6A_c","role":"anatomy","kind":"context","somaVoxel":[33178,15149,34275]},{"bodyId":10599,"type":"MBON35","role":"anatomy","kind":"context","somaVoxel":[55562,18764,11266]},{"bodyId":10704,"type":"MBON11","role":"MBON","kind":"circuit","somaVoxel":[55954,18437,11939]},{"bodyId":10755,"type":"H1","role":"anatomy","kind":"context","somaVoxel":[27810,20139,20927]},{"bodyId":10816,"type":"MBON31","role":"anatomy","kind":"context","somaVoxel":[57057,9594,18069]},{"bodyId":10817,"type":"PFNv","role":"anatomy","kind":"context","somaVoxel":[51662,11977,33095]},{"bodyId":10826,"type":"MBON21","role":"anatomy","kind":"context","somaVoxel":[65079,20031,35109]},{"bodyId":10973,"type":"VP1m+VP5_ilPN","role":"PN","kind":"circuit","somaVoxel":null},{"bodyId":10977,"type":"APL","role":"APL","kind":"circuit","somaVoxel":[71892,19947,23666]},{"bodyId":11080,"type":"DM2_lPN","role":"PN","kind":"circuit","somaVoxel":[62684,27864,13980]},{"bodyId":11105,"type":"VC2_lPN","role":"PN","kind":"circuit","somaVoxel":[62096,28222,12883]},{"bodyId":11862,"type":"KCab-s","role":"KC","kind":"circuit","somaVoxel":[57110,8530,31558]},{"bodyId":12023,"type":"VA3_adPN","role":"PN","kind":"circuit","somaVoxel":[53869,21661,11400]},{"bodyId":12031,"type":"DC4_adPN","role":"PN","kind":"circuit","somaVoxel":[59584,21231,14115]},{"bodyId":12057,"type":"VM3_adPN","role":"PN","kind":"circuit","somaVoxel":[51607,21953,12886]},{"bodyId":15479,"type":"R8p","role":"anatomy","kind":"context","somaVoxel":[86291,16900,23873]},{"bodyId":15625,"type":"R8y","role":"anatomy","kind":"context","somaVoxel":[89018,16908,26868]},{"bodyId":18603,"type":"MBON07","role":"MBON","kind":"circuit","somaVoxel":[54528,18410,11684]},{"bodyId":18979,"type":"R8d","role":"anatomy","kind":"context","somaVoxel":null},{"bodyId":20428,"type":"R8_unclear","role":"anatomy","kind":"context","somaVoxel":[80170,16631,17643]},{"bodyId":28592,"type":"R1-R6","role":"anatomy","kind":"context","somaVoxel":[6960,21218,26338]},{"bodyId":29824,"type":"M_adPNm4","role":"PN","kind":"circuit","somaVoxel":[50792,19254,11636]},{"bodyId":35034,"type":"R1-R6","role":"anatomy","kind":"context","somaVoxel":[4476,26265,29774]},{"bodyId":36653,"type":"R1-R6","role":"anatomy","kind":"context","somaVoxel":[4342,25032,30868]},{"bodyId":37850,"type":"R1-R6","role":"anatomy","kind":"context","somaVoxel":[5832,22768,30075]},{"bodyId":47117,"type":"KCg-m","role":"KC","kind":"circuit","somaVoxel":[59224,9082,33042]},{"bodyId":53430,"type":"KCab-p","role":"KC","kind":"circuit","somaVoxel":[60995,11564,36022]},{"bodyId":63345,"type":"KCab-m","role":"KC","kind":"circuit","somaVoxel":[56951,13819,36737]},{"bodyId":70261,"type":"KCab-c","role":"KC","kind":"circuit","somaVoxel":[55512,13388,36716]},{"bodyId":108536,"type":"KCg-m","role":"KC","kind":"circuit","somaVoxel":[62516,10171,34110]},{"bodyId":109919,"type":"KCab-s","role":"KC","kind":"circuit","somaVoxel":[64272,8972,32177]},{"bodyId":123071,"type":"KCab-m","role":"KC","kind":"circuit","somaVoxel":[62704,9178,32714]},{"bodyId":132622,"type":"KCab-p","role":"KC","kind":"circuit","somaVoxel":[56444,12680,37016]},{"bodyId":142083,"type":"KCg-m","role":"KC","kind":"circuit","somaVoxel":[57634,8656,33330]},{"bodyId":145236,"type":"KCab-c","role":"KC","kind":"circuit","somaVoxel":[55506,10442,33158]},{"bodyId":580088,"type":"KCab-s","role":"KC","kind":"circuit","somaVoxel":[56058,10613,32590]},{"bodyId":915893,"type":"KCab-p","role":"KC","kind":"circuit","somaVoxel":[62195,7940,33589]},{"bodyId":919290,"type":"KCab-c","role":"KC","kind":"circuit","somaVoxel":[56890,12676,36762]},{"bodyId":953362,"type":"KCab-m","role":"KC","kind":"circuit","somaVoxel":null}]''')
selected={n['bodyId']:n for n in SAMPLES}
SWC_SHA256={'10013': '426a4ac42ffb6d0f9fa1a55979b0525e1c1d77a18278e57b14e78b5224ef1992', '10039': 'd3f488e036a6aad36d2059312c41c2a7256cfce7001bc186a07563cce23d5880', '10043': '5ea5223ba12cf012d4d48d87911b5647aecae29ccb616ba031d2a45e2691e8f5', '10060': 'b9c479b917562cebf944d9d7ecd1f775c884b30cccff5b99bcae637435ac03ed', '10075': '2f33194c17fdcafd11aed8582e13c6b78b0c3c62a4b64383369ff228dab01fb7', '10079': 'f9b4375c83320801c79adcdfb149c2bc466982a980665f0ba87bcf97b8dfb223', '10084': '3bf48f168fb5871a3468337ad051bba288639a167e8570645e9ed7b870160e77', '10099': '0988c9f00fb6a657e78cdd4c4b18a9926c6e3672598176002fc06510fd1338d6', '10176': 'ecea89461d6ec57bc0c49b1a74b8466c1f0cd796cd19d26d06cc86bf92a7b3a3', '10198': '87f74746d1ef32a1b6246b3a856d1fa3dba20278d1104511ad3162b4ea7eb790', '10262': 'e59bb8e5072b75e785cd281b65aaeefe15588471a9ba592b721e439c080adceb', '10267': '175924136423704eae6ec52891c7c027dacc353e7af3a46b42bad3637eb06c5b', '10275': '606210222e30ad6df833e4ab64b3e316f8ad45767420d2d5db4a99495fd22f9c', '10298': '594907cd9ef65d701b7a714be1d9ff691a2824601fdd0ec93ff625a4a3aabc5e', '10324': '7b1f21c66a46eb0e1db3899ad65abc66652732b114d141fd46984752d54cd007', '10330': 'b5541b6acb666997c532a7a507add8b56546df3b4359ddb122e5252eecf53b68', '10358': 'a4f7b03419b24ad21f44a43f2880e33c8488956da43a51b4d9d2fe6ea9173e9a', '10396': '4d1bf15782c634bc97d0e9699399ea305c168dc287492f289689bc38ec01c964', '10443': '25eb26d0fb27ad4db5c564a9a0233640543bc65c25df8511db4286b326febc71', '10451': 'e779ea989050d104a77f2d88af2f5f4b666224c00b1729081210b443e32df17b', '10453': 'e16be2b970ec8c83d8c39436ec87396c5451805b1dbf522d2ec7b7e4b0c705cc', '10495': '3cb1a358c2ea0118e6288216a465e8656bc063066b9f3779540faef7fbe01742', '10513': 'b4c5244383279de3caacee7a7e4a9e4b1308a9ee78ed44d06fabfeb5e92f1858', '10514': 'f1c10b933741e5c021ea492ddce2f15eedd1f5282ee0b9f50dad85623dcf6242', '10599': 'd59dae19f9c124db1105cfd935295fa8d99b83ccdb5621dbe88d3b3f5876ccde', '10704': 'e6bf8c5543a7eb5d3af03d07f92d31b53d95b514948289da5dbd7f201ca3fe13', '10755': 'ef1aa0e750643d495195e6e1548bc807ffa602830ce12c80236ba2355a97f0e6', '10816': 'daa83e33721918a96cd06fa75a89088039b705b5bdf3f64b0a7d6fd5d036d651', '10817': 'ed25ec169f79be1a006dbe7ed5e9c3572bee83bfecf2d318843bef9abb0b6aff', '10826': 'f19731b2f580251b53fd95e99462a654fa1b26bc24574977606696567a829f77', '10973': 'a6bc8cf6d4215a617aef047175529094a4509e8ca72ea3ea171018b6bac9440e', '10977': '34123fc48a5ffee6b9b29e857219776ccdcb737d885b9de90e2a43d57ecaf9cf', '11080': '1c75a093728dac3cc164a30449b8673d4fa649499ec64577e813a8daaf7b16bb', '11105': 'fd87e0c37acae6609621039b0a34f3ac854e91416917de2d60760a83d8efcc0d', '11862': 'db73cfe4fb5d4eb04279b33656469ade8a1e3f59bfd62af5c8bd8e32e77d0eb5', '12023': 'a84228bc5889c65835d5529cd8676f0f345242c24686d49a146403fe475acdb4', '12031': 'd8f96dad9abdb7d4e5e29a799db3f82a442879220dea6ec0c235e7352248e4ae', '12057': 'fe2a0ad9ce41a1eedcf30d73b55ac1e56f1f74f6b69e03e24da44b47d14b8255', '15479': '2ba6623b97b83ad7693ee1976779c5811649c7d003cb413d91f0dc3d05c6f576', '15625': 'e6a65eec6fb7adf29ac2f9886d671aa45324910ef7a09f681e55d5eb5cd1367b', '18603': 'fc5f7daf86a65d882e13eb77c3bf53829afc94c303ed0e002bca16195c84bdf5', '18979': '342c17a765c2f320819efc2529e5b07e7d41395c24e6b619c61f5f69a06e0251', '20428': '44a92f356c4b248273c1cf135642adac0aa3b78e09f91d6e5b95b7730356b2aa', '28592': 'b820ff249da735e883282d0558001008ca12ad8e2197afd07059219238e9cb85', '29824': '7ab4553ef552fc9da61b4e1b39f837eb1d515069d47b52f628f7750e0f855853', '35034': 'fe40257d4aff3e210608e4028b0b0ea3ab52f0f7925ceab02fcf6b6fc7c4971d', '36653': 'd1bd9a4d25680887807865ad430fd830ed4d2cc988b03293ec83f192758ec12e', '37850': 'e82dbe3fe3238ca58e1d33df09be52f2e6b892c19aa697d89c88420aaa672633', '47117': 'd02c99cb4581f8b48795d6f469520308aa61231d3e3e6aa4beab21cc3ef4f949', '53430': 'e6cde0d28ebb3a86f528b8398f766ec1222c8232d101535a5ae9fbba74501f11', '63345': 'a075db6d033bb75c3d23739c292234806f008a3f703396b19ac535b8293b41e2', '70261': 'c31c67ca18e4716881743ba8a66681579dc71e8da68804ecb9b43cab71a41d33', '108536': '88e1e0f106eafcd49b1a870ee3509940b1b9365c27319e66630519fead7e7535', '109919': 'bc96d7dda74f786309244f72c1b1961e7f1c1fbb217bb8b8a3130d52c29577e2', '123071': '756b2253615a52b6ecfd60c3a80f016d66fcb96f2cc7953f03175d7ba9091c75', '132622': '1cbc31ad0981ed49b06820fd40c53dd355b21871ee01473d87f4ee19d5565743', '142083': '1e64c9ad83de11d0ad9b27449b8dfeff210104737c1b3530e70a159c6c5752f8', '145236': '103c98faa175f9f94795d2ffaa0e0f8d86c7b70b44b3381f759a016c7cd5f870', '580088': '492ce177ea20e32f0f42021abb4b9571662b996f96831a68dd10daf74e79ad6d', '915893': '3dd0cd19edd49d88397a4b0ec88b75bb34af44f76162ec284cf63a47deecf266', '919290': 'd4bd24aadcf38c530f595ebf731fb0459dffb2057cec123f9656def155a1937f', '953362': '6c2325bd6417d4587425771dec827925f8ce53af4b92cb3690b320c7ad97987f'}

def download(node):
    body = node['bodyId']; target = SWC / f'{body}.swc'; url = BASE + f'{body}.swc'
    if not target.exists():
        p = subprocess.run(['curl','--fail-with-body','--max-time','90','--max-filesize','2000000','-sS',url],capture_output=True)
        if p.returncode: return body, None, {'url':url,'error':p.stderr.decode(errors='replace')[:250]}
        target.write_bytes(p.stdout)
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SWC_SHA256[str(body)]:
        return body, None, {'url':url,'error':'Source checksum changed; inspect upstream before accepting a different morphology.'}
    return body, raw, {'url':url,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

def distance2(point, start, end):
    line = [end[i] - start[i] for i in range(3)]
    length = sum(v*v for v in line)
    if not length: return sum((point[i]-start[i])**2 for i in range(3))
    t = max(0, min(1, sum((point[i]-start[i])*line[i] for i in range(3)) / length))
    return sum((point[i]-start[i]-t*line[i])**2 for i in range(3))

def simplify_chain(chain, nodes):
    keep = {0, len(chain)-1}; todo = [(0, len(chain)-1)]
    while todo:
        a,b = todo.pop()
        if b-a <= 1: continue
        worst,j = max((distance2(nodes[chain[i]][0],nodes[chain[a]][0],nodes[chain[b]][0]),i) for i in range(a+1,b))
        if worst > TOLERANCE*TOLERANCE:
            keep.add(j); todo.extend([(a,j),(j,b)])
    return [chain[i] for i in sorted(keep)]

def geometry(raw):
    nodes = {}
    for line in raw.decode().splitlines():
        if not line or line.startswith('#'): continue
        v = line.split()
        if len(v) >= 7: nodes[int(v[0])] = ([float(x) for x in v[2:5]], int(v[6]))
    children = collections.defaultdict(list)
    missing = 0
    for idx,(_,parent) in nodes.items():
        if parent in nodes: children[parent].append(idx)
        elif parent >= 0: missing += 1
    anchors = {idx for idx,(_,parent) in nodes.items() if parent not in nodes or len(children[idx]) != 1}
    chains = []
    for start in sorted(anchors):
        for child in sorted(children[start]):
            chain = [start,child]
            while child not in anchors:
                child = children[child][0]; chain.append(child)
            chains.append(simplify_chain(chain,nodes))
    # No fragment healing or new cross-neurite edges is ever performed.
    retained = sorted({idx for chain in chains for idx in chain} | anchors)
    index = {idx:i for i,idx in enumerate(retained)}
    positions = [round(c) for idx in retained for c in nodes[idx][0]]
    edges = [index[x] for chain in chains for a,b in zip(chain,chain[1:]) for x in (a,b)]
    soma_distance = None
    return positions, edges, {'sourceNodes':len(nodes),'retainedNodes':len(retained),'edges':len(edges)//2,
        'roots':sum(parent not in nodes for _,parent in nodes.values()),'missingParentReferences':missing,
        'bbox':[[min(p[0][axis] for p in nodes.values()) for axis in range(3)],
                [max(p[0][axis] for p in nodes.values()) for axis in range(3)]]}, nodes

manifest = {'schema':1,'dataset':'male-cns:v1.0','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'coordinateSpace':'MaleCNS EM / DVID original, not mirrored or template transformed',
    'units':'8 nm voxels','voxelSizeNm':[8,8,8],
    'license':'CC BY 4.0','source':'https://male-cns.janelia.org/download/',
    'selection':'27 model circuit cells (9 PN, 15 KC spanning 5 types, 2 MBON, 1 APL), plus up to four traced body IDs per class and soma side from CX/visual/ol_bilateral/MBON/ALPN; anatomical background is not simulated.',
    'simplification':{'algorithm':'Ramer-Douglas-Peucker independently on maximal unbranched SWC chains',
        'toleranceVoxels':TOLERANCE,'toleranceNm':TOLERANCE*8,'outputPositionRoundingVoxels':1,
        'branchEndpointsPreserved':True,'fragmentHealing':False,'addedCrossNeuriteLinks':False},
    'neurons':[], 'failures':[]}
payload = {'schema':1,'dataset':'male-cns:v1.0','units':'8 nm voxels','neurons':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for body,raw,source in pool.map(download,selected.values()):
        if raw is None: manifest['failures'].append({'bodyId':body,**source}); continue
        node = selected[body]; pos,edges,stats,original = geometry(raw)
        soma = node.get('somaVoxel')
        if soma:
            stats['nearestSkeletonToSomaVoxels'] = round(math.sqrt(min(sum((p[i]-soma[i])**2 for i in range(3)) for p,_ in original.values())),2)
        payload['neurons'].append({'bodyId':body,'type':node['type'],'role':node['role'],'kind':node['kind'],
            'soma':soma,'positions':pos,'edges':edges})
        manifest['neurons'].append({'bodyId':body,'type':node['type'],'role':node['role'],'kind':node['kind'],'source':source,**stats})
if manifest['failures']:
    (OUT/'skeleton-failures.json').write_text(json.dumps(manifest['failures'],indent=2))
    raise RuntimeError('Some selected skeletons could not be reproduced; see skeleton-failures.json')
payload['neurons'].sort(key=lambda n:n['bodyId']); manifest['neurons'].sort(key=lambda n:n['bodyId'])
encoded=json.dumps(payload,separators=(',',':')).encode()
(OUT/'male-cns-skeletons.json').write_bytes(encoded)
(OUT/'male-cns-skeletons.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
manifest['counts']={'circuit':sum(n['kind']=='circuit' for n in manifest['neurons']),
    'context':sum(n['kind']=='context' for n in manifest['neurons']),
    'originalBytes':sum(n['source']['bytes'] for n in manifest['neurons']),
    'displayJsonBytes':len(encoded),'displayGzipBytes':len(gzip.compress(encoded,mtime=0)),
    'vertices':sum(n['retainedNodes'] for n in manifest['neurons']),'edges':sum(n['edges'] for n in manifest['neurons'])}
(OUT/'skeleton-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'counts':manifest['counts'],'failures':manifest['failures']}))


# Retrieve only the three real brain compartments, not the 90-region volume.
ROI_FILES=[('CentralBrain.obj','CentralBrain','32ff845c59e71282e42a8eeb5114820f8d985e014516663b86e1833c57ecf60e'),
 ('Optic-L.obj','Optic%28L%29','53aa38a1412f03aeb55f6cf0df0705de03edf0483de4dcb98398ee18dc7135f3'),
 ('Optic-R.obj','Optic%28R%29','7dad4d5316a1134df4d4ca916c294db179478fa29b76db0154f1607ed5668b47')]
(OUT/'roi-research').mkdir(exist_ok=True)
for filename,roi,expected_sha in ROI_FILES:
    target=OUT/'roi-research'/filename
    if not target.exists():
        url='https://neuprint.janelia.org/api/roimeshes/mesh/male-cns:v1.0/'+roi
        p=subprocess.run(['curl','--compressed','--fail-with-body','--max-time','90','--max-filesize','20000000','-sS',url],capture_output=True,check=True)
        target.write_bytes(p.stdout)
    actual=hashlib.sha256(target.read_bytes()).hexdigest()
    if actual!=expected_sha:
        raise RuntimeError(f'{filename}: source checksum changed. Inspect the upstream data before accepting a different anatomical release.')

import datetime, gzip, hashlib, json, pathlib, struct

def mesh(filename,name):
    positions=[]; indices=[]
    for line in (OUT/'roi-research'/filename).read_text().splitlines():
        bits=line.split()
        if not bits: continue
        if bits[0]=='v': positions.extend(round(float(c)) for c in bits[1:4])
        if bits[0]=='f':
            face=[int(c.split('/')[0])-1 for c in bits[1:]]
            if len(face)!=3: raise ValueError('Source ROI is expected to be triangulated')
            indices.extend(face)
    assert indices and min(indices)>=0 and max(indices)<len(positions)//3
    return {'name':name,'positions':positions,'indices':indices}

regions=[mesh('CentralBrain.obj','CentralBrain'),mesh('Optic-L.obj','Optic(L)'),mesh('Optic-R.obj','Optic(R)')]
skel=json.loads((OUT/'male-cns-skeletons.json').read_text())
skeletal_provenance=json.loads((OUT/'skeleton-provenance.json').read_text())
bounds={'min':[min(min(r['positions'][a::3]) for r in regions) for a in range(3)],
        'max':[max(max(r['positions'][a::3]) for r in regions) for a in range(3)]}
provenance={'dataset':'male-cns:v1.0','source':'https://male-cns.janelia.org/download/',
    'license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/',
    'credit':'FlyEM (HHMI Janelia), University of Cambridge, MRC Laboratory of Molecular Biology, Google Research',
    'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'coordinateTransform':'None. Original MaleCNS EM coordinates, each unit equals 8 nm. No FAFB, FlyWire or template-space assets mixed in.',
    'brainCoverage':'CentralBrain plus Optic(L) plus Optic(R) neuropil surfaces. Does not include VNC or cervical connective. These are neuropil ROI boundaries, not a cortex/cell-body envelope or a complete reconstruction of every neuron.',
    'roiSourceTemplate':'https://neuprint.janelia.org/api/roimeshes/mesh/male-cns:v1.0/{encoded_roi}',
    'roiProcessing':'All original vertices and triangles retained; positions rounded to nearest 8 nm voxel (at most 4 nm error per axis). No synthetic geometry or mesh decimation.',
    'roiPurpose':'Visualization only, not quantitative volume/morphology analysis.',
    'skeletonSourceTemplate':'https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/{bodyId}.swc',
    'skeletonSelection':skeletal_provenance['selection'],
    'skeletonProcessing':skeletal_provenance['simplification'],
    'activityLimitation':'Only the 27 circuit sample neurons have modeled activity. The remaining 35 skeletons and the whole-brain surfaces are static anatomy, not a simulation of the whole brain. Whole-cell activity does not imply spatially modeled spike propagation along a skeleton.',
    'files':[]}
for filename,region in zip(['CentralBrain.obj','Optic-L.obj','Optic-R.obj'],regions):
    raw=(OUT/'roi-research'/filename).read_bytes()
    provenance['files'].append({'filename':filename,'region':region['name'],'sourceBytes':len(raw),
        'sha256':hashlib.sha256(raw).hexdigest(),'vertices':len(region['positions'])//3,'triangles':len(region['indices'])//3})
skeletons=[{'id':n['bodyId'],'bodyId':n['bodyId'],'type':n['type'],'role':n['role'],
    'simulated':n['kind']=='circuit' and n['role'] in ('PN','KC','MBON','APL'),'soma':n['soma'],'positions':n['positions'],'edges':n['edges']} for n in skel['neurons']]
payload={'schema':1,'coordinateSpace':'MaleCNS EM 8nm','units':'8 nm voxels','bounds':bounds,
    'regions':regions,'skeletons':skeletons,'provenance':provenance}
raw=json.dumps(payload,separators=(',',':')).encode()
(OUT/'male-cns-anatomy.json').write_bytes(raw)
(OUT/'male-cns-anatomy.json.gz').write_bytes(gzip.compress(raw,mtime=0))

# Standalone glTF binary of the complete surfaces, in the same raw voxel units.
# Materials are explicitly unlit because this compact file omits normals; browsers
# can replace material and compute vertex normals from the preserved triangles.
gltf={'asset':{'version':'2.0','generator':'MaleCNS official ROI OBJ converter'},'scene':0,
    'scenes':[{'nodes':[0,1,2]}],'nodes':[],'meshes':[],'materials':[],
    'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[],
    'extensionsUsed':['KHR_materials_unlit'],'extras':{'coordinateSpace':'MaleCNS EM 8nm','provenance':provenance}}
binary=bytearray()
def array(values,kind,target,width):
    offset=len(binary); binary.extend(struct.pack('<'+kind*len(values),*values))
    view=len(gltf['bufferViews']); gltf['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4,'target':target})
    accessor={'bufferView':view,'componentType':5126 if kind=='f' else 5125,'count':len(values)//width,'type':'VEC3' if width==3 else 'SCALAR'}
    if width==3: accessor.update(min=[min(values[a::3]) for a in range(3)],max=[max(values[a::3]) for a in range(3)])
    idx=len(gltf['accessors']); gltf['accessors'].append(accessor); return idx
for i,r in enumerate(regions):
    pos=array(r['positions'],'f',34962,3); idx=array(r['indices'],'I',34963,1)
    gltf['nodes'].append({'name':r['name'],'mesh':i})
    gltf['meshes'].append({'name':r['name'],'primitives':[{'attributes':{'POSITION':pos},'indices':idx,'material':i,'mode':4}]})
    gltf['materials'].append({'name':r['name'],'doubleSided':True,'alphaMode':'BLEND',
        'pbrMetallicRoughness':{'baseColorFactor':[0.45,0.6,0.7,0.25],'metallicFactor':0,'roughnessFactor':1},
        'extensions':{'KHR_materials_unlit':{}}})
gltf['buffers'][0]['byteLength']=len(binary)
js=json.dumps(gltf,separators=(',',':')).encode(); js+=b' '*((-len(js))%4); binary.extend(b'\0'*((-len(binary))%4))
glb=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'male-cns-brain-surfaces.glb').write_bytes(glb)
summary={'regions':len(regions),'vertices':sum(len(r['positions'])//3 for r in regions),
    'triangles':sum(len(r['indices'])//3 for r in regions),'skeletons':len(skeletons),'bounds':bounds,
    'jsonBytes':len(raw),'gzipBytes':len(gzip.compress(raw,mtime=0)),'surfacesGlbBytes':len(glb),
    'files':provenance['files'],'sha256':{'male-cns-anatomy.json':hashlib.sha256(raw).hexdigest(),
    'male-cns-brain-surfaces.glb':hashlib.sha256(glb).hexdigest()}}
(OUT/'anatomy-manifest.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
