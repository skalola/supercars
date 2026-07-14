"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeMaintenanceItem } from "@/app/actions/passport";

type MaintenanceIntelligenceProps = {
  vin: string;
  isOwner: boolean;
  currentMileage: number | null;
  sortedRules: any[];
  serviceRecords: any[];
};

export default function MaintenanceIntelligence({
  vin,
  isOwner,
  currentMileage,
  sortedRules,
  serviceRecords
}: MaintenanceIntelligenceProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any | null>(null);
  
  // Form State
  const [formDate, setFormDate] = useState("");
  const [formMileage, setFormMileage] = useState<number | "">("");
  const [formShop, setFormShop] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCost, setFormCost] = useState<number | "">("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill helper when opening the modal
  const openCompletionForm = (rule: any) => {
    setSelectedRule(rule);
    const today = new Date().toISOString().split("T")[0];
    setFormDate(today);
    setFormMileage(currentMileage ?? "");
    setFormShop("");
    setFormDesc("");
    setFormCost("");
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule) return;
    if (!formDate) {
      setError("Service date is required.");
      return;
    }
    if (formMileage === "") {
      setError("Completed mileage is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await completeMaintenanceItem(vin, {
        serviceName: selectedRule.serviceName,
        serviceDate: formDate,
        mileage: Number(formMileage),
        shopName: formShop,
        description: formDesc,
        cost: formCost === "" ? null : Number(formCost)
      });
      
      setModalOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save service record.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Helper to find completed service records for a given rule
  const getCompletedRecords = (ruleName: string) => {
    return serviceRecords.filter(r => r.description?.startsWith(`[${ruleName}]`));
  };


  return (
    <section style={{
      marginTop: "48px",
      borderTop: "1px solid #e5e7eb",
      paddingTop: "32px",
      display: "grid",
      gap: "24px"
    }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#111827" }}>
        Maintenance Intelligence
      </h2>

      {currentMileage === null || currentMileage === undefined ? (
        <div style={{
          padding: "24px",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          backgroundColor: "#fafafa",
          textAlign: "center",
          color: "#6b7280"
        }}>
          <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>💡</span>
          Add current mileage to generate personalized maintenance recommendations.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "24px" }}>
          
          {/* Current Mileage Display */}
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#4b5563" }}>
            Current Mileage: <span style={{ color: "#111827", fontWeight: 700 }}>{currentMileage.toLocaleString()} miles</span>
          </div>

          {/* Subsection 1: Upcoming Maintenance */}
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px 0", color: "#374151" }}>
              Upcoming Maintenance:
            </h3>

            {sortedRules.length === 0 ? (
              <p style={{ color: "#6b7280", fontStyle: "italic", margin: 0 }}>No maintenance recommendations available for this model.</p>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {sortedRules.map((rule) => {
                  let statusText = "Upcoming";
                  let dueText = "";
                  let remainingText = "";
                  let hasMileageCalc = false;

                  const records = getCompletedRecords(rule.serviceName);
                  const lastCompletedMileage = records.reduce((max, r) => Math.max(max, r.mileage || 0), 0);

                  if (rule.intervalMiles) {
                    hasMileageCalc = true;
                    
                    // Project the next milestone strictly after the last completed service mileage
                    let nextMilestone = Math.ceil(currentMileage / rule.intervalMiles) * rule.intervalMiles;
                    while (nextMilestone <= lastCompletedMileage) {
                      nextMilestone += rule.intervalMiles;
                    }

                    const remaining = nextMilestone - currentMileage;
                    dueText = `${nextMilestone.toLocaleString()} miles`;
                    
                    // Simple Status logic
                    if (currentMileage % rule.intervalMiles === 0 || remaining <= 0) {
                      statusText = "Due";
                    } else if (remaining <= 1000) {
                      statusText = "Due Soon";
                    } else {
                      statusText = "Upcoming";
                    }

                    if (remaining < 0) {
                      remainingText = `${Math.abs(remaining).toLocaleString()} miles overdue`;
                    } else if (remaining === 0) {
                      remainingText = "Due Now";
                    } else {
                      remainingText = `${remaining.toLocaleString()} miles remaining`;
                    }
                  } else if (rule.intervalMonths) {
                    dueText = rule.intervalMonths === 12 
                      ? "Annually" 
                      : `Every ${rule.intervalMonths} months`;
                    statusText = "Upcoming";
                  }

                  // Priority Badge Colors
                  const badgeColor = 
                    rule.priority === "REQUIRED" ? { bg: "#fef2f2", text: "#991b1b" } :
                    rule.priority === "RECOMMENDED" ? { bg: "#eff6ff", text: "#1e40af" } :
                    { bg: "#f3f4f6", text: "#374151" };

                  // Status Badge Colors
                  const statusColor = 
                    statusText === "Due" ? { bg: "#fee2e2", text: "#ef4444" } :
                    statusText === "Due Soon" ? { bg: "#fffbeb", text: "#f59e0b" } :
                    { bg: "#f0fdf4", text: "#22c55e" };

                  return (
                    <div key={rule.id} style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      padding: "16px",
                      backgroundColor: "#ffffff",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "16px",
                      flexWrap: "wrap"
                    }}>
                      <div style={{ display: "grid", gap: "8px", flex: "1 1 300px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            backgroundColor: "#f3f4f6",
                            color: "#4b5563",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            textTransform: "uppercase"
                          }}>
                            {rule.category}
                          </span>
                          <span style={{
                            backgroundColor: badgeColor.bg,
                            color: badgeColor.text,
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            textTransform: "uppercase"
                          }}>
                            {rule.priority}
                          </span>
                        </div>
                        
                        <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>
                          {rule.serviceName}
                        </h4>

                        <div style={{ display: "grid", gap: "4px" }}>
                          <div style={{ fontSize: "13px", color: "#4b5563" }}>
                            Status: <span style={{
                              backgroundColor: statusColor.bg,
                              color: statusColor.text,
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginLeft: "4px"
                            }}>{statusText}</span>
                          </div>
                          
                          <div style={{ fontSize: "13px", color: "#4b5563" }}>
                            Due: <span style={{ fontWeight: 600, color: "#111827" }}>{dueText}</span>
                          </div>

                          {hasMileageCalc && (
                            <div style={{ fontSize: "13px", color: "#4b5563" }}>
                              Remaining: <span style={{ fontWeight: 600, color: statusText === "Due" ? "#ef4444" : "#111827" }}>{remainingText}</span>
                            </div>
                          )}
                        </div>
                        
                        {rule.description && (
                          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                            {rule.description}
                          </p>
                        )}
                      </div>

                      {isOwner && (
                        <button
                          onClick={() => openCompletionForm(rule)}
                          style={{
                            backgroundColor: "#111827",
                            color: "#ffffff",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "background-color 0.2s"
                          }}
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>


        </div>
      )}

      {/* Completion Dialog Form Modal */}
      {modalOpen && selectedRule && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <form onSubmit={handleSave} style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            maxWidth: "480px",
            width: "100%",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            display: "grid",
            gap: "16px"
          }}>
            <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
              Complete {selectedRule.serviceName}
            </h3>

            {error && (
              <div style={{ color: "#b91c1c", backgroundColor: "#fef2f2", padding: "10px", borderRadius: "8px", fontSize: "13px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Service Date *</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Mileage Completed *</label>
              <input
                type="number"
                required
                value={formMileage}
                onChange={(e) => setFormMileage(e.target.value === "" ? "" : Number(e.target.value))}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Service Provider / Shop Name</label>
              <input
                type="text"
                placeholder="e.g. Lamborghini Beverly Hills"
                value={formShop}
                onChange={(e) => setFormShop(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Description</label>
              <textarea
                placeholder="e.g. Fluid inspection, filters and fresh synthetic oil change."
                rows={3}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none",
                  resize: "vertical"
                }}
              />
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Cost ($)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Optional"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value === "" ? "" : Number(e.target.value))}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={loading}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: "#111827",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? "Saving..." : "Save Record"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
