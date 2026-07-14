"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateVehicleProfile,
  addVehicleModification,
  addServiceRecord,
  addVehicleAward
} from "@/app/actions/passport";
import {
  uploadVehiclePhoto,
  deleteVehiclePhoto,
  setHeroPhoto,
  reorderVehiclePhotos,
  uploadVehicleDocument,
  deleteVehicleDocument
} from "@/app/actions/media";

type VehicleEditorProps = {
  vehicle: any;
};

export default function VehicleEditorForm({ vehicle }: VehicleEditorProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"info" | "modifications" | "service" | "awards" | "photos" | "documents">("info");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Vehicle Info Form State
  const [extColor, setExtColor] = useState(vehicle.profile?.exteriorColor || "");
  const [intColor, setIntColor] = useState(vehicle.profile?.interiorColor || "");
  const [mileage, setMileage] = useState<number | "">(vehicle.profile?.currentMileage ?? "");
  const [notes, setNotes] = useState(vehicle.profile?.ownerNotes || "");

  // 2. Add Modification State
  const [modName, setModName] = useState("");
  const [modBrand, setModBrand] = useState("");
  const [modDesc, setModDesc] = useState("");
  const [modDate, setModDate] = useState("");

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");

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

  // Actions
  async function handleUploadPhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!photoFile) {
      showError("Please select an image file to upload.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      formData.append("caption", photoCaption);
      await uploadVehiclePhoto(vehicle.vin, formData);
      showSuccess("Photo uploaded successfully!");
      setPhotoFile(null);
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
    setLoading(true);
    try {
      await setHeroPhoto(vehicle.vin, photoId);
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
    if (!modName.trim()) {
      showError("Modification name is required.");
      return;
    }
    setLoading(true);
    try {
      await addVehicleModification(vehicle.vin, {
        name: modName,
        brand: modBrand,
        description: modDesc,
        installedDate: modDate,
      });
      showSuccess("Modification added successfully!");
      setModName("");
      setModBrand("");
      setModDesc("");
      setModDate("");
      router.refresh();
    } catch (err: any) {
      showError(err.message || "Could not add modification.");
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
          {/* List of modifications */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Current Modifications</h3>
            {vehicle.modifications?.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic" }}>No modifications listed yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {vehicle.modifications.map((mod: any) => (
                  <div key={mod.id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600 }}>{mod.name}</span>
                      {mod.installedDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>Installed: {mod.installedDate}</span>}
                    </div>
                    {mod.brand && <p style={{ fontSize: "14px", color: "#4b5563", margin: "2px 0" }}>Brand: {mod.brand}</p>}
                    {mod.description && <p style={{ fontSize: "14px", color: "#6b7280", margin: "6px 0 0 0" }}>{mod.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Modification Form */}
          <form onSubmit={handleAddModification} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Add New Modification</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Modification Name *</label>
                <input required value={modName} onChange={(e) => setModName(e.target.value)} placeholder="e.g. Capristo Exhaust" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Brand</label>
                <input value={modBrand} onChange={(e) => setModBrand(e.target.value)} placeholder="e.g. Capristo" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Installed Date / Year</label>
                <input value={modDate} onChange={(e) => setModDate(e.target.value)} placeholder="e.g. June 2024 or 2024" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={modDesc} onChange={(e) => setModDesc(e.target.value)} placeholder="e.g. Valved stainless steel system" style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Adding..." : "Add Modification"}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
                {vehicle.photos.map((photo: any, idx: number) => (
                  <div key={photo.id} style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    backgroundColor: "#ffffff",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}>
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
                          ★ Hero Image
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
                          Make Hero
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
                          ▲
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
                          ▼
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
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Photo Form */}
          <form onSubmit={handleUploadPhoto} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", display: "grid", gap: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600 }}>Upload New Photo</h3>
            <div>
              <label style={labelStyle}>Select Image File *</label>
              <input required id="photo-file-input" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Caption / Description</label>
              <input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="e.g. Cleaned and detailed at the shop" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ ...btnStyle, justifySelf: "start" }}>
              {loading ? "Uploading..." : "Upload Photo"}
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
