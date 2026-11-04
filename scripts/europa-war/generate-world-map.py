"""Build a bounded offline world atlas from Natural Earth and explicit 1936 rules.

Usage: PYTHONPATH=/path/to/shapely python3 scripts/europa-war/generate-world-map.py
       /path/to/ne_50m_admin_0_countries.geojson [output.json]
Existing European province IDs, values and connections remain stable. Historical
administrations and new city partitions are explicit scenario approximations,
NOT surveyed 1936 administrative boundaries. See WORLD-MAP-SOURCES.md.
"""
import copy
import hashlib
import json
import math
import re
import sys
from collections import defaultdict, deque
from pathlib import Path

from shapely import make_valid, set_precision
from shapely.affinity import affine_transform
from shapely.geometry import shape, box, Polygon, Point, MultiPolygon, GeometryCollection
from shapely.ops import unary_union, nearest_points
from shapely.strtree import STRtree

HERE = Path(__file__).resolve().parent
SOURCE = Path(sys.argv[1])
OUTPUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/workspace/scratch/world-map-data.json')
RAW_BOUNDARIES = len(sys.argv) > 3 and sys.argv[3] == '--raw-boundaries'
base = json.loads((HERE / 'europe-1936-base.json').read_text())
manifest = json.loads((HERE / 'world-scenario.json').read_text())
features = json.loads(SOURCE.read_text())['features']
raw = {f['properties']['ADM0_A3']: shape(f['geometry']).buffer(0) for f in features}
properties = {f['properties']['ADM0_A3']: f['properties'] for f in features}
WORLD = box(-180, -65, 180, 85)
EUROPE = box(-25, 32, 62, 72)
SHIFT_X, SHIFT_Y = 2325, 286
WIDTH, HEIGHT = 5400, 3300
old_ids = {p['id'] for p in base['provinces']}
old_country_ids = {c['id'] for c in base['countries']}
code_owner = {}
for owner, codes in manifest['assignments'].items():
    for code in codes:
        code_owner[code] = owner
assert set(raw) - set(code_owner) == {'ATA'}, sorted(set(raw) - set(code_owner))


