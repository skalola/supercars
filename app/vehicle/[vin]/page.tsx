/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import MaintenanceIntelligence from "./MaintenanceIntelligence";


type VehiclePageProps = {
  params: Promise<{ vin: string }>;
};

export default async function VehiclePage({ params }: VehiclePageProps) {
  const { vin } = await params;
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      model: {
        include: {
          make: true,
        },
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      profile: true,
      modifications: {
        orderBy: { createdAt: "desc" },
      },
      serviceRecords: {
        orderBy: { serviceDate: "desc" },
      },
      awards: {
        orderBy: { awardDate: "desc" },
      },
      photos: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vehicle) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Vehicle not found</h1>
      </div>
    );
  }

  const maintenanceRules = await prisma.maintenanceRule.findMany({
    where: {
      OR: [
        { modelId: null },
        { modelId: vehicle.modelId }
      ]
    }
  });

  const priorityOrder: Record<string, number> = {
    REQUIRED: 1,
    RECOMMENDED: 2,
    INSPECT: 3
  };

  const sortedRules = [...maintenanceRules].sort((a, b) => {
    const pA = priorityOrder[a.priority] || 99;
    const pB = priorityOrder[b.priority] || 99;
    if (pA !== pB) return pA - pB;
    return (a.intervalMiles || 0) - (b.intervalMiles || 0);
  });

  const currentMileage = vehicle.profile?.currentMileage;

  // Dynamic Health Score calculations
  let healthScore = 0;
  const healthChecklist = [];

  // 1. VIN Verified (+20)
  const vinVerified = vehicle.status === "CLAIMED";
  if (vinVerified) {
    healthScore += 20;
    healthChecklist.push({ label: "VIN Verified", complete: true });
  } else {
    healthChecklist.push({ label: "VIN Verified", complete: false, missingText: "VIN Unverified" });
  }

  // 2. Owner Profile Complete (+15)
  const profileComplete = !!vehicle.profile && !!vehicle.profile.exteriorColor && !!vehicle.profile.interiorColor;
  if (profileComplete) {
    healthScore += 15;
    healthChecklist.push({ label: "Owner Profile Complete", complete: true });
  } else {
    healthChecklist.push({
      label: "Owner Profile Complete",
      complete: false,
      missingText: "Owner Profile Incomplete",
      actionText: "Update profile",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 3. Photos Added (+15)
  const photosAdded = vehicle.photos && vehicle.photos.length > 0;
  if (photosAdded) {
    healthScore += 15;
    healthChecklist.push({ label: "Photos Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Photos Added",
      complete: false,
      missingText: "Photos Missing",
      actionText: "Add vehicle photos",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 4. Service History Added (+20)
  const serviceHistoryAdded = vehicle.serviceRecords && vehicle.serviceRecords.length > 0;
  if (serviceHistoryAdded) {
    healthScore += 20;
    healthChecklist.push({ label: "Service History Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Service History Added",
      complete: false,
      missingText: "Service History Missing",
      actionText: "Update service history",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 5. Inspection Report Added (+15)
  const hasInspectionDoc = vehicle.documents?.some((d: any) => d.documentType === "Inspection Report");
  if (hasInspectionDoc) {
    healthScore += 15;
    healthChecklist.push({ label: "Inspection Report Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Inspection Report Added",
      complete: false,
      missingText: "Inspection Report Missing",
      actionText: "Add inspection report",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 6. Maintenance Mileage Added (+15)
  const mileageAdded = vehicle.profile && vehicle.profile.currentMileage !== null && vehicle.profile.currentMileage !== undefined;
  if (mileageAdded) {
    healthScore += 15;
    healthChecklist.push({ label: "Maintenance Mileage Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Maintenance Mileage Added",
      complete: false,
      missingText: "Maintenance Mileage Missing",
      actionText: "Add current mileage",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  const sections = [
    {
      title: "Vehicle Identity",
      fields: [
        ["VIN", vehicle.vin],
        ["Year", vehicle.year],
        ["Make", vehicle.model.make.name],
        ["Model", vehicle.model.name],
        ["Trim", vehicle.trim],
        ["Series", vehicle.series],
        ["Destination Market", vehicle.destinationMarket],
      ],
    },
    {
      title: "Powertrain",
      fields: [
        ["Engine", vehicle.engine],
        ["Engine Configuration", vehicle.engineConfiguration],
        ["Cylinders", vehicle.engineCylinders],
        ["Displacement", vehicle.displacement],
        ["Turbo", vehicle.turbo],
        ["Transmission", vehicle.transmission],
        ["Transmission Speeds", vehicle.transmissionSpeeds],
        ["Drivetrain", vehicle.drivetrain],
        ["Fuel Type", vehicle.fuelType],
        ["Electrification Level", vehicle.electrificationLevel],
        ["Engine HP", vehicle.engineHP],
        ["Engine kW", vehicle.engineKW],
        ["Engine Manufacturer", vehicle.engineManufacturer],
      ],
    },
    {
      title: "Body",
      fields: [
        ["Body Style", vehicle.bodyStyle],
        ["Vehicle Type", vehicle.vehicleType],
        ["Doors", vehicle.doors],
        ["Color", vehicle.color],
        ["Mileage", vehicle.mileage],
        ["GVWR", vehicle.gvwr],
      ],
    },
    {
      title: "Manufacturing",
      fields: [
        ["Manufacturer", vehicle.manufacturer],
        ["Plant Country", vehicle.plantCountry],
        ["Plant City", vehicle.plantCity],
        ["Plant State", vehicle.plantState],
      ],
    },
    {
      title: "Safety",
      fields: [
        ["Brake System", vehicle.brakeSystem],
        ["ABS", vehicle.abs],
        ["ESC", vehicle.esc],
        ["TPMS", vehicle.tpms],
        ["Rear Visibility System", vehicle.rearVisibilitySystem],
        ["Park Assist", vehicle.parkAssist],
        ["Adaptive Driving Beam", vehicle.adaptiveDrivingBeam],
        ["Front Airbags", vehicle.airBagLocFront],
        ["Knee Airbags", vehicle.airBagLocKnee],
        ["Side Airbags", vehicle.airBagLocSide],
        ["Pretensioner", vehicle.pretensioner],
        ["Seat Belts", vehicle.seatBeltsAll],
      ],
    },
  ];

  const isOwner = !!(session?.user?.id && vehicle.ownerId === session.user.id && vehicle.status === "CLAIMED");
  const heroPhoto = vehicle.photos?.find((p: any) => p.isHero) || vehicle.photos?.[0];

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 42, marginBottom: 32 }}>
        {vehicle.model.make.name} {vehicle.model.name}
      </h1>

      {!isOwner && vehicle.photos && vehicle.photos.length > 0 && (
        <section style={{
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "24px",
          backgroundColor: "#fafafa",
          display: "grid",
          gap: "16px",
          marginBottom: "32px"
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#111827" }}>Vehicle Photos</h2>
          {heroPhoto && (
            <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: "12px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
              <img src={heroPhoto.filePath} alt={heroPhoto.caption || "Vehicle Hero"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              {heroPhoto.caption && (
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", color: "#ffffff", padding: "8px 12px", fontSize: "13px" }}>
                  {heroPhoto.caption}
                </div>
              )}
            </div>
          )}
          {vehicle.photos.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "12px" }}>
              {vehicle.photos.filter((p: any) => p.id !== heroPhoto?.id).map((p: any) => (
                <div key={p.id} style={{ position: "relative", paddingTop: "66.67%", borderRadius: "8px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                  <img src={p.filePath} alt={p.caption || "Vehicle Thumbnail"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {vehicle.status === "CLAIMED" && (
        <section style={{
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "24px",
          backgroundColor: "#fafafa",
          display: "grid",
          gap: "24px",
          marginBottom: "32px"
        }}>
          {/* Summary Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px", color: "#111827" }}>Vehicle Passport</h2>
              {/* Vehicle name */}
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#4b5563", marginBottom: "8px" }}>
                {vehicle.model.make.name} {vehicle.model.name}
                {(vehicle.series || vehicle.trim) && ` - ${vehicle.series || vehicle.trim}`}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{
                  backgroundColor: "#dcfce7",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: "bold",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  textTransform: "uppercase"
                }}>
                  Claimed
                </span>
                {isOwner && (
                  <span style={{
                    backgroundColor: "#dbeafe",
                    color: "#1d4ed8",
                    fontSize: "12px",
                    fontWeight: "bold",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ✓ Verified Owner
                  </span>
                )}
              </div>
            </div>
            
            {isOwner && (
              <a href={`/vehicle/${vehicle.vin}/edit`} style={{
                backgroundColor: "#111827",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}>
                Edit Vehicle
              </a>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {/* 1. Hero Photo */}
            {heroPhoto ? (
              <div style={{
                borderRadius: "12px",
                overflow: "hidden",
                position: "relative",
                height: "100%",
                minHeight: "140px",
                backgroundColor: "#f3f4f6"
              }}>
                <img src={heroPhoto.filePath} alt="Hero Vehicle" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{
                border: "2px dashed #e5e7eb",
                borderRadius: "12px",
                padding: "32px 16px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                color: "#9ca3af",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "4px"
              }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>📷</div>
                <div>[ Future Hero Vehicle Photo ]</div>
              </div>
            )}

            {/* 2. Next Maintenance Summary */}
            <div style={{
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
              backgroundColor: "#ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block" }}>Next Service</span>
                {(() => {
                  if (currentMileage === null || currentMileage === undefined) {
                    return (
                      <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px", fontStyle: "italic" }}>
                        Add current mileage to generate personalized maintenance recommendations.
                      </div>
                    );
                  }
                  if (sortedRules.length === 0) {
                    return (
                      <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px", fontStyle: "italic" }}>
                        No service rules defined.
                      </div>
                    );
                  }
                  
                  const rule = sortedRules[0];
                  let recText = "";
                  if (rule.intervalMiles) {
                    const records = vehicle.serviceRecords.filter((r: any) => r.description?.startsWith(`[${rule.serviceName}]`));
                    const lastCompletedMileage = records.reduce((max: number, r: any) => Math.max(max, r.mileage || 0), 0);
                    
                    let nextMilestone = Math.ceil(currentMileage / rule.intervalMiles) * rule.intervalMiles;
                    while (nextMilestone <= lastCompletedMileage) {
                      nextMilestone += rule.intervalMiles;
                    }

                    const remaining = nextMilestone - currentMileage;
                    if (remaining < 0) {
                      recText = `${Math.abs(remaining).toLocaleString()} miles overdue`;
                    } else if (remaining === 0) {
                      recText = "Due Now";
                    } else {
                      recText = `${remaining.toLocaleString()} miles remaining`;
                    }
                  } else if (rule.intervalMonths) {
                    recText = rule.intervalMonths === 12 
                      ? "Recommended annually" 
                      : `Recommended every ${rule.intervalMonths} months`;
                  }

                  return (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                        {rule.serviceName}
                      </div>
                      <div style={{ fontSize: "13px", color: "#4b5563", marginTop: "2px" }}>
                        {recText}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "12px" }}>
                <span style={{ fontSize: "14px" }}>🔧</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#4b5563" }}>Maintenance Intel</span>
              </div>
            </div>

            {/* 3. Market Value (Future Market Data Placeholder) */}
            <div style={{
              border: "2px dashed #e5e7eb",
              borderRadius: "12px",
              padding: "32px 16px",
              textAlign: "center",
              backgroundColor: "#ffffff",
              color: "#9ca3af",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: "4px"
            }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>💰</div>
              <div>[ Future Market Value ]</div>
            </div>

          </div>

          {/* Vehicle Health Section */}
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "24px",
            backgroundColor: "#ffffff",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "24px",
            marginTop: "24px"
          }}>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", margin: "0 0 16px 0" }}>
                Vehicle Health
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  border: "4px solid #10b981",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#10b981"
                }}>
                  {healthScore}%
                </div>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                    Passport Completeness
                  </div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    Dynamic ownership intelligence score
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", alignContent: "center" }}>
              {healthChecklist.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  {item.complete ? (
                    <>
                      <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
                      <span style={{ color: "#374151", fontWeight: 500 }}>{item.label}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#f59e0b", fontWeight: "bold" }}>⚠</span>
                      <span style={{ color: "#6b7280" }}>
                        {item.missingText || item.label}
                        {isOwner && item.actionText && (
                          <>
                            {" — "}
                            <a href={item.link} style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                              {item.actionText}
                            </a>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Passport Sections */}
          <div style={{ display: "grid", gap: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "24px", marginTop: "24px" }}>
            
            {/* 1. Vehicle Information */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>ℹ️</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Vehicle Information</span>
              </div>
              
              {!vehicle.profile || (!vehicle.profile.exteriorColor && !vehicle.profile.interiorColor && !vehicle.profile.currentMileage && !vehicle.profile.ownerNotes) ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {vehicle.profile.exteriorColor && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Exterior Color</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.exteriorColor}</span>
                    </div>
                  )}
                  {vehicle.profile.interiorColor && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Interior Color</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.interiorColor}</span>
                    </div>
                  )}
                  {vehicle.profile.currentMileage !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Current Mileage</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.currentMileage.toLocaleString()} mi</span>
                    </div>
                  )}
                  {vehicle.profile.ownerNotes && (
                    <div style={{ marginTop: "8px", borderTop: "1px solid #f3f4f6", paddingTop: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Owner Notes</span>
                      <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#374151", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {vehicle.profile.ownerNotes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Photos */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>🖼️</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Photos</span>
              </div>

              {vehicle.photos?.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "16px" }}>
                  {/* Hero Image Centerpiece */}
                  {heroPhoto && (
                    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: "8px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                      <img src={heroPhoto.filePath} alt={heroPhoto.caption || "Hero Vehicle"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      {heroPhoto.caption && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", color: "#ffffff", padding: "8px 12px", fontSize: "13px" }}>
                          {heroPhoto.caption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gallery grid of other photos */}
                  {vehicle.photos.length > 1 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "12px" }}>
                      {vehicle.photos.filter((p: any) => p.id !== heroPhoto?.id).map((p: any) => (
                        <div key={p.id} style={{ position: "relative", paddingTop: "66.67%", borderRadius: "6px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                          <img src={p.filePath} alt={p.caption || "Gallery Vehicle"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Service History */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>📋</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Service History</span>
              </div>

              {!vehicle.serviceRecords || vehicle.serviceRecords.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {vehicle.serviceRecords.map((srv: any) => (
                    <div key={srv.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{new Date(srv.serviceDate).toLocaleDateString()}</span>
                        {srv.cost !== null && <span style={{ fontWeight: 600, color: "#059669" }}>${srv.cost.toLocaleString()}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "12px", fontSize: "13px", color: "#6b7280" }}>
                        {srv.mileage !== null && <span>{srv.mileage.toLocaleString()} mi</span>}
                        {srv.shopName && <span>• {srv.shopName}</span>}
                      </div>
                      {srv.description && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#4b5563", lineHeight: 1.4 }}>
                          {srv.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Inspection Reports */}
            {isOwner && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>🔍</span>
                  <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Inspection Reports</span>
                </div>
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              </div>
            )}

            {/* 5. Documents */}
            {isOwner && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>📁</span>
                  <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Documents</span>
                </div>

                {vehicle.documents?.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {[
                      { displayTitle: "Inspection Reports", types: ["Inspection Report"] },
                      { displayTitle: "Service Invoices", types: ["Service Invoice"] },
                      { displayTitle: "Awards", types: ["Award Certificate"] },
                      { displayTitle: "Other", types: ["Registration", "Warranty", "Other"] }
                    ].map((group) => {
                      const docs = vehicle.documents.filter((d: any) => group.types.includes(d.documentType));
                      if (docs.length === 0) return null;

                      return (
                        <div key={group.displayTitle} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
                          <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#6b7280", margin: "0 0 8px 0", textTransform: "uppercase" }}>{group.displayTitle}</h4>
                          <div style={{ display: "grid", gap: "8px" }}>
                            {docs.map((doc: any) => (
                              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "16px" }}>📄</span>
                                <div>
                                  <a href={doc.filePath} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
                                    {doc.title}
                                  </a>
                                  <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "8px" }}>
                                    ({new Date(doc.createdAt).toLocaleDateString()})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 6. Modifications */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>⚡</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Modifications</span>
              </div>

              {!vehicle.modifications || vehicle.modifications.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {vehicle.modifications.map((mod: any) => (
                    <div key={mod.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{mod.name}</span>
                        {mod.installedDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>Installed: {mod.installedDate}</span>}
                      </div>
                      {mod.brand && <p style={{ margin: "2px 0", fontSize: "13px", color: "#4b5563" }}>Brand: {mod.brand}</p>}
                      {mod.description && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                          {mod.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 7. Awards */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>🏆</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Awards</span>
              </div>

              {!vehicle.awards || vehicle.awards.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {vehicle.awards.map((awd: any) => (
                    <div key={awd.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{awd.title}</span>
                        {awd.awardDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>{new Date(awd.awardDate).toLocaleDateString()}</span>}
                      </div>
                      {awd.eventName && <p style={{ margin: "2px 0", fontSize: "13px", color: "#4b5563" }}>Event: {awd.eventName}</p>}
                      {awd.description && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                          {awd.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </section>
      )}

      <div style={{ display: "grid", gap: 32 }}>
        {sections.map((section) => {
          const visibleFields = section.fields.filter(([, value]) => {
            if (value === null || value === undefined || value === "") return false;
            if (typeof value === "string" && value.trim().toLowerCase() === "unknown") return false;
            return true;
          });
          if (visibleFields.length === 0) return null;

          return (
            <section key={section.title}>
              <h2 style={{ fontSize: 20, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 16, color: "#666" }}>
                {section.title}
              </h2>
              <div style={{ display: "grid", gap: 8 }}>
                {visibleFields.map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "#888" }}>{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Maintenance Intelligence Section */}
      <MaintenanceIntelligence
        vin={vehicle.vin}
        isOwner={isOwner}
        currentMileage={currentMileage ?? null}
        sortedRules={sortedRules}
        serviceRecords={vehicle.serviceRecords}
      />
    </div>
  );
}
