"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createDealerPurchasePackage,
  createInsuranceQuotePackage,
  createTransportQuotePackage
} from "@/app/actions/purchase";
import {
  getDealerPurchaseDepositAmount,
  getDealerPurchaseDepositPercentLabel,
} from "@/lib/pricing/dealer-purchase-fees";

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
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: ""
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const platformFee = getDealerPurchaseDepositAmount(askingPrice);
  const platformFeePercent = getDealerPurchaseDepositPercentLabel(askingPrice);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setAgreedToTerms(false);
    setInsuranceSelected("");
    setPurchaseId(null);
    setIsSubmitting(false);
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

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleFinalSubmit = async () => {
    const { streetAddress, city, state, postalCode } = deliveryAddress;
    if (!agreedToTerms || !formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      alert("Please fill in all required buyer fields and accept the terms.");
      return;
    }
    if (!insuranceSelected) {
      alert("Please select an insurance option.");
      return;
    }
    if (!streetAddress || !city || !state || !postalCode || !deliveryDate) {
      alert("Please fill in all delivery fields and the delivery date.");
      return;
    }

    setIsSubmitting(true);
    try {
      const dealerResult = await createDealerPurchasePackage({
        listingId,
        amount: askingPrice,
        buyerName: formData.firstName + " " + formData.lastName,
        buyerEmail: formData.email,
        buyerPhone: formData.phone,
        buyerMessage: `Interested in purchasing ${year} ${make} ${model} (${vin})`,
        requestedTerms: {
          requestedDeliveryDate: deliveryDate,
        },
      });
      setPurchaseId(dealerResult.purchaseId);

      if (insuranceSelected === "QUOTES") {
        await createInsuranceQuotePackage({
          purchaseId: dealerResult.purchaseId,
          status: "QUOTE_STARTED",
          garagingState: formData.state,
          garagingZip: formData.zipCode,
        });
      }

      await createTransportQuotePackage({
        purchaseId: dealerResult.purchaseId,
        address: { streetAddress, city, state, postalCode },
        transportMethod: deliveryMethod,
        deliveryDate,
        buyerPhone: formData.phone,
      });

      const response = await fetch("/api/payments/dealer-purchase-deposit-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fulfillmentRequestId: dealerResult.fulfillmentRequestId,
          returnTo: `/vehicle/${vin}`,
        }),
      });
      const checkout = await response.json();
      if (!response.ok || !checkout.url) {
        throw new Error(checkout.error || "Failed to start Stripe Checkout.");
      }
      window.location.href = checkout.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit purchase request.";
      alert(message);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        className="vehicle-purchase-button"
        onClick={() => setIsOpen(true)}
        style={{
          width: "100%",
          backgroundColor: "#e20f1b",
          color: "#ffffff",
          minHeight: "42px",
          padding: "0 14px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 900,
          letterSpacing: "0.06em",
          border: "1px solid rgba(226, 15, 27, 0.82)",
          cursor: "pointer",
          boxShadow: "0 14px 34px rgba(226, 15, 27, 0.18)",
          transition: "background-color 0.2s, transform 0.1s",
          textAlign: "center",
          textTransform: "uppercase",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f01928")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#e20f1b")}
      >
        Buy This Car
      </button>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="purchase-wizard-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resetWizard();
      }}
    >
      <div className="purchase-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="purchase-wizard-title">
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
            <h3 id="purchase-wizard-title" style={{ fontSize: "18px", fontWeight: 800, color: "#111827", margin: 0 }}>
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
            aria-label="Close purchase wizard"
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
        <div className="purchase-wizard-progress">
          {[1, 2, 3, 4, 5].map((s) => (
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
                  {s === 3 && "Insurance"}
                  {s === 4 && "Delivery"}
                  {s === 5 && "Review"}
                </span>
              </div>
              {s < 5 && (
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
        <div className="purchase-wizard-content">
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
                Step 2: Buyer Information & Consent
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "16px" }}>
                Please provide your contact details to proceed with this purchase request.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>First Name</label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="e.g. John"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Last Name</label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="e.g. Doe"
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Email</label>
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
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Phone</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="e.g. 555-123-4567"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Street Address</label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                    placeholder="123 Main St"
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>City</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>State</label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "4px" }}>Zip Code</label>
                    <input
                      type="text"
                      required
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <div style={{ backgroundColor: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginTop: "8px" }}>
                  <p style={{ fontSize: "12px", color: "#475569", lineHeight: 1.5, margin: 0, paddingBottom: "12px", borderBottom: "1px solid #cbd5e1" }}>
                    <strong>Legal Disclaimer:</strong> This purchase request is contingent upon the selling dealer&apos;s final approval of the offer and vehicle availability. By proceeding, the buyer agrees to pay the total vehicle price upon approval. A platform service fee of <strong>{platformFeePercent}</strong> (${platformFee.toLocaleString()}) will be applied to this transaction. This fee is non-refundable once the dealer accepts the offer.
                  </p>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px" }}>
                    <input
                      type="checkbox"
                      id="legalConsent"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      style={{ marginTop: "3px", width: "16px", height: "16px" }}
                    />
                    <label htmlFor="legalConsent" style={{ fontSize: "13px", color: "#334155", lineHeight: 1.4 }}>
                      I acknowledge that I have read and agree to SUPERCAR DASH&apos;s <a href="/legal/terms" target="_blank" style={{ color: "#2563eb", textDecoration: "underline" }}>Terms of Use</a> and <a href="/legal/privacy" target="_blank" style={{ color: "#2563eb", textDecoration: "underline" }}>Privacy Policy</a>.
                    </label>
                  </div>
                </div>

              </div>
            </div>
          )}



          {step === 5 && (
            <div style={{ display: "grid", gap: "16px" }}>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginTop: 0, marginBottom: "12px" }}>
                Step 5: Review & Purchase
              </h4>
              <p style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.5, marginBottom: "12px" }}>
                Please review your details. Your purchase package is sent after the refundable request deposit is completed in Stripe Checkout.
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
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{formData.firstName} {formData.lastName}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Buyer Email</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{formData.email || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Buyer Phone</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{formData.phone || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Buyer Address</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", textAlign: "right" }}>
                    {formData.address ? `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode}` : "N/A"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                  <span style={{ color: "#64748b" }}>Estimated Platform Service Fee ({platformFeePercent})</span>
                  <span style={{ fontWeight: 600, color: "#10b981" }}>${platformFee.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: "4px" }}>
                  <span style={{ color: "#0f172a" }}>Total Purchase Price (excluding taxes)</span>
                  <span style={{ color: "#10b981" }}>${(askingPrice + platformFee).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: "4px" }}>
                  <span style={{ color: "#0f172a" }}>Deposit due now</span>
                  <span style={{ color: "#2563eb" }}>$5,000</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
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

          {step === 4 && (
            <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>
                      Step 4: Schedule Delivery
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        if (formData.address) {
                          setDeliveryAddress(prev => ({
                            ...prev,
                            streetAddress: formData.address,
                            city: formData.city,
                            state: formData.state,
                            postalCode: formData.zipCode,
                            formattedAddress: `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode}`.trim().replace(/^,\s*|,\s*$/g, "")
                          }));
                        }
                      }}
                      style={{ fontSize: "13px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      Use Billing Address
                    </button>
                  </div>
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
            </div>
          )}
        </div>


        {/* Footer */}
        <div className="purchase-wizard-footer">
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
          
          {step < 5 ? (
            <button
              onClick={async () => {
                if (step === 2) {
                  if (!agreedToTerms || !formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
                    alert("Please fill in all required fields and accept the terms.");
                    return;
                  }
                } else if (step === 3) {
                  if (!insuranceSelected) {
                    alert("Please select an insurance option.");
                    return;
                  }
                } else if (step === 4) {
                  const { streetAddress, city, state, postalCode } = deliveryAddress;
                  if (!streetAddress || !city || !state || !postalCode || !deliveryDate) {
                    alert("Please fill in all address fields and the delivery date.");
                    return;
                  }
                }
                
                setStep(step + 1);
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
              Continue
            </button>
          ) : (
            <button
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                backgroundColor: isSubmitting ? "#94a3b8" : "#10b981",
                color: "#ffffff",
                border: "none",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer"
              }}
            >
              {isSubmitting ? "Opening Checkout..." : "Submit & Pay Deposit"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
