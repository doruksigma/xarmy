"""Build local scenario geometry from public-domain Natural Earth 1:110m.
Requires shapely; input is ne_110m_admin_0_countries.geojson. Strategic regions
are city-centred partitions, NOT surveyed administrative or exact 1936 borders.
"""
import json, sys, math, hashlib
from pathlib import Path
from shapely.geometry import shape, box, Polygon, Point
from shapely.ops import unary_union
SOURCE=Path(sys.argv[1]); output=Path('app/games/europa-war/strategy/map-data.json')
features=json.loads(SOURCE.read_text())['features']; raw={f['properties']['ADM0_A3']:shape(f['geometry']).buffer(0) for f in features}
# id, Turkish name, flag, color, leader, ideology, population millions, industry,
# scientific bonus, Natural Earth codes, strategic cities (capital first).
rows=[
('turkey','Türkiye','🇹🇷','#ba6260','Mustafa Kemal Atatürk','republic',16.2,8,0,'TUR','Ankara,32.85,39.93;İstanbul,28.97,41.01;İzmir,27.14,38.42;Bursa,29.06,40.19;Konya,32.48,37.87;Adana,35.32,37.0;Samsun,36.33,41.29;Erzurum,41.27,39.90;Diyarbakır,40.23,37.91'),
('germany','Almanya','DE','#7b8992','Adolf Hitler','fascism',67,26,.2,'DEU','Berlin,13.40,52.52;Hamburg,9.99,53.55;Köln,6.96,50.94;Frankfurt,8.68,50.11;Münih,11.58,48.14;Dresden,13.74,51.05;Stuttgart,9.18,48.78;Breslau,17.04,51.11;Stettin,14.55,53.43;Königsberg,20.51,54.71'),
('france','Fransa','🇫🇷','#698dae','Albert Lebrun','democracy',42,22,.15,'FRA','Paris,2.35,48.86;Lille,3.06,50.63;Strazburg,7.75,48.58;Lyon,4.84,45.76;Marsilya,5.37,43.30;Bordeaux,-.58,44.84;Brest,-4.49,48.39;Toulouse,1.44,43.60;Ajaccio,8.74,41.92'),
('uk','Birleşik Krallık','🇬🇧','#c09877','Stanley Baldwin','democracy',47,25,.2,'GBR','Londra,-.12,51.51;Birmingham,-1.90,52.49;Liverpool,-2.98,53.41;Newcastle,-1.62,54.97;Cardiff,-3.18,51.48;Edinburgh,-3.19,55.95;Inverness,-4.22,57.48;Belfast,-5.93,54.60'),
('italy','İtalya','🇮🇹','#7c9a77','Benito Mussolini','fascism',43,16,.08,'ITA','Roma,12.50,41.90;Milano,9.19,45.46;Torino,7.69,45.07;Venedik,12.32,45.44;Firenze,11.26,43.77;Napoli,14.27,40.85;Bari,16.87,41.12;Palermo,13.36,38.12;Cagliari,9.12,39.22'),
('ussr','Sovyetler Birliği','☭','#a77572','Josef Stalin','communism',90,28,.08,'RUS UKR BLR GEO ARM AZE','Moskova,37.62,55.75;Leningrad,30.34,59.93;Minsk,27.56,53.90;Kiev,30.52,50.45;Harkov,36.23,49.99;Odessa,30.72,46.48;Smolensk,32.05,54.78;Stalingrad,44.50,48.71;Rostov,39.72,47.23;Murmansk,33.08,68.97;Arhangelsk,40.54,64.54;Kazan,49.12,55.80;Tiflis,44.80,41.72;Bakü,49.87,40.41;Elista,44.27,46.31;Perm,56.25,58.01'),
('poland','Polonya','🇵🇱','#c38c9b','Ignacy Mościcki','republic',34,11,.04,'POL','Varşova,21.01,52.23;Kraków,19.94,50.06;Poznań,16.93,52.41;Lublin,22.57,51.25;Lwów,24.03,49.84;Wilno,25.28,54.69;Białystok,23.16,53.13'),
('czechoslovakia','Çekoslovakya','🇨🇿','#a589bc','Edvard Beneš','democracy',15,12,.12,'CZE SVK','Prag,14.42,50.08;Brno,16.61,49.20;Bratislava,17.11,48.15;Košice,21.26,48.72'),
('yugoslavia','Yugoslavya','YU','#658fa0','Prens Pavle','monarchy',15,7,0,'SRB HRV SVN BIH MNE MKD KOS','Belgrad,20.46,44.81;Zagreb,15.98,45.82;Ljubljana,14.51,46.06;Saraybosna,18.41,43.86;Split,16.44,43.51;Üsküp,21.43,42.00;Podgorica,19.26,42.43'),
('spain','İspanya Cumhuriyeti','ES','#c8a15d','Niceto Alcalá-Zamora','democracy',24,12,.02,'ESP','Madrid,-3.70,40.42;Barcelona,2.17,41.39;Valencia,-.38,39.47;Sevilla,-5.98,37.39;Bilbao,-2.93,43.26;Burgos,-3.70,42.34;A Coruña,-8.41,43.36;Zaragoza,-.89,41.65'),
('portugal','Portekiz','🇵🇹','#8a9a65','António Salazar','republic',7,5,0,'PRT','Lizbon,-9.14,38.72;Porto,-8.63,41.16;Faro,-7.93,37.02'),
('romania','Romanya','🇷🇴','#b5a464','II. Carol','monarchy',19,8,0,'ROU MDA','Bükreş,26.10,44.43;Ploiești,26.02,44.94;Cluj,23.59,46.77;Yaş,27.59,47.16;Kişinev,28.86,47.01;Köstence,28.63,44.18'),
('hungary','Macaristan','🇭🇺','#a1847f','Miklós Horthy','monarchy',9,6,.03,'HUN','Budapeşte,19.04,47.50;Debrecen,21.63,47.53;Pécs,18.23,46.07'),
('bulgaria','Bulgaristan','🇧🇬','#9caf78','III. Boris','monarchy',6.1,4,0,'BGR','Sofya,23.32,42.70;Plovdiv,24.75,42.14;Varna,27.91,43.21'),
('greece','Yunanistan','🇬🇷','#78a9b7','II. Georgios','monarchy',6.8,5,0,'GRC','Atina,23.73,37.98;Selanik,22.94,40.64;Yanya,20.85,39.67;Heraklion,25.13,35.34'),
('albania','Arnavutluk','🇦🇱','#a36b60','I. Zog','monarchy',1,2,0,'ALB','Tiran,19.82,41.33;Vlorë,19.49,40.47'),
('austria','Avusturya','🇦🇹','#bb9d86','Kurt Schuschnigg','republic',6.8,7,.06,'AUT','Viyana,16.37,48.21;Graz,15.44,47.07;Innsbruck,11.40,47.27'),
('switzerland','İsviçre','🇨🇭','#b5ad8a','Albert Meyer','democracy',4.1,6,.15,'CHE','Bern,7.45,46.95;Zürih,8.54,47.38;Cenevre,6.14,46.20'),
('belgium','Belçika','🇧🇪','#b7a67e','III. Léopold','democracy',8.3,8,.1,'BEL','Brüksel,4.35,50.85;Anvers,4.40,51.22'),
('netherlands','Hollanda','🇳🇱','#b89a71','Wilhelmina','democracy',8.5,8,.1,'NLD','Amsterdam,4.90,52.37;Rotterdam,4.48,51.92;Groningen,6.57,53.22'),
('luxembourg','Lüksemburg','🇱🇺','#a8bfa9','Charlotte','monarchy',.3,2,.04,'LUX','Lüksemburg,6.13,49.61'),
('denmark','Danimarka ve İzlanda','🇩🇰','#bc8e89','X. Christian','democracy',3.8,5,.05,'DNK ISL','Kopenhag,12.57,55.68;Aarhus,10.20,56.16;Reykjavik,-21.94,64.15'),
('norway','Norveç','🇳🇴','#7ca6a3','VII. Haakon','democracy',2.9,5,.06,'NOR','Oslo,10.75,59.91;Bergen,5.32,60.39;Trondheim,10.40,63.43;Narvik,17.43,68.44'),
('sweden','İsveç','🇸🇪','#91a9ba','V. Gustaf','democracy',6.3,8,.13,'SWE','Stockholm,18.07,59.33;Göteborg,11.97,57.71;Malmö,13.00,55.61;Kiruna,20.23,67.86'),
('finland','Finlandiya','🇫🇮','#a5b7af','Pehr Evind Svinhufvud','democracy',3.6,5,.05,'FIN','Helsinki,24.94,60.17;Tampere,23.76,61.50;Viipuri,28.75,60.71;Oulu,25.47,65.01;Rovaniemi,25.73,66.50'),
('estonia','Estonya','🇪🇪','#8fa7bd','Konstantin Päts','republic',1.1,2,0,'EST','Tallinn,24.75,59.44;Tartu,26.73,58.38'),
('latvia','Letonya','🇱🇻','#ad8793','Kārlis Ulmanis','republic',2,3,0,'LVA','Riga,24.11,56.95;Daugavpils,26.52,55.87'),
('lithuania','Litvanya','🇱🇹','#b2ac71','Antanas Smetona','republic',2.5,3,0,'LTU','Kaunas,23.90,54.90;Klaipėda,21.13,55.71'),
('ireland','İrlanda','🇮🇪','#83a27b','Éamon de Valera','democracy',3,3,0,'IRL','Dublin,-6.26,53.35;Cork,-8.47,51.90'),
]
clip=box(-25,32,62,72)
geoms={r[0]:unary_union([raw[c] for c in r[9].split()]).intersection(clip).buffer(0) for r in rows}
# Coarse interwar corrections on a modern coastline. These are explicit scenario
# approximations, not sourced cadastral borders. See MAP-SOURCES.md.
def transfer(a,b,area):
    part=geoms[a].intersection(area); geoms[a]=geoms[a].difference(part).buffer(0);geoms[b]=geoms[b].union(part).buffer(0)
