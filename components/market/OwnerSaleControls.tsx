"use client";

import React, { useState } from "react";
import { listVehicleForSale, removeFromSale } from "@/app/actions/listing";

type OwnerSaleControlsProps = {
  vin: string;
  isForSale: boolean;
  askingPrice: number | null;
};

export default function OwnerSaleControls({
  vin,
  isForSale,
  askingPrice,
}: OwnerSaleControlsProps) {
  const [isListingFlow, setIsListingFlow] = useState(false);
  const [isRemoveHovered, setIsRemoveHovered] = useState(false);
  const [isConfirmHovered, setIsConfirmHovered] = useState(false);
  const [isListHovered, setIsListHovered] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultAskingPrice = askingPrice ?? undefined;

  const getErrorMessage = (err: unknown) => {
    return err instanceof Error ? err.message : "Something went wrong.";
  };

  const handleList = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const priceStr = formData.get("askingPrice") as string;
    const price = parseFloat(priceStr);
    try {
      await listVehicleForSale(vin, price);
      setIsListingFlow(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await removeFromSale(vin);
      setIsListingFlow(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="owner-sale-controls">
      {error && (
        <div className="owner-sale-controls__error">
          Error: {error}
        </div>
      )}

      {isForSale ? (
        // AFTER LISTING: Show Remove From Sale button
        <form onSubmit={handleRemove}>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: isRemoveHovered ? "#b91c1c" : "#dc2626",
              color: "#ffffff",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.2s",
              opacity: loading ? 0.7 : 1
            }}
            onMouseEnter={() => setIsRemoveHovered(true)}
            onMouseLeave={() => setIsRemoveHovered(false)}
          >
            {loading ? "Removing..." : "Remove From Sale"}
          </button>
        </form>
      ) : (
        // NOT FOR SALE: Show list button or inline form
        <div>
          {!isListingFlow ? (
            <button
              type="button"
              onClick={() => setIsListingFlow(true)}
              style={{
                backgroundColor: isListHovered ? "#059669" : "#10b981",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
              onMouseEnter={() => setIsListHovered(true)}
              onMouseLeave={() => setIsListHovered(false)}
            >
              List Vehicle For Sale
            </button>
          ) : (
            // Listing flow: Show price input and confirm button next to each other inline
            <form className="owner-sale-controls__listing-form" onSubmit={handleList}>
              <input
                type="number"
                name="askingPrice"
                placeholder="Asking Price ($)"
                required
                min="1"
                defaultValue={defaultAskingPrice}
                disabled={loading}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "14px",
                  outline: "none"
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: isConfirmHovered ? "#059669" : "#10b981",
                  color: "#ffffff",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background-color 0.2s",
                  opacity: loading ? 0.7 : 1
                }}
                onMouseEnter={() => setIsConfirmHovered(true)}
                onMouseLeave={() => setIsConfirmHovered(false)}
              >
                {loading ? "Confirming..." : "Confirm Listing"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setIsListingFlow(false);
                  setError(null);
                }}
                style={{
                  backgroundColor: isCancelHovered ? "#f1f5f9" : "#ffffff",
                  color: "#475569",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "1px solid #cbd5e1",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={() => setIsCancelHovered(true)}
                onMouseLeave={() => setIsCancelHovered(false)}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
