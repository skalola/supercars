"use client";

import React, { useState } from "react";
import {
  createDealerPurchasePackage,
  createInsuranceQuotePackage,
  createTransportQuotePackage
} from "@/app/actions/purchase";

type DeliveryMethod = "ENCLOSED" | "STANDARD";

type PurchaseWizardProps = {
  vin: string;
  year: number;
  make: string;
  model: string;
  askingPrice: number;
  mileage: number | null;
  color: string | null;
  listingId: string;
  originalListingUrl?: string | null;
  listedByLabel?: string | null;
  listedByHref?: string | null;
};

export default function PurchaseWizard({
  vin,
  year,
  make,
  model,
  askingPrice,
  mileage,
  color,
  listingId,
  originalListingUrl,
  listedByLabel,
  listedByHref,
}: PurchaseWizardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: `Hi, I am interested in your ${year} ${make} ${model} listed for $${askingPrice.toLocaleString()}. Please let me know when we can discuss this vehicle.`,
  });
  const [isSent, setIsSent] = useState(false);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);

  const [insuranceSelected, setInsuranceSelected] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState({
    streetAddress: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    latitude: null as number | null,
    longitude: null as number | null,
    formattedAddress: ""
  });

  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("ENCLOSED");
  const [deliverySubmitted, setDeliverySubmitted] = useState(false);

  const resetWizard = () => {
    setStep(1);
    setIsSent(false);
    setInsuranceSelected("");
    setPurchaseId(null);
    setDeliveryAddress({
      streetAddress: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      latitude: null,
      longitude: null,
      formattedAddress: ""
    });
    setDeliveryDate("");
    setDeliveryMethod("ENCLOSED");
    setDeliverySubmitted(false);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          width: "100%",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          padding: "16px 24px",
          borderRadius: "12px",
          fontSize: "18px",
          fontWeight: 700,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1)",
          transition: "background-color 0.2s, transform 0.1s",
          textAlign: "center",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
      >
        Buy This Car
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "20px",
      fontFamily: "Inter, system-ui, sans-serif"
    }}>
      <div style={{
        backgroundColor: "#ffffff",
        borderRadius: "16px",
        width: "100%",
        maxWidth: "600px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f8fafc"
        }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#111827", margin: 0 }}>
              Vehicle Purchase Experience
            </h3>
            <p style={{ fontSize: "13px", color: "#6b7280", margin: "2px 0 0 0" }}>
              {year} {make} {model} &bull; ${askingPrice.toLocaleString()}
            </p>
            {listedByLabel && listedByHref ? (
              <a
                href={listedByHref}
                style={{
                  display: "inline-block",
                  marginTop: "6px",
                  color: "#2563eb",
                  fontSize: "12px",
                  fontWeight: 800,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                Listed by {listedByLabel}
              </a>
            ) : originalListingUrl ? (
              <a
                href={originalListingUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: "6px",
                  color: "#2563eb",
                  fontSize: "12px",
                  fontWeight: 800,
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                View original listing
              </a>
            ) : null}
          </div>
          <button
            onClick={resetWizard}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              color: "#9ca3af",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            &times;
          </button>
        </div>

        {/* Steps Progress Indicator */}
        <div style={{
          display: "flex",
          background: "#f1f5f9",
          padding: "12px 24px",
          borderBottom: "1px solid #e5e7eb",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap"
        }}>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <React.Fragment key={s}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: step === s ? "#2563eb" : step > s ? "#10b981" : "#cbd5e1",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {step > s ? "✓" : s}
                </div>
                <span style={{
                  fontSize: "12px",
                  fontWeight: step === s ? 700 : 500,
                  color: step === s ? "#2563eb" : step > s ? "#10b981" : "#64748b"
                }}>
                  {s === 1 && "Details"}
                  {s === 2 && "Contact"}
                  {s === 3 && "Inspection"}
                  {s === 4 && "Review"}
                  {s === 5 && "Insurance"}
                  {s === 6 && "Delivery"}
                </span>
              </div>
              {s < 6 && (
                <div style={{
                  flex: 1,
                  minWidth: "10px",
                  height: "2px",
                  backgroundColor: step > s ? "#10b981" : "#cbd5e1"
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          {step === 1 && (
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Step 1: Review Vehicle Details
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "20px" }}>
                Review the core verified specifications of this vehicle before initiating contact. These details are direct from the vehicle passport.
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
                background: "#f8fafc",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0"
              }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>VIN</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{vin}</span>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>Asking Price</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#10b981" }}>${askingPrice.toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>Mileage</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                    {mileage ? `${mileage.toLocaleString()} miles` : "Not listed"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>Color</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{color || "Not listed"}</span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Step 2: Contact Seller
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "16px" }}>
                Send a direct message to the verified owner of this vehicle. They will receive an email notification.
              </p>
              {isSent ? (
                <div style={{
                  backgroundColor: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  padding: "16px",
                  borderRadius: "8px",
                  textAlign: "center",
                  color: "#065f46"
                }}>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>✉️</div>
                  <div style={{ fontWeight: 700 }}>Message Sent!</div>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>The seller has been notified and will contact you shortly.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Your Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Your Email</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="e.g. john@example.com"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Message</label>
                    <textarea
                      rows={3}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px", resize: "none" }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (formData.name && formData.email) {
                        setIsSent(true);
                      } else {
                        alert("Please fill in your name and email.");
                      }
                    }}
                    style={{
                      backgroundColor: "#10b981",
                      color: "#ffffff",
                      border: "none",
                      padding: "10px",
                      borderRadius: "6px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Send Message
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Step 3: Inspection / Verification
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "16px" }}>
                For ultimate peace of mind, we recommend coordinating a Pre-Purchase Inspection (PPI) and matching the verified VIN passport records.
              </p>
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", gap: "12px", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <div style={{ fontSize: "20px" }}>🛡️</div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Verified Identity & History</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      This vehicle passport has verified ownership structure, modification logs, and complete service histories.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <div style={{ fontSize: "20px" }}>🔍</div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>Schedule Pre-Purchase Inspection</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      Schedule a third-party mechanic inspection to audit the vehicle condition before finalized payment.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "grid", gap: "16px" }}>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Step 4: Review & Purchase
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "12px" }}>
                Please review your details and confirm purchase terms before proceeding to insurance.
              </p>
              <div style={{
                display: "grid",
                gap: "10px",
                background: "#f8fafc",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                fontSize: "14px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Vehicle</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{year} {make} {model}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>VIN</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{vin}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Buyer Name</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{formData.name || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Buyer Email</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{formData.email || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Inspection</span>
                  <span style={{ fontWeight: 600, color: "#10b981" }}>✓ Pre-Purchase Inspection Recommended</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: "4px" }}>
                  <span style={{ color: "#0f172a" }}>Purchase Price</span>
                  <span style={{ color: "#10b981" }}>${askingPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "grid", gap: "16px" }}>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Protect Your Investment
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "12px" }}>
                Insurance will be required before delivery.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setInsuranceSelected("EXISTS")}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: `2px solid ${insuranceSelected === "EXISTS" ? "#2563eb" : "#cbd5e1"}`,
                    backgroundColor: insuranceSelected === "EXISTS" ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.2s"
                  }}
                >
                  I already have insurance
                </button>
                <button
                  type="button"
                  onClick={() => setInsuranceSelected("QUOTES")}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: `2px solid ${insuranceSelected === "QUOTES" ? "#2563eb" : "#cbd5e1"}`,
                    backgroundColor: insuranceSelected === "QUOTES" ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.2s"
                  }}
                >
                  Get insurance quotes
                </button>
              </div>
              {insuranceSelected === "EXISTS" && (
                <div style={{ fontSize: "13px", color: "#10b981", fontWeight: 600, textAlign: "center" }}>
                  ✓ Selected: Already covered. Proof of policy upload will be requested later.
                </div>
              )}
              {insuranceSelected === "QUOTES" && (
                <div style={{ fontSize: "13px", color: "#2563eb", fontWeight: 600, textAlign: "center" }}>
                  ✓ Selected: Partner rates requested. We will connect you with competitive rates.
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div>
              {!deliverySubmitted ? (
                <div style={{ display: "grid", gap: "16px" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                    Schedule Delivery
                  </h4>
                  <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", display: "grid", gap: "6px", marginBottom: "4px" }}>
                    <div>🚗 <strong>Vehicle Info:</strong> {year} {make} {model} (VIN: {vin})</div>
                    {deliveryAddress.formattedAddress && (
                      <div>📍 <strong>Delivery Address:</strong> {deliveryAddress.formattedAddress}</div>
                    )}
                  </div>
                  
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ display: "grid", gap: "10px", background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      
                      <div style={{ display: "grid", gap: "4px" }}>
                        <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Street Address</label>
                        <input 
                          type="text"
                          required
                          value={deliveryAddress.streetAddress}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDeliveryAddress(prev => ({
                              ...prev,
                              streetAddress: val,
                              formattedAddress: `${val}, ${prev.city}, ${prev.state} ${prev.postalCode}`.trim().replace(/^,\s*|,\s*$/g, "")
                            }));
                          }}
                          placeholder="e.g. 1600 Amphitheatre Parkway"
                          style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>City</label>
                          <input 
                            type="text"
                            required
                            value={deliveryAddress.city}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDeliveryAddress(prev => ({
                                ...prev,
                                city: val,
                                formattedAddress: `${prev.streetAddress}, ${val}, ${prev.state} ${prev.postalCode}`.trim().replace(/^,\s*|,\s*$/g, "")
                              }));
                            }}
                            placeholder="e.g. Mountain View"
                            style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                          />
                        </div>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>State</label>
                          <input 
                            type="text"
                            required
                            value={deliveryAddress.state}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDeliveryAddress(prev => ({
                                ...prev,
                                state: val,
                                formattedAddress: `${prev.streetAddress}, ${prev.city}, ${val} ${prev.postalCode}`.trim().replace(/^,\s*|,\s*$/g, "")
                              }));
                            }}
                            placeholder="e.g. CA"
                            style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "4px" }}>
                        <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>ZIP Code</label>
                        <input 
                          type="text"
                          required
                          value={deliveryAddress.postalCode}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDeliveryAddress(prev => ({
                              ...prev,
                              postalCode: val,
                              formattedAddress: `${prev.streetAddress}, ${prev.city}, ${prev.state} ${val}`.trim().replace(/^,\s*|,\s*$/g, "")
                            }));
                          }}
                          placeholder="e.g. 94043"
                          style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                        />
                      </div>

                    </div>

                    <div style={{ display: "grid", gap: "4px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Preferred Delivery Date</label>
                      <input 
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      />
                    </div>

                    <div style={{ display: "grid", gap: "4px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563" }}>Transport Method</label>
                      <div style={{ display: "flex", gap: "12px" }}>
                        <label style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px",
                          border: `1px solid ${deliveryMethod === "ENCLOSED" ? "#2563eb" : "#cbd5e1"}`,
                          backgroundColor: deliveryMethod === "ENCLOSED" ? "#eff6ff" : "#ffffff",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500
                        }}>
                          <input 
                            type="radio" 
                            name="transportMethod"
                            checked={deliveryMethod === "ENCLOSED"}
                            onChange={() => setDeliveryMethod("ENCLOSED")}
                          />
                          Enclosed Transport
                        </label>
                        <label style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "10px",
                          border: `1px solid ${deliveryMethod === "STANDARD" ? "#2563eb" : "#cbd5e1"}`,
                          backgroundColor: deliveryMethod === "STANDARD" ? "#eff6ff" : "#ffffff",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500
                        }}>
                          <input 
                            type="radio" 
                            name="transportMethod"
                            checked={deliveryMethod === "STANDARD"}
                            onChange={() => setDeliveryMethod("STANDARD")}
                          />
                          Standard Transport
                        </label>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const { streetAddress, city, state, postalCode } = deliveryAddress;
                      if (!streetAddress || !city || !state || !postalCode || !deliveryDate) {
                        alert("Please fill in all address fields and the delivery date.");
                        return;
                      }

                      if (purchaseId) {
                        try {
                          await createTransportQuotePackage({
                            purchaseId,
                            address: { streetAddress, city, state, postalCode },
                            transportMethod: deliveryMethod,
                            deliveryDate
                          });
                        } catch (error) {
                          const message = error instanceof Error ? error.message : "Failed to submit delivery request.";
                          alert(message);
                          return;
                        }
                      }

                      setDeliverySubmitted(true);
                    }}
                    style={{
                      backgroundColor: "#10b981",
                      color: "#ffffff",
                      border: "none",
                      padding: "12px",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "14px",
                      marginTop: "8px",
                      textAlign: "center"
                    }}
                  >
                    Submit Delivery Request
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "16px", textAlign: "center", padding: "10px 0" }}>
                  <span style={{ fontSize: "40px" }}>🚚🎉</span>
                  <h4 style={{ fontSize: "18px", fontWeight: 700, color: "#065f46", margin: 0 }}>
                    Delivery request submitted.
                  </h4>
                  <p style={{ fontSize: "14px", color: "#374151", margin: 0, lineHeight: 1.5 }}>
                    A transport partner will contact you to finalize scheduling.
                  </p>
                  <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
                    Address: <strong>{deliveryAddress.formattedAddress}</strong> &bull; Date: <strong>{deliveryDate}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f8fafc"
        }}>
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#334155",
              fontSize: "14px",
              fontWeight: 600,
              cursor: step === 1 ? "not-allowed" : "pointer",
              opacity: step === 1 ? 0.5 : 1
            }}
          >
            Back
          </button>
          
          {step < 6 ? (
            <button
              onClick={async () => {
                if (step === 2 && !isSent) {
                  alert("Please contact the seller to proceed.");
                } else if (step === 4) {
                  try {
                    const result = await createDealerPurchasePackage({
                      listingId,
                      amount: askingPrice,
                      buyerName: formData.name,
                      buyerEmail: formData.email,
                      buyerMessage: `Interested in purchasing ${year} ${make} ${model} (${vin})`,
                    });
                    setPurchaseId(result.id);
                    setStep(5);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : "Failed to initialize purchase offer.";
                    alert(message);
                  }
                } else if (step === 5) {
                  if (!insuranceSelected) {
                    alert("Please select an insurance option.");
                    return;
                  }
                  if (purchaseId && insuranceSelected === "QUOTES") {
                    try {
                      await createInsuranceQuotePackage({ purchaseId, status: "QUOTE_STARTED" });
                    } catch (error) {
                      console.error("Failed to update insurance request:", error);
                    }
                  }
                  setStep(6);
                } else {
                  setStep(step + 1);
                }
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer"
              }}
            >
              {step === 4 ? "Continue to Insurance" : "Continue"}
            </button>
          ) : (
            <button
              onClick={resetWizard}
              disabled={!deliverySubmitted}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                backgroundColor: deliverySubmitted ? "#10b981" : "#ffffff",
                color: deliverySubmitted ? "#ffffff" : "#374151",
                border: deliverySubmitted ? "none" : "1px solid #cbd5e1",
                fontSize: "14px",
                fontWeight: 600,
                cursor: deliverySubmitted ? "pointer" : "not-allowed"
              }}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