transfer('poland','germany',Polygon([(12,48),(16,48),(17.8,50.1),(16.7,52),(16.2,53),(17.3,54.5),(19.5,55),(12,55)]))
transfer('ussr','germany',box(19,54.3,23,55.3))
transfer('poland','germany',box(19.2,53.5,22.8,55))
transfer('ussr','poland',Polygon([(22,48),(26.7,48),(26.5,51),(27.7,54),(26.5,55.8),(22,55.8)]))
transfer('lithuania','poland',Polygon([(24.5,54),(26.8,54),(26.8,55.3),(25.3,55.3)]))
transfer('ussr','finland',Polygon([(27.5,60.1),(30.4,60.1),(31.6,61.8),(30.1,64),(28.5,65),(27.5,63)]))
# A city-centred polygon subdivision keeps provinces contiguous and real coasts.
def project(x,y): return [(x+25)*15,(72-y)*22]
def path(geom):
    if geom.is_empty:return ''
    polys=[geom] if geom.geom_type=='Polygon' else [g for g in geom.geoms if g.geom_type=='Polygon']
    parts=[]
    for p in polys:
        for ring in [p.exterior,*p.interiors]:
            coords=[project(x,y) for x,y in ring.coords]
            parts.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in coords)+'Z')
    return ''.join(parts)