def polygons(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [geom]
    if geom.geom_type not in ['MultiPolygon', 'GeometryCollection']:
        return []
    return [p for child in geom.geoms for p in polygons(child)]


def parse_old_path(path):
    rings = []
    for segment in path.split('Z'):
        if not segment:
            continue
        nums = list(map(float, re.findall(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)', segment)))
        points = [(nums[i] / 15 - 25, 72 - nums[i+1] / 22) for i in range(0, len(nums), 2)]
        if len(points) >= 3:
            p = Polygon(points).buffer(0)
            rings.extend(polygons(p))
    # Outer/hole winding is not a reliable discriminator in the old SVG paths.
    rings.sort(key=lambda p: -p.area)
    result = GeometryCollection()
    for ring in rings:
        result = result.symmetric_difference(ring)
    return result.buffer(0)


def project(lon, lat):
    return ((lon + 180) * 15, (85 - lat) * 22)


def svg(geom, tolerance=.045):
    geom = geom.simplify(0 if RAW_BOUNDARIES else tolerance, preserve_topology=True)
    # Quantizing individual vertices after validation can create self-crossing
    # slivers at inherited seams. Snap the projected topology as a whole first.
    geom = make_valid(set_precision(affine_transform(geom, [15, 0, 0, -22, 2700, 1870]), .01, mode='pointwise'))
    assert geom.is_valid
    parts = []
    for polygon in polygons(geom):
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = [(round(x, 2), round(y, 2)) for x, y in ring.coords]
            assert Polygon(coords).is_valid, 'Invalid serialized SVG ring after quantization'
            # Two decimals preserve real microstate geometry; never inflate land.
            parts.append('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in coords)+'Z')
    return ''.join(parts)


def shift_old_path(path):
    return re.sub(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)',
                  lambda m: f'{float(m[1])+SHIFT_X:.1f},{float(m[2])+SHIFT_Y:.1f}', path)


# Add the original country geometry separately. Original source codes inside the
# former rectangle must not produce thousands of rounded coastline slivers.
old_codes = {'TUR','DEU','FRA','GBR','ITA','RUS','UKR','BLR','GEO','ARM','AZE','POL',
             'CZE','SVK','SRB','HRV','SVN','BIH','MNE','MKD','KOS','ESP','PRT','ROU',
             'MDA','HUN','BGR','GRC','ALB','AUT','CHE','BEL','NLD','LUX','DNK','ISL',
             'NOR','SWE','FIN','EST','LVA','LTU','IRL'}
extra = defaultdict(list)
assigned_features = []
for code, geom in raw.items():
    if code == 'ATA':
        continue
    owner = code_owner[code]
    geom = geom.intersection(WORLD)
    if code in old_codes:
        geom = geom.difference(EUROPE)
    if geom.is_empty:
        continue
    extra[owner].append(geom)
    assigned_features.append((code,owner,geom))
extra = {owner:unary_union(parts).buffer(0) for owner,parts in extra.items()}
for country in manifest['countries']:
    extra.setdefault(country['id'], GeometryCollection())


def transfer(source, target, region):
    piece = extra[source].intersection(region)
    extra[source] = extra[source].difference(piece).buffer(0)
    extra[target] = extra.get(target,GeometryCollection()).union(piece).buffer(0)
    return piece


# Deliberately coarse, documented historical divisions of modern polygons.
transfer('canada','newfoundland',unary_union([
    box(-59.5,46,-52,52), Polygon([(-64,52),(-56,51),(-55,61),(-64,61),(-66,55)])]))
transfer('china','manchukuo',Polygon([(119.1,39.0),(123.7,38.7),(136,43),(136,55),(119.1,55)]))
transfer('china','tibet',Polygon([(78,27),(89,27),(98.5,29.5),(98,33.5),(91,36.5),(79,35.5)]))
transfer('china','xinjiang',Polygon([(72,35),(87,35),(96,41),(90,49.8),(78,49.8)]))
transfer('ussr','tannutuva',Polygon([(89,49.5),(92,50),(98.8,50),(99,52),(97,53.5),(93,53.3),(89,51.8)]))
transfer('ussr','japan',box(140,45,145.6,50))
transfer('ussr','japan',Polygon([(145,43),(148,43),(158,51.3),(155.3,52),(147,46)]))
transfer('france','spain',Polygon([(-6.1,35.0),(-3.1,35.0),(-2.1,35.8),(-5.5,36.1)]))
transfer('yemen','uk',Polygon([(42.7,12),(54,12),(54,19),(49,18),(46.6,15.5),(44,13.8),(43,13.7)]))
# The canal administration is a separate US province, not the Panamanian capital.
canal = transfer('panama','usa',Polygon([(-79.98,9.37),(-79.83,9.43),(-79.55,9.05),(-79.62,8.96)]))

countries = copy.deepcopy(base['countries'])
for c in countries:
    c['initialSubjectOf'] = None
    c['allies'] = []
    c['path'] = shift_old_path(c['path'])
    if c['id']=='denmark':
        c['name']='Danimarka'
for row in manifest['countries']:
    c={k:copy.deepcopy(row[k]) for k in ['id','name','flag','color','leader','ideology','population','industry','science','initialSubjectOf','allies']}
    c['capital']='denmark-2' if c['id']=='iceland' else row['cities'][0]['id']
    c['path']=''
    countries.append(c)
country_by_id={c['id']:c for c in countries}
assert len(country_by_id)==len(countries)
provinces=copy.deepcopy(base['provinces'])
shapes=[]
for p in provinces:
    shapes.append(parse_old_path(p['path']))
    p['lon']=round(p['x']/15-25,5)
    p['lat']=round(72-p['y']/22,5)
    p['path']=shift_old_path(p['path'])
    p['x']=round(p['x']+SHIFT_X,1);p['y']=round(p['y']+SHIFT_Y,1)
    p['initialController']=None
    if p.get('legacyRegion')=='denmark-2':
        p['country']='iceland'
# Tiny Gibraltar cut is localized; all pre-existing land routes remain valid.
gibraltar = Polygon([(-5.365,36.107),(-5.342,36.107),(-5.334,36.142),(-5.342,36.159),(-5.360,36.154)])
for i,p in enumerate(provinces):
    if p['country']=='spain' and shapes[i].intersects(gibraltar):
        piece=shapes[i].intersection(gibraltar)
        shapes[i]=shapes[i].difference(gibraltar).buffer(0)
        p['path']=svg(shapes[i],0)
        extra['uk']=extra['uk'].union(piece).buffer(0)

# Preserve rounded legacy borders exactly; new geography yields at those seams.
legacy_land = unary_union(shapes).buffer(0)
extra = {owner: geom.difference(legacy_land).buffer(0) for owner, geom in extra.items()}

# Existing player holdings retain their province economy; new land uses a
# separate bounded allocation. These are game-scale economic estimates.
extra_industry={'uk':16,'france':13,'ussr':15,'italy':3,'belgium':4,'portugal':3,'netherlands':1,'spain':2,'denmark':0,'norway':0}
for c in countries:
    if c['id'] in manifest['extraPopulation']:
        c['population'] += manifest['extraPopulation'][c['id']]
        c['industry'] += extra_industry[c['id']]
country_by_id['denmark']['population'] -= country_by_id['iceland']['population']

# Use explicit city points plus an administrative marker for otherwise unnamed
# source territories. This makes tiny colonies selectable without fake circles.
seeds={row['id']:copy.deepcopy(row['cities']) for row in manifest['countries']}
for owner,cities in manifest['extraCities'].items():
    seeds[owner]=copy.deepcopy(cities)
seeds['usa'].append({'id':'usa-global-panama-canal','name':'Panama Kanal Bölgesi','lon':-79.75,'lat':9.2})
seeds['japan'] += [dict(id='japan-karafuto',name='Karafuto',lon=142.74,lat=46.96),dict(id='japan-kuriles',name='Kuril Adaları',lon=156.35,lat=50.74)]
for city in seeds['panama']:
    if city['id']=='panama-0':city.update(name='Panama',lon=-79.49,lat=8.98)
# Important territory codes normally have a real named city already. Remaining
# small islands receive their Natural Earth Turkish label and interior marker.
for code,owner,geom in assigned_features:
    remaining=geom.intersection(extra.get(owner,GeometryCollection()))
    if remaining.is_empty or any(remaining.buffer(.15).covers(Point(s['lon'],s['lat'])) for s in seeds.get(owner,[])):
        continue
    if remaining.area<.00001:continue
    point=max(polygons(remaining),key=lambda p:p.area).representative_point()
    label=properties[code].get('NAME_TR') or properties[code]['NAME']
    seeds.setdefault(owner,[]).append(dict(id=f'{owner}-global-{code.lower()}',name=label,lon=point.x,lat=point.y))

# Ocean coast only; land borders and the Caspian do not make launchable ports.
land_union=unary_union([g.intersection(WORLD) for code,g in raw.items() if code!='ATA']).buffer(0)
coast=unary_union([part.exterior for part in polygons(land_union)])
old_port_zones={'turkey-1':'black','turkey-2':'mediterranean','turkey-5':'mediterranean','turkey-6':'black','germany-1':'north','germany-8':'baltic','germany-9':'baltic','france-1':'north','france-4':'mediterranean','france-6':'atlantic','france-8':'mediterranean','uk-0':'north','uk-3':'north','uk-5':'north','uk-6':'north','ussr-1':'baltic','ussr-5':'black','ussr-9':'north','ussr-10':'north','denmark-0':'baltic','denmark-1':'north','denmark-2':'atlantic','sweden-0':'baltic','sweden-1':'north','sweden-2':'baltic','spain-1':'mediterranean','spain-2':'mediterranean'}

def basin(p):
    old=p.get('legacyRegion',p['id'])
    if old in ['ussr-9','ussr-10']:return 'arctic'
    if old in old_port_zones:return old_port_zones[old]
    if p['id'] in old_ids:
        owner=p['country']
        if owner in ['romania','bulgaria']:return 'black'
        if owner in ['italy','greece','albania','yugoslavia']:return 'mediterranean'
        if owner in ['finland','estonia','latvia','lithuania','poland']:return 'baltic'
        if owner in ['norway','netherlands','belgium']:return 'north'
        return 'atlantic'
    lon,lat=p['lon'],p['lat']
    if lat>=68:return 'arctic'
    if -6<lon<36 and 29<lat<46:return 'mediterranean'
    if 26<lon<43 and 40<lat<47:return 'black'
    if 10<lon<32 and 53<lat<67:return 'baltic'
    if -7<lon<13 and 48<lat<68:return 'north'
    if -98<lon<-59 and 7<lat<31:return 'caribbean'
    if (lon>=100 or lon<=-100):return 'northPacific' if lat>=0 else 'southPacific'
    if 20<lon<120 and lat<31:return 'indian'
    return 'atlantic' if lat>=0 else 'southAtlantic'

def terrain_for(owner,city):
    name,lon,lat=city['name'],city['lon'],city['lat']
    if city['id']==country_by_id[owner]['capital']:return 'urban'
    if owner in ['nepal','bhutan','tibet','afghanistan','bolivia','peru','chile'] and coast.distance(Point(lon,lat))>1:return 'mountain'
    if owner in ['iran','saudi','oman','yemen','egypt','trucial'] or (owner in ['uk','france','italy','spain'] and 14<lat<30 and -18<lon<40):return 'desert'
    if (owner in ['brazil','colombia','ecuador','peru'] and -15<lat<8) or owner in ['eastindies','indochina','malaya'] or (owner=='ussr' and lat>58):return 'forest'
    if name in ['Denver','Salt Lake City','Kunming','Chengdu','Santiago','Mendoza','İsfahan','Kandahar','Tucumán','Caracas']:return 'mountain'
    return 'plains'

def allocate(total,n):
    return [total//n+(i<total%n) for i in range(n)]

for owner in sorted(extra):
    geom=extra[owner]
    if geom.is_empty:continue
    # Keep small whole polities, named islands, and meaningful coasts. Dropping
    # sub-pixel uninhabited offshore rocks bounds WebGL coast geometry.
    candidates=seeds.get(owner,[])
    parts=polygons(geom)
    kept=[p for p in parts if p.area>=.006 or any(p.buffer(.015).covers(Point(s['lon'],s['lat'])) for s in candidates)]
    if not kept:kept=[max(parts,key=lambda p:p.area)]
    geom=unary_union(kept).buffer(0)
    actual=[]
    for city in candidates:
        point=Point(city['lon'],city['lat'])
        # Avoid duplicating old European cities already represented by a stable ID.
        if owner in old_country_ids and geom.distance(point)>1.2 and EUROPE.contains(point):continue
        if geom.distance(point)>2 and owner in old_country_ids:continue
        if not geom.contains(point):
            point=nearest_points(geom,point)[0]
            interior=geom.buffer(-.00001)
            if not interior.is_empty:point=nearest_points(interior,point)[0]
        if any(point.distance(s['point'])<.001 for s in actual):continue
        actual.append({**city,'point':point})
    if not actual:
        point=geom.representative_point()
        actual=[dict(id=f'{owner}-global-region',name=country_by_id[owner]['name'],lon=point.x,lat=point.y,point=point)]
    # Split special canal geography as one actual province, never cross-country
    # Voronoi influence. Its line separates the connecting oceans in game data.
    if owner=='usa':
        canal_city=next(s for s in actual if s['id']=='usa-global-panama-canal')
        actual.remove(canal_city)
        geom=geom.difference(canal)
    else:canal_city=None
    n=len(actual)+(1 if canal_city else 0)
    new_owner=owner not in old_country_ids
    total_pop=country_by_id[owner]['population'] if new_owner else manifest['extraPopulation'].get(owner,100000)
    industry=country_by_id[owner]['industry'] if new_owner else extra_industry.get(owner,0)
    pop_parts=allocate(total_pop,n);civil_parts=allocate(industry,n);mil_parts=allocate(max(0,industry//2),n)
    generated=[]
    for i,city in enumerate(actual):
        region=geom
        x,y=city['point'].x,city['point'].y
        for other in actual:
            if city is other:continue
            xx,yy=other['point'].x,other['point'].y
            mx,my=(x+xx)/2,(y+yy)/2
            nx,ny=(xx-x)*.55,yy-y
            length=math.hypot(nx,ny)
            if not length:continue
            nx/=length;ny/=length;tx,ty=-ny,nx
            half=Polygon([(mx+tx*1500,my+ty*1500),(mx-tx*1500,my-ty*1500),(mx-tx*1500-nx*3000,my-ty*1500-ny*3000),(mx+tx*1500-nx*3000,my+ty*1500-ny*3000)])
            region=region.intersection(half)
        if region.is_empty or region.area<1e-12:
            raise ValueError(f'Empty new province {city["id"]}')
        generated.append((city,region))
    if canal_city:generated.append((canal_city,canal))
    for i,(city,region) in enumerate(generated):
        point=city['point']
        if not region.contains(point):point=region.representative_point()
        lat,lon=point.y,point.x
        terrain=terrain_for(owner,city)
        # Exclude inland Caspian/Aral/Great Lakes coasts from ocean basing.
        inland=(45<lon<62 and 35<lat<48) or (-93<lon<-75 and 40<lat<50)
        port=not inland and coast.distance(point)<1.2 and region.distance(coast)<.015
        if city['id']=='egypt-0':port=False
        if city['id'] in ['egypt-2','usa-global-panama-canal','uk-global-gibraltar','malaya-0']:port=True
        px,py=project(lon,lat)
        oil=8 if city['name'] in ['Abadan','Basra','Maracaibo','Houston','Balikpapan','Palembang'] else 2 if owner in ['usa','iran','iraq','mexico','venezuela'] else 0
        iron=3 if owner in ['usa','ussr','china','japan','canada','brazil','india','australia'] else 1 if civil_parts[i]>0 else 0
        p=dict(id=city['id'],name=city['name'],country=owner,path=svg(region),x=round(px,2),y=round(py,2),lon=round(lon,5),lat=round(lat,5),terrain=terrain,port=port,river=city['name'] in ['Kahire','Wuhan','Nankin','Kalküta','Léopoldville','New Orleans','Manaus','Hartum'],vp=12 if city['id']==country_by_id[owner]['capital'] else 3 if civil_parts[i]>1 else 1,population=pop_parts[i],civil=civil_parts[i],military=mil_parts[i],dock=1 if port and civil_parts[i]>0 else 0,infra=3 if civil_parts[i]>1 else 2 if civil_parts[i]>0 else 1,resources=dict(iron=iron,oil=oil,steel=0,aluminum=1 if terrain=='mountain' else 0,rubber=4 if owner in ['eastindies','malaya','indochina'] else 1 if owner=='brazil' else 0),neighbors=[],legacyRegion=city['id'],initialController='uk' if city['id']=='egypt-2' else None)
        if city['id']=='usa-global-panama-canal':p['port']=True
        p['seaZone']=basin(p)
        assert p['path'],p['id']
        provinces.append(p);shapes.append(region)
    print(owner,len(generated),flush=True)

for p in provinces:p.setdefault('seaZone',basin(p))
by_id={p['id']:p for p in provinces}
assert len(by_id)==len(provinces)
# All new land links arise from real touching polygons. Preserve all old edges;
# a translated world must not silently invalidate an old European march.
tree=STRtree(shapes)
for i,a in enumerate(shapes):
    for j in tree.query(a.buffer(.012)):
        j=int(j)
        if j>=i or (provinces[i]['id'] in old_ids and provinces[j]['id'] in old_ids):continue
        b=shapes[j]
        if a.distance(b)<.012 and a.buffer(.007).intersection(b).area>.000003:
            for u,v in [(provinces[i],provinces[j]),(provinces[j],provinces[i])]:
                if not any(e['id']==v['id'] for e in u['neighbors']):u['neighbors'].append(dict(id=v['id'],sea=False))


def sea_link(a,b):
    if a==b:return
    if a in old_ids and b in old_ids:return
    for id in [a,b]:
        assert by_id[id]['port'], f'Landlocked sea endpoint {id}'
    for u,v in [(by_id[a],by_id[b]),(by_id[b],by_id[a])]:
        if not any(e['id']==v['id'] for e in u['neighbors']):u['neighbors'].append(dict(id=v['id'],sea=True))


def distance(a,b):
    # Dateline is a sea edge only; never a hidden land connection.
    dx=abs(a['lon']-b['lon']);dx=min(dx,360-dx)
    return math.hypot(dx*math.cos(math.radians((a['lat']+b['lat'])/2)),a['lat']-b['lat'])

# Every overseas component can access its own state's ports. Use a nearest
# component spanning tree; avoid four redundant lines through every city.
for c in countries:
    domestic=[p for p in provinces if p['country']==c['id']]
    if not domestic:raise ValueError(f'No controlled land for {c["id"]}')
    domestic_ids={p['id'] for p in domestic}
    reached={c['capital']}
    if c['capital'] not in domestic_ids:raise ValueError(f'Missing capital {c["id"]}:{c["capital"]}')
    while True:
        queue=list(reached)
        for id in queue:
            for e in by_id[id]['neighbors']:
                if e['id'] in domestic_ids and e['id'] not in reached:
                    reached.add(e['id']);queue.append(e['id'])
        remaining=[p for p in domestic if p['id'] not in reached]
        if not remaining:break
        left=[p for p in remaining if p['port']]
        right=[by_id[id] for id in reached if by_id[id]['port']]
        # Landlocked enclaves rely on diplomatic land access, never fake ports.
        if not left or not right:break
        a,b=min(((a,b) for a in left for b in right),key=lambda pair:(distance(*pair),pair[0]['id'],pair[1]['id']))
        sea_link(a['id'],b['id']);reached.add(a['id'])

# Neighboring coastlines and explicit trans-ocean routes keep naval invasions,
# convoy commerce and allied access usable across the full atlas.
ports=[p for p in provinces if p['port'] and p['id']!='ussr-13']
for p in ports:
    nearest=sorted((q for q in ports if q['country']!=p['country']),key=lambda q:(distance(p,q),q['id']))
    for q in nearest[:2]:
        if distance(p,q)<22:sea_link(p['id'],q['id'])
for a,b in [('usa-1','uk-2'),('usa-16','japan-0'),('usa-23','japan-10'),('usa-23','australia-3'),('australia-1','newzealand-1'),('brazil-0','portugal-0'),('southafrica-1','brazil-0'),('southafrica-3','india-1'),('india-3','malaya-0'),('eastindies-0','australia-6'),('usa-9','usa-global-panama-canal'),('usa-global-panama-canal','usa-15')]:
    if a in by_id and b in by_id:sea_link(a,b)
# Correct local gate edges without making a permanent land bridge across water.
if 'uk-global-gibraltar' in by_id:
    sea_link('uk-global-gibraltar','spain-global-10') if 'spain-global-10' in by_id else None

# Country paths are the union of their actual local provinces. This includes
# overseas ownership and no fake world-spanning connecting polygon.
for c in countries:
    members=[shapes[i] for i,p in enumerate(provinces) if p['country']==c['id']]
    c['path']=svg(unary_union(members).buffer(0),.05)

# Strong topology/coverage checks run at generation, independent of the UI.
for i,p in enumerate(provinces):
    assert p['country'] in country_by_id and p['path']
    assert 0<=p['x']<=WIDTH and 0<=p['y']<=HEIGHT
    assert shapes[i].buffer(.025).covers(Point(p['lon'],p['lat'])),p['id']
    assert len({e['id'] for e in p['neighbors']})==len(p['neighbors']),p['id']
    for e in p['neighbors']:
        assert e['id'] in by_id and e['id']!=p['id'],(p['id'],e)
        assert any(n['id']==p['id'] and n['sea']==e['sea'] for n in by_id[e['id']]['neighbors']),(p['id'],e)
for c in countries:
    assert c['capital'] in by_id and by_id[c['capital']]['country']==c['id']
    assert c['initialSubjectOf'] is None or c['initialSubjectOf'] in country_by_id
    assert all(a in country_by_id for a in c['allies'])
    for ally in c['allies']:
        if c['id'] not in country_by_id[ally]['allies']:country_by_id[ally]['allies'].append(c['id'])
for old in base['provinces']:
    p=by_id[old['id']]
    assert old['neighbors']==[e for e in p['neighbors'] if e['id'] in old_ids],old['id']
# Individual visual simplification may shift coastlines, but strategic source
# regions cannot meaningfully overlap. Existing rounded European seams exempt.
overlaps=[]
for i,a in enumerate(shapes):
    for j in tree.query(a):
        j=int(j)
        if j>=i or (provinces[i]['id'] in old_ids and provinces[j]['id'] in old_ids):continue
        area=a.intersection(shapes[j]).area
        if area>.005:overlaps.append((provinces[i]['id'],provinces[j]['id'],area))
assert not overlaps,overlaps[:10]
result=dict(width=WIDTH,height=HEIGHT,scenario=manifest['scenario'],projection=dict(kind='equirectangular',longitudeOrigin=-180,latitudeOrigin=85,xScale=15,yScale=22),countries=countries,provinces=provinces,cities=[],sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest())
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
report=dict(scenario=manifest['scenario'],countries=len(countries),provinces=len(provinces),preservedEuropeanProvinceIds=len(old_ids),newProvinces=len(provinces)-len(old_ids),sourceFeatures=len(raw),assignedSourceFeatures=len(raw)-1,excludedSourceFeatures=['ATA'],dependencies=[dict(country=c['id'],parent=c['initialSubjectOf']) for c in countries if c['initialSubjectOf']],sourceSha256=result['sourceSha256'],mapSha256=hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),bytes=OUTPUT.stat().st_size,landEdges=sum(not e['sea'] for p in provinces for e in p['neighbors'])//2,seaEdges=sum(e['sea'] for p in provinces for e in p['neighbors'])//2,pathPoints=sum(p['path'].count('L') for p in provinces),countryPathPoints=sum(c['path'].count('L') for c in countries),notes=manifest['notes'])
OUTPUT.with_name(OUTPUT.stem+'-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False),flush=True)
