import assert from "node:assert/strict";
import test from "node:test";
import {
  presentationSettings,
  reducedAnimations,
} from "./presentation-settings";

test("Existing device preferences survive unified settings and invalid values fall back safely", () => {
  assert.deepEqual(
    presentationSettings({
      map: "3d",
      quality: "high",
      viewpoint: "perspective",
      motion: "reduced",
    }),
    {
      map: "3d",
      quality: "high",
      viewpoint: "perspective",
      motion: "reduced",
    },
  );
  assert.deepEqual(
    presentationSettings(
      { map: "evil", quality: null, viewpoint: {}, motion: 42 },
      true,
    ),
    {
      map: "2d",
      quality: "low",
      viewpoint: "strategic",
      motion: "system",
    },
  );
  assert.equal(presentationSettings().quality, "medium");
  assert.equal(
    presentationSettings({ quality: "ultra" }, true).quality,
    "ultra",
  );
});

test("Explicit motion preferences override OS choice while automatic follows it", () => {
  assert.equal(reducedAnimations("system", true), true);
  assert.equal(reducedAnimations("system", false), false);
  assert.equal(reducedAnimations("full", true), false);
  assert.equal(reducedAnimations("reduced", false), true);
});
