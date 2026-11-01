import assert from "node:assert/strict";
import test from "node:test";
import {
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  ShapeUtils,
  Vector2,
  Vector3,
} from "three";
import map from "./map-data.json";
import {
  buildTerrain,
  colorTerrain,
  containsProvincePoint,
  heightAt,
  parsePolygonPath,
  provinceOutline,
} from "./map3d-geometry";

const mesh = buildTerrain();
test.after(() => mesh.dispose());

test("3D arazi tüm 447 bölgeyi ayrı seçim ve renk aralıklarıyla gerçek yükseklikte oluşturur", () => {
  assert.equal(mesh.provinceVertexRanges.size, map.provinces.length);
  assert.equal(mesh.provinceBorderRanges.size, map.provinces.length);
  const position = mesh.geometry.getAttribute("position");
  assert.equal(position.count, mesh.faceProvinceIds.length * 3);
  assert.ok(mesh.faceProvinceIds.length < 150000);
  assert.ok(
    mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y > 20,
  );
  let cursor = 0;
  for (const province of map.provinces) {
    const range = mesh.provinceVertexRanges.get(province.id)!;
    assert.equal(range.start, cursor);
    assert.ok(range.count >= 3 && range.count % 3 === 0, province.id);
    for (
      let index = range.start / 3;
      index < (range.start + range.count) / 3;
      index++
    )
      assert.equal(mesh.faceProvinceIds[index], province.id);
    cursor += range.count;
  }
  assert.equal(cursor, position.count);
  for (const name of ["position", "normal", "color", "uv"])
    for (const value of mesh.geometry.getAttribute(name).array)
      assert.ok(Number.isFinite(value), name);
  const coast = mesh.coastGeometry.getAttribute("position");
  assert.ok(coast.count > 0 && coast.count < 150000);
  let seabed = Infinity;
  for (let i = 0; i < coast.count; i++) {
    assert.ok(
      Number.isFinite(coast.getX(i)) &&
        Number.isFinite(coast.getY(i)) &&
        Number.isFinite(coast.getZ(i)),
    );
    seabed = Math.min(seabed, coast.getY(i));
  }
  assert.ok(Math.abs(seabed + 0.4) < 0.000001);
});

test("SVG delikleri ve çok parçalı adalar yönlerinden bağımsız boşluklarını korur", () => {
  const parts = parsePolygonPath(
    "M0 0L20 0L20 20L0 20Z M5 5L15 5L15 15L5 15Z M7 7L9 7L9 9L7 9Z M30 0L34 0L34 4L30 4Z",
  );
  assert.equal(parts.length, 3, "mainland, lake island and separate island");
  assert.equal(parts[0].holes.length, 1);
  let totalArea = 0;
  for (const part of parts) {
    const outer = part.outer.map((p) => new Vector2(p.x, p.y));
    const holes = part.holes.map((ring) =>
      ring.map((p) => new Vector2(p.x, p.y)),
    );
    const vertices = [...outer, ...holes.flat()];
    for (const face of ShapeUtils.triangulateShape(outer, holes)) {
      const [a, b, c] = face.map((i) => vertices[i]);
      totalArea +=
        Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
    }
  }
  assert.equal(totalArea, 400 - 100 + 4 + 16);
  assert.throws(
    () => parsePolygonPath("M0 0Q10 10 20 20Z"),
    /çokgen|Desteklenmeyen/,
  );
  assert.throws(() => parsePolygonPath("M0 Z"), /Bozuk/);
  assert.deepEqual(parsePolygonPath("m2 3l4 0l0 4l-4 0z")[0].outer, [
    { x: 2, y: 3 },
    { x: 6, y: 3 },
    { x: 6, y: 7 },
    { x: 2, y: 7 },
  ]);
});