provinces=[]; country=[]; shapes=[]
mountains={'Erzurum','Diyarbakır','Innsbruck','Bern','Cenevre','Graz','Üsküp','Podgorica','Saraybosna','Yanya','Tiflis','Torino','Bergen','Narvik','Rovaniemi','Cluj'}
forests={'Oulu','Tampere','Smolensk','Arhangelsk','Kiruna','Trondheim','Minsk','Tartu','Daugavpils','Košice'}
oils={'Ploiești':9,'Bakü':15,'Stalingrad':5,'Diyarbakır':1,'Rostov':3}
for row in rows:
    id,name,flag,color,leader,ideology,pop,industry,science,codes,cities=row
    sites=[(p.split(',')[0],float(p.split(',')[1]),float(p.split(',')[2])) for p in cities.split(';')]
    geom=geoms[id];n=len(sites)
    country.append(dict(id=id,name=name,flag=flag,color=color,leader=leader,ideology=ideology,population=round(pop*1e6),industry=industry,science=science,capital=id+'-0',path=path(geom)))
    for i,(city,x,y) in enumerate(sites):
        # A seed near a simplified coastline may be outside. Keep true city marker
        # but use a point inside the country for the partition's metric.
        region=geom
        for j,(_,xx,yy) in enumerate(sites):
            if i==j: continue
            mx,my=(x+xx)/2,(y+yy)/2;nx,ny=(xx-x)*.55,yy-y;length=math.hypot(nx,ny);nx/=length;ny/=length;tx,ty=-ny,nx
            half=Polygon([(mx+tx*400,my+ty*400),(mx-tx*400,my-ty*400),(mx-tx*400-nx*800,my-ty*400-ny*800),(mx+tx*400-nx*800,my+ty*400-ny*800)])
            region=region.intersection(half)
        if region.is_empty: continue
        point=Point(x,y)
        if not region.buffer(.02).contains(point): point=region.representative_point()
        terrain='mountain' if city in mountains else 'forest' if city in forests else 'urban' if i==0 else 'plains'
        if city=='Elista':terrain='desert'
        if city=='Minsk':terrain='marsh'
        coast=region.boundary.intersection(geom.boundary).length > .7 and (city in {'İstanbul','İzmir','Adana','Samsun','Hamburg','Stettin','Königsberg','Marsilya','Brest','Ajaccio','Londra','Liverpool','Newcastle','Cardiff','Edinburgh','Belfast','Venedik','Napoli','Bari','Palermo','Cagliari','Leningrad','Odessa','Murmansk','Arhangelsk','Bakü','Barcelona','Valencia','Sevilla','A Coruña','Lizbon','Porto','Faro','Köstence','Varna','Atina','Selanik','Heraklion','Vlorë','Split','Anvers','Amsterdam','Rotterdam','Groningen','Kopenhag','Aarhus','Reykjavik','Oslo','Bergen','Trondheim','Narvik','Stockholm','Göteborg','Malmö','Helsinki','Viipuri','Tallinn','Riga','Klaipėda','Dublin','Cork'})
        idx=len(provinces);factory=industry//n+(i<industry%n)
        provinces.append(dict(id=id+'-'+str(i),name=city,country=id,path=path(region),x=round(project(point.x,point.y)[0],1),y=round(project(point.x,point.y)[1],1),terrain=terrain,port=bool(coast),river=city in {'İstanbul','Köln','Paris','Varşova','Budapeşte','Belgrad','Kiev','Stalingrad','Londra','Rotterdam'},vp=12 if i==0 else 3 if factory>1 else 2,population=round(pop*1e6/n),civil=max(1,factory),military=max(0,factory//2)+(i==0),dock=1 if coast and factory>1 else 0,infra=4 if factory>2 else 3 if factory else 2,resources=dict(iron=2+factory*2,oil=oils.get(city,0),steel=0,aluminum=1+int(terrain=='mountain'),rubber=0),neighbors=[]));shapes.append(region)
for i,a in enumerate(shapes):
    for j,b in enumerate(shapes[:i]):
        if a.distance(b)<.02 and a.buffer(.015).intersection(b).area>.0001:
            provinces[i]['neighbors'].append(dict(id=provinces[j]['id'],sea=False));provinces[j]['neighbors'].append(dict(id=provinces[i]['id'],sea=False))
# Explicit sea connections are never walkable land edges.
sea=[('uk-0','france-1'),('uk-7','ireland-0'),('uk-6','denmark-2'),('denmark-0','sweden-2'),('norway-0','denmark-1'),('sweden-0','finland-0'),('italy-6','yugoslavia-4'),('italy-5','italy-7'),('italy-0','italy-8'),('france-4','france-8'),('greece-0','greece-3'),('turkey-2','greece-0'),('turkey-6','ussr-5')]
byid={p['id']:p for p in provinces}
for a,b in sea:
    if a in byid and b in byid:
        byid[a]['port']=byid[b]['port']=True
        for u,v in [(a,b),(b,a)]:
            if not any(n['id']==v for n in byid[u]['neighbors']):byid[u]['neighbors'].append(dict(id=v,sea=True))
# Join detached domestic islands to their closest domestic land region by sea.
for p in provinces:
    if p['neighbors']:continue
    others=[q for q in provinces if q['country']==p['country'] and q['id']!=p['id']]
    if not others:continue
    q=min(others,key=lambda q:math.hypot(q['x']-p['x'],q['y']-p['y']));p['port']=q['port']=True
    p['neighbors'].append(dict(id=q['id'],sea=True));q['neighbors'].append(dict(id=p['id'],sea=True))
output.write_text(json.dumps(dict(width=1320,height=880,countries=country,provinces=provinces,sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest()),ensure_ascii=False,separators=(',',':')))
print(f'{len(country)} countries, {len(provinces)} strategic provinces, {sum(len(p["neighbors"]) for p in provinces)//2} links; {output.stat().st_size} bytes')
