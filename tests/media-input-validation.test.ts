import assert from "node:assert/strict";
import test from "node:test";
import {
  uploadedVehiclePhotoSchema,
  vehicleDocumentMetadataSchema,
  vehiclePhotoMetadataSchema,
  vehiclePhotoOrderSchema,
} from "../lib/validation/media-inputs";
import { profileInputSchema } from "../lib/validation/community-inputs";

test("vehicle photo metadata and ordering are bounded and duplicate-free", () => {
  assert.equal(vehiclePhotoMetadataSchema.parse({ caption: "  Front quarter  " }).caption, "Front quarter");
  assert.deepEqual(vehiclePhotoOrderSchema.parse(["photo_1", "photo_2"]), ["photo_1", "photo_2"]);
  assert.equal(vehiclePhotoOrderSchema.safeParse(["photo_1", "photo_1"]).success, false);
  assert.equal(vehiclePhotoOrderSchema.safeParse(Array.from({ length: 51 }, (_, index) => `photo_${index}`)).success, false);
});

test("direct vehicle photo registration requires a bounded blob URL and pathname", () => {
  assert.equal(
    uploadedVehiclePhotoSchema.safeParse({
      url: "https://store.public.blob.vercel-storage.com/vehicles/vehicle_1/photos/photo.jpg",
      pathname: "vehicles/vehicle_1/photos/photo.jpg",
      caption: "Front three-quarter view",
    }).success,
    true,
  );
  assert.equal(
    uploadedVehiclePhotoSchema.safeParse({
      url: "javascript:alert(1)",
      pathname: "",
    }).success,
    false,
  );
});

test("private vehicle document metadata requires bounded labels", () => {
  assert.deepEqual(
    vehicleDocumentMetadataSchema.parse({ title: "  Annual service invoice ", documentType: " Invoice " }),
    { title: "Annual service invoice", documentType: "Invoice" }
  );
  assert.equal(vehicleDocumentMetadataSchema.safeParse({ title: "", documentType: "Invoice" }).success, false);
});

test("profile input shares normalized username rules", () => {
  const profile = profileInputSchema.parse({ name: "  Shiv   Kalola ", username: " RSXShiv " });
  assert.equal(profile.name, "Shiv Kalola");
  assert.equal(profile.username, "rsxshiv");
});