test("3D tıklama görünen kara sınırıyla eşleşir, deniz seçilebilir kara üretmez", () => {
  const material = new MeshBasicMaterial();
  const land = new Mesh(mesh.geometry, material);
  land.updateMatrixWorld();
  const ankara = map.provinces.find((p) => p.id === "turkey-0")!;
  assert.equal(containsProvincePoint(ankara.id, ankara.x, ankara.y), true);
  const ray = new Raycaster(
    new Vector3(ankara.x - map.width / 2, 200, ankara.y - map.height / 2),
    new Vector3(0, -1, 0),
  );
  const hit = ray.intersectObject(land)[0];
  assert.ok(hit);
  assert.equal(mesh.faceProvinceIds[hit.faceIndex!], ankara.id);
  const positions = mesh.geometry.getAttribute("position");
  for (let face = 0; face < mesh.faceProvinceIds.length; face++) {
    let x = 0,
      y = 0;
    for (let vertex = 0; vertex < 3; vertex++) {
      x += positions.getX(face * 3 + vertex);
      y += positions.getZ(face * 3 + vertex);
    }
    assert.ok(
      containsProvincePoint(
        mesh.faceProvinceIds[face],
        x / 3 + map.width / 2,
        y / 3 + map.height / 2,
      ),
    );
  }
  ray.set(
    new Vector3(10 - map.width / 2, 200, 870 - map.height / 2),
    new Vector3(0, -1, 0),
  );
  assert.equal(ray.intersectObject(land).length, 0);
  material.dispose();
});

test("Kontrol rengi güncellemesi geometriyi yenilemez ve başka bölgenin rengini değiştirmez", () => {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const other = mesh.provinceVertexRanges.get("turkey-city-14")!;
  const before = Array.from(
    color.array.slice(other.start * 3, (other.start + other.count) * 3),
  );
  colorTerrain(mesh, "turkey-0", "#ff0000");
  const range = mesh.provinceVertexRanges.get("turkey-0")!;
  for (let i = range.start; i < range.start + range.count; i++) {
    assert.equal(color.getX(i), 1);
    assert.equal(color.getY(i), 0);
    assert.equal(color.getZ(i), 0);
  }
  assert.deepEqual(
    Array.from(
      color.array.slice(other.start * 3, (other.start + other.count) * 3),
    ),
    before,
  );
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.geometry.getAttribute("position"), position);
});

test("Kalite geometrinin maliyetini değiştirir; kabartı, sınırlar ve bölge kimlikleri aynı kalır", () => {
  const low = buildTerrain({ maxEdge: 32 });
  assert.ok(low.faceProvinceIds.length < mesh.faceProvinceIds.length);
  assert.deepEqual(
    [...low.provinceVertexRanges.keys()],
    [...mesh.provinceVertexRanges.keys()],
  );
  for (const id of ["turkey-0", "italy-2", "ussr-12"]) {
    const province = map.provinces.find((p) => p.id === id)!;
    const h = heightAt(province.x, province.y);
    assert.equal(h, heightAt(province.x, province.y));
    assert.ok(Math.abs(heightAt(province.x + 0.0001, province.y) - h) < 0.001);
    const outline = provinceOutline(id);
    for (let i = 0; i < outline.getAttribute("position").count; i++) {
      const attr = outline.getAttribute("position");
      assert.ok(
        Math.abs(
          attr.getY(i) -
            (heightAt(
              attr.getX(i) + map.width / 2,
              attr.getZ(i) + map.height / 2,
            ) +
              0.55),
        ) < 0.001,
      );
    }
    outline.dispose();
  }
  low.dispose();
});

test("Aynı coğrafya yeniden kurulduğunda aynı yükseklik ve üçgen seçimi üretilir", () => {
  const copy = buildTerrain();
  assert.deepEqual(
    copy.geometry.getAttribute("position").array,
    mesh.geometry.getAttribute("position").array,
  );
  assert.deepEqual(copy.faceProvinceIds, mesh.faceProvinceIds);
  copy.dispose();
});
