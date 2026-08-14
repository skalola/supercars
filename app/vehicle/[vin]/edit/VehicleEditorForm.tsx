"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  updateVehicleProfile,
  addVehicleModification,
  deleteVehicleModification,
  addServiceRecord,
  addVehicleAward
} from "@/app/actions/passport";
import { calculateModifiedPerformance } from "@/lib/parts/performance";
import {
  uploadVehiclePhoto,
  deleteVehiclePhoto,
  reorderVehiclePhotos,
  uploadVehicleDocument,
  deleteVehicleDocument
} from "@/app/actions/media";
import type { ManualPartTypeGroup } from "@/lib/parts/manual-part-options";

const CUSTOM_OPTION_VALUE = "__custom";

type VehicleEditorProps = {
  vehicle: any;
  partCategories: any[];
  manualBrandOptions: string[];
  manualPartTypeGroups: ManualPartTypeGroup[];
};

export default function VehicleEditorForm({
  vehicle,
  partCategories,
  manualBrandOptions,
  manualPartTypeGroups,
}: VehicleEditorProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "modifications" | "service" | "awards" | "photos" | "documents">("info");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Vehicle Info Form State
  const [extColor, setExtColor] = useState(vehicle.profile?.exteriorColor || "");
  const [intColor, setIntColor] = useState(vehicle.profile?.interiorColor || "");
  const [mileage, setMileage] = useState<number | "">(vehicle.profile?.currentMileage ?? vehicle.mileage ?? "");
  const [notes, setNotes] = useState(vehicle.profile?.ownerNotes || "");

  // 2. Add Modification State
  const [modName, setModName] = useState("");
  const [customModName, setCustomModName] = useState("");
  const [modBrand, setModBrand] = useState("");
  const [customModBrand, setCustomModBrand] = useState("");
  const [modDesc, setModDesc] = useState("");
  const [modDate, setModDate] = useState("");
  const [modCategoryId, setModCategoryId] = useState("");
  const [modHpGain, setModHpGain] = useState<number | "">("");
  const [modTorqueGain, setModTorqueGain] = useState<number | "">("");

  // 3. Add Service Record State
  const [srvDate, setSrvDate] = useState("");
  const [srvMileage, setSrvMileage] = useState<number | "">("");
  const [srvShop, setSrvShop] = useState("");
  const [srvDesc, setSrvDesc] = useState("");
  const [srvCost, setSrvCost] = useState<number | "">("");

  // 4. Add Award State
  const [awdTitle, setAwdTitle] = useState("");
  const [awdEvent, setAwdEvent] = useState("");
  const [awdDate, setAwdDate] = useState("");
  const [awdDesc, setAwdDesc] = useState("");

  // 5. Photos State
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);

  // 6. Documents State
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Other");

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
  };

  const selectedManualPartTypes =
    manualPartTypeGroups.find((group) => group.categoryId === modCategoryId)?.options ?? [];

  const handleManualCategoryChange = (categoryId: string) => {
    setModCategoryId(categoryId);
    setModName("");
    setCustomModName("");
  };

  // Actions
  async function handleUploadPhoto(e: React.FormEvent) {
    e.preventDefault();
    if (photoFiles.length === 0) {
      showError("Please select one or more image files to upload.");
      return;
    }
    setLoading(true);
    try {
      for (const photoFile of photoFiles) {
        const formData = new FormData();
        formData.append("file", photoFile);
        formData.append("caption", photoCaption);
        await uploadVehiclePhoto(vehicle.vin, formData);
      }
      showSuccess(`${photoFiles.length} ${photoFiles.length === 1 ? "photo" : "photos"} uploaded successfully.`);
      setPhotoFiles([]);
      setPhotoCaption("");
      const fileInput = document.getElementById("photo-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not upload photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm("Are you sure you want to delete this photo?")) return;
    setLoading(true);
    try {
      await deleteVehiclePhoto(vehicle.vin, photoId);
      showSuccess("Photo deleted successfully!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not delete photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMakeHero(photoId: string) {
    const selected = vehicle.photos.find((photo: any) => photo.id === photoId);
    if (!selected) return;
    const orderedPhotos = [selected, ...vehicle.photos.filter((photo: any) => photo.id !== photoId)];
    setLoading(true);
    try {
      await reorderVehiclePhotos(vehicle.vin, orderedPhotos.map((photo: any) => photo.id));
      showSuccess("Hero photo updated successfully!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not update hero photo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMovePhoto(photoId: string, direction: "up" | "down") {
    const list = [...vehicle.photos];
    const index = list.findIndex((p: any) => p.id === photoId);
    if (index === -1) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[nextIndex];
    list[nextIndex] = temp;

    setLoading(true);
    try {
      await reorderVehiclePhotos(vehicle.vin, list.map((p: any) => p.id));
      showSuccess("Photo order updated!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not reorder photos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDropPhoto(event: DragEvent<HTMLDivElement>, targetPhotoId: string) {
    event.preventDefault();
    if (!draggedPhotoId || draggedPhotoId === targetPhotoId || loading) return;

    const list = [...vehicle.photos];
    const sourceIndex = list.findIndex((photo: any) => photo.id === draggedPhotoId);
    const targetIndex = list.findIndex((photo: any) => photo.id === targetPhotoId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [movedPhoto] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, movedPhoto);
    setDraggedPhotoId(null);
    setLoading(true);
    try {
      await reorderVehiclePhotos(vehicle.vin, list.map((photo: any) => photo.id));
      showSuccess("Photo order updated. The first photo is now the hero image.");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not reorder photos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) {
      showError("Please select a file to upload.");
      return;
    }
    if (!docTitle.trim()) {
      showError("Document title is required.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", docFile);
      formData.append("title", docTitle);
      formData.append("documentType", docType);
      await uploadVehicleDocument(vehicle.vin, formData);
      showSuccess("Document uploaded successfully!");
      setDocFile(null);
      setDocTitle("");
      setDocType("Other");
      const fileInput = document.getElementById("doc-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not upload document.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    setLoading(true);
    try {
      await deleteVehicleDocument(vehicle.vin, docId);
      showSuccess("Document deleted successfully!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not delete document.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateVehicleProfile(vehicle.vin, {
        exteriorColor: extColor,
        interiorColor: intColor,
        currentMileage: mileage === "" ? null : Number(mileage),
        ownerNotes: notes,
      });
      showSuccess("Vehicle profile updated successfully!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not update profile.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddModification(e: React.FormEvent) {
    e.preventDefault();
    const resolvedModName = modName === CUSTOM_OPTION_VALUE ? customModName.trim() : modName.trim();
    const resolvedModBrand = modBrand === CUSTOM_OPTION_VALUE ? customModBrand.trim() : modBrand.trim();

    if (!resolvedModName) {
      showError("Modification name is required.");
      return;
    }
    setLoading(true);
    try {
      await addVehicleModification(vehicle.vin, {
        name: resolvedModName,
        brand: resolvedModBrand,
        description: modDesc,
        installedDate: modDate,
        categoryId: modCategoryId || null,
        hpGainOverride: modHpGain === "" ? null : Number(modHpGain),
        torqueGainOverride: modTorqueGain === "" ? null : Number(modTorqueGain),
      });
      showSuccess("Modification added successfully!");
      setModName("");
      setCustomModName("");
      setModBrand("");
      setCustomModBrand("");
      setModDesc("");
      setModDate("");
      setModCategoryId("");
      setModHpGain("");
      setModTorqueGain("");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not add modification.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteModification({
    label,
    modificationId,
    installedPartId,
  }: {
    label: string;
    modificationId?: string | null;
    installedPartId?: string | null;
  }) {
    if (!confirm(`Remove "${label}" from this vehicle passport?`)) return;
    setLoading(true);
    try {
      await deleteVehicleModification(vehicle.vin, {
        modificationId: modificationId || null,
        installedPartId: installedPartId || null,
      });
      showSuccess("Modification deleted successfully!");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not delete modification.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!srvDate) {
      showError("Service date is required.");
      return;
    }
    setLoading(true);
    try {
      await addServiceRecord(vehicle.vin, {
        serviceDate: srvDate,
        mileage: srvMileage === "" ? null : Number(srvMileage),
        shopName: srvShop,
        description: srvDesc,
        cost: srvCost === "" ? null : Number(srvCost),
      });
      showSuccess("Service record added successfully!");
      setSrvDate("");
      setSrvMileage("");
      setSrvShop("");
      setSrvDesc("");
      setSrvCost("");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not add service record.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAward(e: React.FormEvent) {
    e.preventDefault();
    if (!awdTitle.trim()) {
      showError("Award title is required.");
      return;
    }
    setLoading(true);
    try {
      await addVehicleAward(vehicle.vin, {
        title: awdTitle,
        eventName: awdEvent,
        awardDate: awdDate,
        description: awdDesc,
      });
      showSuccess("Award added successfully!");
      setAwdTitle("");
      setAwdEvent("");
      setAwdDate("");
      setAwdDesc("");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not add award.");
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (tab: typeof activeTab) => ({
    padding: "12px 20px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: 600,
    border: "none",
    background: "none",
    borderBottom: activeTab === tab ? "3px solid #111827" : "3px solid transparent",
    color: activeTab === tab ? "#111827" : "#6b7280",
    transition: "all 0.2s"
  });

  const sectionStyle = {
    padding: "24px 0",
    display: "grid",
    gap: "24px"
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "15px",
    backgroundColor: "#ffffff",
    boxSizing: "border-box" as const
  };

  const labelStyle = {
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
    display: "block"
  };

  const btnStyle = {
    backgroundColor: "#111827",
    color: "#ffffff",
    padding: "12px 20px",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 600,
    border: "none",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    transition: "background-color 0.2s"
  };

  const performanceSummary = calculateModifiedPerformance({
    stockHorsepower: vehicle.engineHP || vehicle.model?.spec?.horsepower,
    stockTorque: vehicle.model?.spec?.torque,
    installedParts: vehicle.installedParts || [],
  });

  const unlinkedModifications = (vehicle.modifications || []).filter((mod: any) => !mod.catalogInstall);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      {/* Navigation Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", overflowX: "auto" }}>
        <button style={tabStyle("info")} onClick={() => setActiveTab("info")}>Vehicle Info</button>
        <button style={tabStyle("photos")} onClick={() => setActiveTab("photos")}>Photos</button>
        <button style={tabStyle("documents")} onClick={() => setActiveTab("documents")}>Documents</button>
        <button style={tabStyle("modifications")} onClick={() => setActiveTab("modifications")}>Modifications</button>
        <button style={tabStyle("service")} onClick={() => setActiveTab("service")}>Service History</button>
        <button style={tabStyle("awards")} onClick={() => setActiveTab("awards")}>Awards</button>
      </div>

      {/* Success/Error Toast */}
      {successMessage && (
        <div style={{ margin: "16px 0", padding: "12px 16px", backgroundColor: "#ecfdf5", color: "#065f46", borderRadius: "8px", fontSize: "14px", fontWeight: 500 }}>
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ margin: "16px 0", padding: "12px 16px", backgroundColor: "#fef2f2", color: "#991b1b", borderRadius: "8px", fontSize: "14px", fontWeight: 500 }}>
          {errorMessage}
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === "info" && (
        <form onSubmit={handleUpdateProfile} style={sectionStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Exterior Color</label>
              <input value={extColor} onChange={(e) => setExtColor(e.target.value)} placeholder="e.g. Rosso Corsa" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Interior Color</label>
              <input value={intColor} onChange={(e) => setIntColor(e.target.value)} placeholder="e.g. Nero Ade" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Current Mileage</label>
            <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 15000" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Owner Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Share a few words about this vehicle's condition, story or features..." rows={5} style={{ ...inputStyle, fontFamily: "inherit" }} />
          </div>
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? "Saving..." : "Save Information"}
          </button>
        </form>
      )}

      {activeTab === "modifications" && (
        <div style={sectionStyle}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Performance Summary</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
              <MetricCard label="Stock HP" value={formatMetric(performanceSummary.stockHorsepower, "hp")} />
              <MetricCard label="Estimated HP" value={formatMetric(performanceSummary.modifiedHorsepower, "hp")} accent={performanceSummary.hpGain > 0 ? `+${performanceSummary.hpGain} hp` : undefined} />
              <MetricCard label="Stock Torque" value={formatMetric(performanceSummary.stockTorque, "lb-ft")} />
              <MetricCard label="Estimated Torque" value={formatMetric(performanceSummary.modifiedTorque, "lb-ft")} accent={performanceSummary.torqueGain > 0 ? `+${performanceSummary.torqueGain} lb-ft` : undefined} />
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Installed Parts</h3>
            {vehicle.installedParts?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No structured parts installed yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {vehicle.installedParts.map((installedPart: any) => {
                  const label = installedPart.part?.name || installedPart.customName || "Owner-reported part";
                  const brand = installedPart.part?.brand?.name || installedPart.customBrandName;
                  const category = installedPart.part?.category?.name || installedPart.category?.name;
                  const hpGain = installedPart.hpGainOverride ?? installedPart.part?.estimatedHpGain;
                  const torqueGain = installedPart.torqueGainOverride ?? installedPart.part?.estimatedTorqueGain;

                  return (
                    <div key={installedPart.id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700 }}>{label}</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>{installedPart.part ? "Catalog" : "Manual"}</span>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleDeleteModification({
                              label,
                              modificationId: installedPart.legacyModificationId,
                              installedPartId: installedPart.id,
                            })}
                            style={{
                              border: "1px solid #fecaca",
                              borderRadius: "6px",
                              backgroundColor: "#fef2f2",
                              color: "#b91c1c",
                              cursor: loading ? "not-allowed" : "pointer",
                              fontSize: "12px",
                              fontWeight: 700,
                              padding: "4px 8px",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "13px", color: "#4b5563" }}>
                        {brand && <span>Brand: {brand}</span>}
                        {category && <span>Category: {category}</span>}
                        {installedPart.installedDate && <span>Installed: {installedPart.installedDate}</span>}
                        {hpGain !== null && hpGain !== undefined && <span>+{hpGain} hp</span>}
                        {torqueGain !== null && torqueGain !== undefined && <span>+{torqueGain} lb-ft</span>}
                      </div>
                      {installedPart.notes && <p style={{ fontSize: "14px", color: "#6b7280", margin: "8px 0 0 0" }}>{installedPart.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {unlinkedModifications.length > 0 && (
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Legacy Modification Notes</h3>
              <div style={{ display: "grid", gap: "12px" }}>
                {unlinkedModifications.map((mod: any) => (
                  <div key={mod.id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600 }}>{mod.name}</span>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {mod.installedDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>Installed: {mod.installedDate}</span>}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleDeleteModification({
                            label: mod.name,
                            modificationId: mod.id,
                          })}
                          style={{
                            border: "1px solid #fecaca",
                            borderRadius: "6px",
                            backgroundColor: "#fef2f2",
                            color: "#b91c1c",
                            cursor: loading ? "not-allowed" : "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                            padding: "4px 8px",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {mod.brand && <p style={{ fontSize: "14px", color: "#4b5563", margin: "2px 0" }}>Brand: {mod.brand}</p>}
                    {mod.description && <p style={{ fontSize: "14px", color: "#6b7280", margin: "6px 0 0 0" }}>{mod.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAddModification} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Add Manual Part / Modification</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={modCategoryId} onChange={(e) => handleManualCategoryChange(e.target.value)} style={inputStyle}>
                  <option value="">Choose Category</option>
                  {partCategories.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Common Part Type *</label>
                <select
                  required
                  value={modName}
                  onChange={(e) => {
                    setModName(e.target.value);
                    if (e.target.value !== CUSTOM_OPTION_VALUE) setCustomModName("");
                  }}
                  disabled={!modCategoryId}
                  style={inputStyle}
                >
                  <option value="">{modCategoryId ? "Choose common part" : "Choose category first"}</option>
                  {selectedManualPartTypes.map((partType) => (
                    <option key={partType} value={partType}>
                      {partType}
                    </option>
                  ))}
                  <option value={CUSTOM_OPTION_VALUE}>Custom part / modification</option>
                </select>
              </div>
            </div>
            {modName === CUSTOM_OPTION_VALUE && (
              <div>
                <label style={labelStyle}>Custom Part / Modification Name *</label>
                <input
                  required
                  value={customModName}
                  onChange={(e) => setCustomModName(e.target.value)}
                  placeholder="e.g. ITB conversion, custom titanium exhaust"
                  style={inputStyle}
                />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Brand</label>
                <select
                  value={modBrand}
                  onChange={(e) => {
                    setModBrand(e.target.value);
                    if (e.target.value !== CUSTOM_OPTION_VALUE) setCustomModBrand("");
                  }}
                  style={inputStyle}
                >
                  <option value="">Choose Brand</option>
                  {manualBrandOptions.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                  <option value={CUSTOM_OPTION_VALUE}>Custom brand</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Installed Date / Year</label>
                <input value={modDate} onChange={(e) => setModDate(e.target.value)} placeholder="e.g. June 2024 or 2024" style={inputStyle} />
              </div>
            </div>
            {modBrand === CUSTOM_OPTION_VALUE && (
              <div>
                <label style={labelStyle}>Custom Brand</label>
                <input
                  value={customModBrand}
                  onChange={(e) => setCustomModBrand(e.target.value)}
                  placeholder="e.g. Local fabrication shop or niche manufacturer"
                  style={inputStyle}
                />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Estimated HP Gain</label>
                <input type="number" value={modHpGain} onChange={(e) => setModHpGain(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 20" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Estimated Torque Gain</label>
                <input type="number" value={modTorqueGain} onChange={(e) => setModTorqueGain(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 18" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={modDesc} onChange={(e) => setModDesc(e.target.value)} placeholder="e.g. Valved stainless steel system" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Adding..." : "Add Manual Part"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "service" && (
        <div style={sectionStyle}>
          {/* List of service records */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Service Records</h3>
            {vehicle.serviceRecords?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No service history recorded yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {vehicle.serviceRecords.map((srv: any) => (
                  <div key={srv.id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600 }}>{new Date(srv.serviceDate).toLocaleDateString()}</span>
                      {srv.cost !== null && <span style={{ fontWeight: 600, color: "#059669" }}>${srv.cost.toLocaleString()}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "16px", fontSize: "14px", color: "#4b5563" }}>
                      {srv.mileage !== null && <span>Mileage: {srv.mileage.toLocaleString()} mi</span>}
                      {srv.shopName && <span>Shop: {srv.shopName}</span>}
                    </div>
                    {srv.description && <p style={{ fontSize: "14px", color: "#6b7280", margin: "6px 0 0 0" }}>{srv.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Service Record Form */}
          <form onSubmit={handleAddService} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Add Service Record</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Service Date *</label>
                <input required type="date" value={srvDate} onChange={(e) => setSrvDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mileage at Service</label>
                <input type="number" value={srvMileage} onChange={(e) => setSrvMileage(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 14200" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Shop Name</label>
                <input value={srvShop} onChange={(e) => setSrvShop(e.target.value)} placeholder="e.g. Ferrari Seattle" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cost ($)</label>
                <input type="number" value={srvCost} onChange={(e) => setSrvCost(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 1200" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Description / Work Done</label>
              <textarea value={srvDesc} onChange={(e) => setSrvDesc(e.target.value)} placeholder="e.g. Completed annual service including oil & filter change, brake fluid flush, and multipoint inspection." rows={3} style={{ ...inputStyle, fontFamily: "inherit" }} />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Adding..." : "Add Service Record"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "awards" && (
        <div style={sectionStyle}>
          {/* List of awards */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Awards & Recognition</h3>
            {vehicle.awards?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No awards recorded yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {vehicle.awards.map((awd: any) => (
                  <div key={awd.id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600 }}>{awd.title}</span>
                      {awd.awardDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>{new Date(awd.awardDate).toLocaleDateString()}</span>}
                    </div>
                    {awd.eventName && <p style={{ fontSize: "14px", color: "#4b5563", margin: "2px 0" }}>Event: {awd.eventName}</p>}
                    {awd.description && <p style={{ fontSize: "14px", color: "#6b7280", margin: "6px 0 0 0" }}>{awd.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Award Form */}
          <form onSubmit={handleAddAward} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Add Award</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Award Title *</label>
                <input required value={awdTitle} onChange={(e) => setAwdTitle(e.target.value)} placeholder="e.g. Best in Class" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Event Name</label>
                <input value={awdEvent} onChange={(e) => setAwdEvent(e.target.value)} placeholder="e.g. Concorso Italiano" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Award Date</label>
                <input type="date" value={awdDate} onChange={(e) => setAwdDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={awdDesc} onChange={(e) => setAwdDesc(e.target.value)} placeholder="e.g. Awarded first place in modern V10 category" style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Adding..." : "Add Award"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "photos" && (
        <div style={sectionStyle}>
          {/* List of photos */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Vehicle Gallery</h3>
            {vehicle.photos?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No photos uploaded yet.</p>
            ) : (
              <>
                <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: "13px" }}>
                  Drag photos into order. The first photo is used as the vehicle hero image.
                </p>
                <div className="passport-photo-grid">
                {vehicle.photos.map((photo: any, idx: number) => (
                  <div
                    key={photo.id}
                    className={`passport-photo-card${draggedPhotoId === photo.id ? " is-dragging" : ""}`}
                    draggable={!loading}
                    onDragStart={() => setDraggedPhotoId(photo.id)}
                    onDragEnd={() => setDraggedPhotoId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDropPhoto(event, photo.id)}
                    style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    backgroundColor: "#ffffff",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}>
                    <div className="passport-photo-card-header">
                      <span>{idx === 0 ? "Hero image" : `Photo ${idx + 1}`}</span>
                      <span aria-hidden="true">Drag</span>
                    </div>
                    <div style={{
                      position: "relative",
                      width: "100%",
                      paddingTop: "66.67%",
                      borderRadius: "8px",
                      overflow: "hidden",
                      backgroundColor: "#f3f4f6"
                    }}>
                      <img src={photo.filePath} alt={photo.caption || "Vehicle Image"} style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }} />
                    </div>
                    {photo.caption && <p style={{ fontSize: "13px", color: "#4b5563", margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{photo.caption}</p>}
                    
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "auto" }}>
                      {photo.isHero ? (
                        <span style={{
                          backgroundColor: "#dcfce7",
                          color: "#15803d",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textAlign: "center",
                          flex: "1 1 100%"
                        }}>
                          Hero Image
                        </span>
                      ) : (
                        <button type="button" onClick={() => handleMakeHero(photo.id)} style={{
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "12px",
                          cursor: "pointer",
                          width: "100%"
                        }}>
                          Move to First
                        </button>
                      )}
                      
                      <div style={{ display: "flex", gap: "4px", width: "100%" }}>
                        <button type="button" disabled={idx === 0} onClick={() => handleMovePhoto(photo.id, "up")} style={{
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "4px",
                          fontSize: "12px",
                          cursor: idx === 0 ? "not-allowed" : "pointer",
                          flex: 1
                        }}>
                          Earlier
                        </button>
                        <button type="button" disabled={idx === vehicle.photos.length - 1} onClick={() => handleMovePhoto(photo.id, "down")} style={{
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "4px",
                          fontSize: "12px",
                          cursor: idx === vehicle.photos.length - 1 ? "not-allowed" : "pointer",
                          flex: 1
                        }}>
                          Later
                        </button>
                        <button type="button" onClick={() => handleDeletePhoto(photo.id)} style={{
                          backgroundColor: "#fef2f2",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "12px",
                          cursor: "pointer",
                          flex: 1
                        }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </>
            )}
          </div>

          {/* Add Photo Form */}
          <form onSubmit={handleUploadPhoto} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Upload Vehicle Photos</h3>
            <div>
              <label style={labelStyle}>Select Image Files *</label>
              <input
                required
                multiple
                id="photo-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhotoFiles(Array.from(e.target.files || []).slice(0, 8))}
                style={inputStyle}
              />
              <small style={{ display: "block", marginTop: "6px", color: "#6b7280" }}>
                Select up to 8 JPG, PNG, or WebP images. Each image can be up to 8 MB.
              </small>
            </div>
            <div>
              <label style={labelStyle}>Caption / Description</label>
              <input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="e.g. Cleaned and detailed at the shop" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Uploading..." : `Upload ${photoFiles.length > 1 ? `${photoFiles.length} Photos` : "Photo"}`}
            </button>
          </form>
        </div>
      )}

      {activeTab === "documents" && (
        <div style={sectionStyle}>
          {/* List of documents grouped by type */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Uploaded Documents</h3>
            {vehicle.documents?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No documents uploaded yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {["Inspection Report", "Service Invoice", "Registration", "Warranty", "Award Certificate", "Other"].map((type) => {
                  const docsOfType = vehicle.documents.filter((d: any) => d.documentType === type);
                  if (docsOfType.length === 0) return null;

                  return (
                    <div key={type} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", backgroundColor: "#ffffff" }}>
                      <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#4b5563", marginBottom: "12px", textTransform: "uppercase" }}>{type}s</h4>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {docsOfType.map((doc: any) => (
                          <div key={doc.id} style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            backgroundColor: "#f9fafb",
                            borderRadius: "6px",
                            border: "1px solid #f3f4f6"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "18px" }}>📄</span>
                              <div>
                                <a href={doc.filePath} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: "#1d4ed8", fontSize: "14px", textDecoration: "none" }}>
                                  {doc.title}
                                </a>
                                <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0 0 0" }}>Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <button type="button" onClick={() => handleDeleteDoc(doc.id)} style={{
                              backgroundColor: "transparent",
                              color: "#ef4444",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "15px",
                              padding: "4px 8px"
                            }}>
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Document Form */}
          <form onSubmit={handleUploadDoc} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Upload New Document</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Document Title *</label>
                <input required value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Pre-Purchase Inspection Report" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Document Type *</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inputStyle}>
                  <option value="Inspection Report">Inspection Report</option>
                  <option value="Service Invoice">Service Invoice</option>
                  <option value="Registration">Registration</option>
                  <option value="Warranty">Warranty</option>
                  <option value="Award Certificate">Award Certificate</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Select File (PDF or Image) *</label>
              <input required id="doc-file-input" type="file" accept="application/pdf,image/*" onChange={(e) => setDocFile(e.target.files?.[0] || null)} style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Uploading..." : "Upload Document"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ minWidth: 0, padding: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
      <span style={{ display: "block", color: "#6b7280", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ display: "block", marginTop: "6px", color: "#111827", fontSize: "20px", lineHeight: 1 }}>{value}</strong>
      {accent && <span style={{ display: "block", marginTop: "6px", color: "#b91c1c", fontSize: "12px", fontWeight: 800 }}>{accent}</span>}
    </div>
  );
}

function formatMetric(value: number | null, unit: string) {
  return value === null ? "Unknown" : `${value.toLocaleString()} ${unit}`;
}
