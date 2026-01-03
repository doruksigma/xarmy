"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

// --- TİPLER ---
type Keys = { w: boolean; a: boolean; s: boolean; d: boolean; shift: boolean; space: boolean; };
type Phase = "ready" | "countdown" | "playing";

type Bot = {
  id: number;
  name: string; // Bot ismi
  mesh: THREE.Mesh;
  hp: number;
  speed: number;
  atkCooldown: number;
  vel: THREE.Vector3;
  capsule: Capsule; // Çarpışma için daha hassas
};

type Loot = {
  mesh: THREE.Group;
  type: "ammo";
  amount: number;
  active: boolean;
};

type MiniDot = { x: number; y: number; kind: "bot" | "target" | "loot" };

// Komik Bot İsimleri Havuzu
const BOT_NAMES = [
  "Polat Alemdar", "Memati Baş", "Abdülhey", "Güllü Erhan", 
  "Testere Necmi", "Karahanlı", "Laz Ziya", "Hüsrev Ağa", 
  "Kılıç", "Nizamettin", "Pala", "Bedir", "Halo Dayı"
];

export default function PlayClient() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);

  // Başlangıçta mermi 0. Yerden toplanacak.
  const [hud, setHud] = useState({ hp: 100, ammo: 0, score: 0, time: 0, zone: 0 });
  const [mini, setMini] = useState<{ dots: MiniDot[]; zoneR: number; zoneDirDeg: number; mapSize: number }>({
    dots: [], zoneR: 0, zoneDirDeg: 0, mapSize: 1
  });

  const hudRef = useRef({ hp: 100, ammo: 0, score: 0, time: 0, zone: 0 });
  const phaseRef = useRef<Phase>("ready");
  const playerDroppedRef = useRef(false); // Otobüsten atladı mı kontrolü

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Geri Sayım
  useEffect(() => {
    if (phase !== "countdown") return;
    let c = 3; setCount(c);
    const t = setInterval(() => {
      c -= 1; setCount(c);
      if (c <= 0) { clearInterval(t); setPhase("playing"); }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Renderer & Sahne
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Performans için pixel ratio düşürdük
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setClearColor(0x87CEEB, 1); // Gökyüzü mavisi
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Hafif mavi sis (atmosferik derinlik için)
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.0025);

    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);

    // 2. Işıklandırma (Güneşli Gün)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffddee, 1.2);
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = true;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // 3. Harita: Zemin, Orman ve Evler
    const MAP_SIZE = 500;
    const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    // Çim rengi zemin
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3b7d3b, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const colliders: THREE.Mesh[] = []; // Ağaçlar ve evler buraya

    // --- Ağaç Oluşturucu ---
    const treeTrunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 2, 8);
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4d2926 });
    const treeTopGeo = new THREE.ConeGeometry(3, 7, 8);
    const treeTopMat = new THREE.MeshStandardMaterial({ color: 0x1a5c1a });

    function spawnTree(x: number, z: number) {
      const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
      trunk.position.set(x, 1, z);
      trunk.castShadow = true;
      
      const top = new THREE.Mesh(treeTopGeo, treeTopMat);
      top.position.set(x, 1 + 3.5, z);
      top.castShadow = true;

      scene.add(trunk, top);
      // Sadece gövdeyi çarpışmaya ekleyelim ki üstünden atlanabilsin
      colliders.push(trunk); 
    }

    // Rastgele 180 Ağaç (Merkezden uzak)
    for (let i = 0; i < 180; i++) {
      let x, z;
      do {
        x = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        z = (Math.random() - 0.5) * MAP_SIZE * 0.9;
      } while (Math.abs(x) < 30 && Math.abs(z) < 30); // Merkeze çok yakın olmasın
      spawnTree(x, z);
    }

    // --- Ev Oluşturucu ---
    const houseBodyGeo = new THREE.BoxGeometry(8, 4, 6);
    const houseBodyMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const houseRoofGeo = new THREE.ConeGeometry(6, 3, 4);
    const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
    
    function spawnHouse(x: number, z: number, rotY: number) {
        const body = new THREE.Mesh(houseBodyGeo, houseBodyMat);
        body.position.set(x, 2, z);
        body.rotation.y = rotY;
        body.castShadow = true;
        body.receiveShadow = true;

        const roof = new THREE.Mesh(houseRoofGeo, houseRoofMat);
        roof.position.set(x, 4 + 1.5, z);
        roof.rotation.y = rotY + Math.PI/4; // Çatıyı döndür
        roof.castShadow = true;
        
        scene.add(body, roof);
        colliders.push(body);
    }

    // Rastgele 15 Ev
    for (let i = 0; i < 15; i++) {
        let x = (Math.random() - 0.5) * MAP_SIZE * 0.8;
        let z = (Math.random() - 0.5) * MAP_SIZE * 0.8;
        spawnHouse(x, z, Math.random() * Math.PI);
    }


    // 4. Oyuncu Yapısı
    const player = new THREE.Group();
    scene.add(player);
    // Oyuncu çarpışma kapsülü (daha doğru fizik için)
    const playerCapsule = new Capsule(new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0, 1.8, 0), 0.45);

    const keys: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
    let yaw = 0, pitch = 0;
    const vel = new THREE.Vector3();
    let onGround = false;

    // 5. Gelişmiş Botlar (20 Adet)
    const bots: Bot[] = [];
    const botMat = new THREE.MeshStandardMaterial({ color: 0x222222 }); // Koyu takım elbiseli gibi
    const botHeadMat = new THREE.MeshStandardMaterial({ color: 0xdca577 }); // Ten rengi

    function spawnBot(id: number) {
        const botGroup = new THREE.Group();
        
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), botMat);
        body.position.y = 0.9;
        body.castShadow = true;

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), botHeadMat);
        head.position.y = 1.65;
        head.castShadow = true;
        
        // Botun eline basit silah
        const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshStandardMaterial({color: 0x111111}));
        weapon.position.set(0.25, 1.1, 0.3);
        
        botGroup.add(body, head, weapon);
        
        // Rastgele uzak bir konumda doğsun
        const angle = Math.random() * Math.PI * 2;
        const r = (MAP_SIZE / 3) + Math.random() * (MAP_SIZE / 6);
        botGroup.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        
        scene.add(botGroup);

        const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        
        bots.push({
            id,
            name,
            mesh: botGroup as THREE.Mesh, // Tür zorlaması, grup mesh gibi davranır
            hp: 60, // Canları biraz daha fazla
            speed: 3 + Math.random() * 1.5,
            atkCooldown: 0,
            vel: new THREE.Vector3(),
            capsule: new Capsule(new THREE.Vector3(0,0.9,0), new THREE.Vector3(0,1.8,0), 0.4)
        });
    }
    for (let i = 0; i < 20; i++) spawnBot(i);

    // 6. Loot Sistemi (Yerdeki Silahlar)
    const loots: Loot[] = [];
    
    function spawnLoot() {
        const lootGroup = new THREE.Group();

        // Basit bir M4 tüfek modeli temsili
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), new THREE.MeshStandardMaterial({color: 0x333333}));
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), new THREE.MeshStandardMaterial({color: 0x555555}));
        body.position.z = -0.35;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), new THREE.MeshStandardMaterial({color: 0x222222}));
        barrel.rotation.x = Math.PI/2;
        barrel.position.z = -0.8;
        
        lootGroup.add(stock, body, barrel);
        
        lootGroup.position.set(
            (Math.random() - 0.5) * MAP_SIZE * 0.9,
            0.2, // Yerden biraz yukarıda
            (Math.random() - 0.5) * MAP_SIZE * 0.9
        );
        lootGroup.rotation.y = Math.random() * Math.PI * 2;
        
        // Parlama efekti
        const pointLight = new THREE.PointLight(0xffff00, 0.5, 3);
        pointLight.position.y = 0.5;
        lootGroup.add(pointLight);

        scene.add(lootGroup);
        loots.push({ mesh: lootGroup, type: "ammo", amount: 30, active: true });
    }
    // 40 adet silah dağıt
    for(let i=0; i<40; i++) spawnLoot();


    // 7. Zone (Devasa)
    const ZONE_INITIAL = 160;
    let zoneRadius = ZONE_INITIAL;
    const zoneCenter = new THREE.Vector3(0, 0, 0);
    const zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(ZONE_INITIAL - 0.5, ZONE_INITIAL + 0.5, 128),
      new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    zoneRing.rotation.x = -Math.PI / 2;
    zoneRing.position.y = 0.1;
    scene.add(zoneRing);

    // 8. Ateşleme Efektleri (Oyuncu ve Botlar için)
    const raycaster = new THREE.Raycaster();
    const muzzleFlashPlayer = new THREE.PointLight(0xffaa00, 0, 10);
    scene.add(muzzleFlashPlayer);

    // Bot ateş efekti için yardımcı fonksiyon
    function showBotMuzzleFlash(botPos: THREE.Vector3, targetPos: THREE.Vector3) {
        const flash = new THREE.PointLight(0xff5500, 2, 8);
        const dir = new THREE.Vector3().subVectors(targetPos, botPos).normalize();
        // Flash'ı botun biraz önüne koy
        flash.position.copy(botPos).add(new THREE.Vector3(0, 1.1, 0)).add(dir.multiplyScalar(0.8));
        scene.add(flash);
        setTimeout(() => scene.remove(flash), 50);
    }

    // OYUNCU ATEŞ ETME
    function shoot() {
      if (phaseRef.current !== "playing") return;
      if (hudRef.current.ammo <= 0) {
        console.log("Mermi yok! Yerden silah al.");
        return;
      }
      hudRef.current.ammo--;

      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      // Sadece botları hedef al
      const hits = raycaster.intersectObjects(bots.map(b => b.mesh), true);

      if (hits.length > 0) {
        // En üstteki ebeveyn mesh'i bul (Grup)
        let hitObj = hits[0].object;
        while(hitObj.parent && hitObj.parent.type !== 'Scene') { hitObj = hitObj.parent; }

        const bi = bots.findIndex(b => b.mesh === hitObj);
        if (bi >= 0) {
          const b = bots[bi];
          b.hp -= 25;
          console.log(`${b.name} vuruldu! Kalan can: ${b.hp}`);
          
          // Vurulma efekti (Kısa süreli kırmızı parlama)
          b.mesh.children.forEach(child => {
             if(child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                 child.material.emissive.setHex(0xff0000);
                 setTimeout(() => { child.material.emissive.setHex(0x000000) }, 100);
             }
          });

          if (b.hp <= 0) {
            console.log(`--- ${b.name} ETKİSİZ HALE GETİRİLDİ ---`);
            scene.remove(b.mesh);
            bots.splice(bi, 1);
            hudRef.current.score += 1;
          }
        }
      }
      
      // Oyuncu namlu parlaması
      muzzleFlashPlayer.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
      muzzleFlashPlayer.intensity = 3;
      setTimeout(() => muzzleFlashPlayer.intensity = 0, 50);
    }

    // --- FİZİK & ÇARPIŞMA YARDIMCILARI ---
    const box3 = new THREE.Box3();
    const tempVec = new THREE.Vector3();
    const tempCapsule = new Capsule();

    // Kapsül tabanlı çarpışma (Daha iyi kayma sağlar)
    function resolveCollisionsWithWorld(capsule: Capsule, velocity: THREE.Vector3) {
        for (const wall of colliders) {
            box3.setFromObject(wall);
            // Basit bir AABB kontrolü ile gereksiz detaylı kontrolleri ele
            if(!box3.intersectsSphere(new THREE.Sphere(capsule.start, capsule.radius + 0.5))) continue;

            // Kapsül-Kutu çarpışması (Three.js içinde yerleşik yok, basit approximation)
            // En yakın noktayı bulup iteceğiz.
            tempVec.copy(capsule.start).setY(Math.min(box3.max.y, Math.max(box3.min.y, capsule.start.y)));
            box3.clampPoint(tempVec, tempVec);

            const distance = tempVec.distanceToSquared(capsule.start);
            if(distance < capsule.radius * capsule.radius && distance > 0) {
                const overlap = capsule.radius - Math.sqrt(distance);
                tempVec.sub(capsule.start).normalize().multiplyScalar(-overlap);
                tempVec.y = 0; // Y ekseninde itme yapma (duvara tırmanmayı önle)
                
                capsule.translate(tempVec);
                // Hızın duvara dik bileşenini sıfırla (kayma efekti)
                velocity.addScaledVector(tempVec.normalize(), -velocity.dot(tempVec) * 1.2); 
            }
        }
    }


    // 9. OYUN DÖNGÜSÜ (TICK)
    const clock = new THREE.Clock();
    let uiTimer = 0;

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05); // Max delta time sınırlaması
      if (hudRef.current.hp <= 0) {
        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (phaseRef.current === "playing") {
        hudRef.current.time += dt;

        // --- OTOBÜSTEN ATLAMA MEKANİĞİ ---
        if (!playerDroppedRef.current) {
            // Haritanın köşesinde yüksekte başlat
            player.position.set(-MAP_SIZE * 0.4, 120, -MAP_SIZE * 0.4);
            // Hafif ileri hız ver (otobüsten atlamış gibi)
            vel.set(5, 0, 5); 
            playerDroppedRef.current = true;
            onGround = false;
        }

        // --- OYUNCU HAREKET FİZİĞİ ---
        // Yere basıyorsa kontroller aktif
        const speed = keys.shift ? 10 : 6;
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize().multiplyScalar(-1);
        const right = new THREE.Vector3().copy(forward).cross(new THREE.Vector3(0, 1, 0)).normalize();
        
        const moveIntent = new THREE.Vector3();
        if(onGround) {
            if (keys.w) moveIntent.add(forward); if (keys.s) moveIntent.sub(forward);
            if (keys.d) moveIntent.add(right); if (keys.a) moveIntent.sub(right);
            if (moveIntent.lengthSq() > 0) moveIntent.normalize();
            
            // Yerdeyken hızlanma/yavaşlama
            vel.x = THREE.MathUtils.lerp(vel.x, moveIntent.x * speed, 10 * dt);
            vel.z = THREE.MathUtils.lerp(vel.z, moveIntent.z * speed, 10 * dt);
        } else {
             // Havadayken kontrol çok az
             vel.x = THREE.MathUtils.lerp(vel.x, moveIntent.x * speed, 1 * dt);
             vel.z = THREE.MathUtils.lerp(vel.z, moveIntent.z * speed, 1 * dt);
        }

        // Yerçekimi ve Zıplama
        if (keys.space && onGround) { vel.y = 8; onGround = false; }
        vel.y -= 25 * dt; // Yerçekimi

        // Hızı pozisyona uygula (geçici)
        tempVec.copy(vel).multiplyScalar(dt);
        player.position.add(tempVec);
        
        // Kapsülü güncelle ve çarpışmaları çöz
        playerCapsule.start.copy(player.position).setY(player.position.y + 0.9);
        playerCapsule.end.copy(player.position).setY(player.position.y + 1.8);
        resolveCollisionsWithWorld(playerCapsule, vel);
        player.position.copy(playerCapsule.start).setY(playerCapsule.start.y - 0.9);

        // Zemin kontrolü
        if (player.position.y <= 0) {
            player.position.y = 0;
            vel.y = Math.max(0, vel.y); // Yere çarpınca aşağı hızı sıfırla
            onGround = true;
        } else {
            onGround = false;
        }

        // --- LOOT TOPLAMA ---
        loots.forEach(loot => {
            if(loot.active && player.position.distanceTo(loot.mesh.position) < 2.5) {
                loot.active = false;
                scene.remove(loot.mesh);
                hudRef.current.ammo = 30; // Mermiyi fulle
                console.log("Silah alındı! Mermi fullendi.");
            }
            // Loot animasyonu
            if(loot.active) loot.mesh.rotation.y += dt;
        });


        // --- ZONE DARALMASI ---
        // Çok daha yavaş daralsın (90 saniyede kapansın yaklaşık)
        zoneRadius = Math.max(5, zoneRadius - (ZONE_INITIAL / 90) * dt);
        zoneRing.scale.setScalar(zoneRadius / ZONE_INITIAL);
        if (player.position.distanceTo(zoneCenter) > zoneRadius) hudRef.current.hp -= 4 * dt;
        hudRef.current.zone = zoneRadius;

        // --- GELİŞMİŞ BOT YAPAY ZEKASI ---
        for (let i = bots.length - 1; i >= 0; i--) {
          const b = bots[i];
          const dist = b.mesh.position.distanceTo(player.position);
          
          // Zone hasarı
          if (b.mesh.position.distanceTo(zoneCenter) > zoneRadius) {
            b.hp -= 8 * dt;
          }

          // Hareketi Kapsül ile yap
          const toPlayer = new THREE.Vector3().subVectors(player.position, b.mesh.position).setY(0).normalize();
          // Botlar çok yaklaşmasın, uzaktan sıksın (4 birim mesafede dursun)
          if(dist > 5) {
               b.vel.add(toPlayer.multiplyScalar(b.speed * dt * 5)); // Hızlanma
          } else if (dist < 3) {
               b.vel.sub(toPlayer.multiplyScalar(b.speed * dt * 2)); // Geri çekilme
          }
          
          // Sürtünme ve Yerçekimi
          b.vel.x *= 0.9; b.vel.z *= 0.9;
          b.vel.y -= 25 * dt;

          // Hızı uygula
          tempVec.copy(b.vel).multiplyScalar(dt);
          b.mesh.position.add(tempVec);

           // Bot Kapsül güncelle ve çarpışma
           b.capsule.start.copy(b.mesh.position).setY(b.mesh.position.y + 0.9);
           b.capsule.end.copy(b.mesh.position).setY(b.mesh.position.y + 1.8);
           resolveCollisionsWithWorld(b.capsule, b.vel);
           b.mesh.position.copy(b.capsule.start).setY(b.capsule.start.y - 0.9);
           
           // Zemin
           if (b.mesh.position.y <= 0) { b.mesh.position.y = 0; b.vel.y = 0; }

          // Oyuncuya dön
          b.mesh.lookAt(player.position.x, b.mesh.position.y, player.position.z);

          // --- BOT ATEŞ ETME MEKANİĞİ ---
          b.atkCooldown -= dt;
          if (dist < 30 && b.atkCooldown <= 0) { // 30 metre menzil
            // Raycast ile görüş hattı kontrolü (Arada ağaç ev var mı?)
            raycaster.set(b.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)), toPlayer);
            const intersects = raycaster.intersectObjects([...colliders, ...bots.map(bt=>bt.mesh).filter(m=>m!==b.mesh)], true);
            
            let canSeePlayer = true;
            if(intersects.length > 0 && intersects[0].distance < dist) {
                canSeePlayer = false; // Önünde engel var
            }

            if(canSeePlayer) {
                // Ateş et!
                b.atkCooldown = 1.5 + Math.random(); // 1.5 - 2.5 sn arası bekle
                hudRef.current.hp -= Math.random() * 15 + 5; // 5-20 arası hasar
                showBotMuzzleFlash(b.mesh.position, player.position);
                console.log(`${b.name} sana ateş etti!`);
            }
          }

          if (b.hp <= 0) {
            console.log(`${b.name} zone içinde öldü.`);
            scene.remove(b.mesh);
            bots.splice(i, 1);
          }
        }
      }

      // Kamera Takibi (FPS)
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw; camera.rotation.x = pitch;
      camera.position.copy(player.position).add(new THREE.Vector3(0, 1.7, 0));

      renderer.render(scene, camera);

      // UI Güncelleme (Saniyede 10 kere)
      uiTimer += dt;
      if (uiTimer > 0.1) {
        setHud({ ...hudRef.current });
        
        // Minimap için ölçekleme faktörü (Harita büyüdü)
        const miniScale = MAP_SIZE / 2; // Harita boyutunun yarısı
        const dots: MiniDot[] = [];
        
        // Botları göster (Kırmızı)
        bots.forEach(b => {
          const dx = b.mesh.position.x - player.position.x;
          const dz = b.mesh.position.z - player.position.z;
          if(Math.abs(dx) < miniScale && Math.abs(dz) < miniScale) {
             dots.push({ x: dx / miniScale, y: dz / miniScale, kind: "bot" });
          }
        });

        // Lootları göster (Sarı)
        loots.forEach(l => {
            if(!l.active) return;
            const dx = l.mesh.position.x - player.position.x;
            const dz = l.mesh.position.z - player.position.z;
            if(Math.abs(dx) < miniScale && Math.abs(dz) < miniScale) {
               dots.push({ x: dx / miniScale, y: dz / miniScale, kind: "loot" });
            }
        });
        
        const zoneDir = new THREE.Vector3().subVectors(zoneCenter, player.position);
        setMini({ dots, zoneR: zoneRadius, zoneDirDeg: Math.atan2(zoneDir.x, -zoneDir.z) * (180/Math.PI), mapSize: MAP_SIZE });
        uiTimer = 0;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // Kontroller
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement || phaseRef.current !== "playing") return;
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));
    };
    const onKey = (e: KeyboardEvent, val: boolean) => {
      if (e.code === "KeyW") keys.w = val; if (e.code === "KeyS") keys.s = val;
      if (e.code === "KeyA") keys.a = val; if (e.code === "KeyD") keys.d = val;
      if (e.code === "Space") keys.space = val; if (e.code === "ShiftLeft") keys.shift = val;
    };

    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));
    document.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", (e) => {
      if(phaseRef.current !== "playing") return;
      if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
      else if(e.button === 0) shoot();
    });

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
      // Event listenerları temizlemeyi unutma
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 select-none">
      <div ref={mountRef} className="absolute inset-0" />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
        <div className="flex gap-2">
            <div className={`px-4 py-2 rounded-lg border bg-black/70 backdrop-blur transition-colors ${hud.hp < 30 ? 'border-red-500 text-red-500 animate-pulse' : 'border-slate-700 text-white'}`}>
            ❤️ {Math.ceil(hud.hp)}
            </div>
            <div className={`px-4 py-2 rounded-lg border border-slate-700 bg-black/70 backdrop-blur ${hud.ammo === 0 ? 'text-red-500' : 'text-indigo-400'}`}>
            🔫 {hud.ammo > 0 ? hud.ammo : 'MERMİ YOK!'}
            </div>
        </div>
        <div className="flex gap-2">
            <div className="px-4 py-2 rounded-lg border border-slate-700 bg-black/70 backdrop-blur text-emerald-400">
            ☠️ Kills: {hud.score}
            </div>
            <div className="px-4 py-2 rounded-lg border border-slate-700 bg-black/70 backdrop-blur text-orange-400">
            🔥 Zone: {Math.round(hud.zone)}m
            </div>
        </div>
      </div>

      {/* MINIMAP (Daha Büyük) */}
      <div className="absolute top-4 right-4 h-48 w-48 rounded-full bg-black/60 border-2 border-slate-600 overflow-hidden backdrop-blur shadow-xl">
        <div className="absolute inset-0 flex items-center justify-center relative">
          {/* Oyuncu */}
          <div className="absolute w-3 h-3 bg-white border-2 border-slate-800 rounded-full z-20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          
          {/* Dotlar */}
          {mini.dots.map((d, i) => (
            <div key={i} className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 z-10 ${d.kind === "bot" ? "bg-red-600" : "bg-yellow-400 animate-pulse"}`}
              style={{ left: `${50 + d.x * 50}%`, top: `${50 + d.y * 50}%` }} />
          ))}
          
          {/* Zone Oku */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
            style={{ transform: `rotate(${mini.zoneDirDeg}deg)` }}>
             <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[16px] border-b-red-500/80 translateY-[-60px]" />
          </div>
          <div className="absolute bottom-2 inset-x-0 text-center text-xs text-slate-400">Harita: {mini.mapSize}m</div>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[4px] h-[4px] bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)]"></div>
      </div>

      {/* Bilgi Mesajı (Mermi Yoksa) */}
      {phase === "playing" && hud.ammo === 0 && hud.hp > 0 && (
          <div className="absolute bottom-20 inset-x-0 text-center pointer-events-none animate-bounce">
              <div className="inline-block px-6 py-3 bg-red-600/80 text-white font-bold text-xl rounded-xl border-2 border-red-400/50">
                  YERDEN SİLAH AL! (Sarı Noktalar)
              </div>
          </div>
      )}


      {/* Arayüzler (Hazır / Geri Sayım / Oyun Sonu) */}
      {phase !== "playing" && hud.hp > 0 && (
        <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center backdrop-blur-md cursor-pointer" onClick={() => phase === "ready" && setPhase("countdown")}>
          {phase === "ready" ? (
            <div className="text-center group">
                <h1 className="text-6xl font-black text-white mb-2 tracking-tighter">BATTLE ROYALE</h1>
                <p className="text-xl text-slate-300 mb-8">Polat ve ekibine karşı hayatta kal.</p>
                <button className="px-12 py-5 bg-indigo-600 text-white rounded-2xl font-bold text-2xl group-hover:scale-110 group-hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/30">ATLA!</button>
                <p className="mt-4 text-sm text-slate-500">Başlamak için tıkla</p>
            </div>
          ) : (
            <div className="text-[12rem] font-black text-white/20 animate-ping relative">
                {count}
                <div className="absolute inset-0 flex items-center justify-center text-white text-9xl font-black animate-none">{count}</div>
            </div>
          )}
        </div>
      )}

      {hud.hp <= 0 && (
        <div className="absolute inset-0 bg-red-950/95 flex flex-col items-center justify-center text-white z-50 backdrop-blur-sm">
          <h2 className="text-7xl font-black mb-2 text-red-500 tracking-tighter">ÖLDÜN</h2>
          <p className="text-2xl mb-8 opacity-90">Toplam Leş: <span className="font-bold text-yellow-400 text-3xl ml-2">{hud.score}</span></p>
          <button onClick={() => window.location.reload()} className="px-10 py-4 bg-white text-red-950 rounded-2xl font-black text-xl hover:bg-slate-200 transition-colors shadow-xl">TEKRAR DENE</button>
        </div>
      )}
    </div>
  );
}
