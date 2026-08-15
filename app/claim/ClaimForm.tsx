"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimVehicle } from "@/app/actions/claim";

export default function ClaimForm({ modelId, modelName, makeName }: { modelId: string, modelName: string, makeName: string }) {
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const normalizedVin = vin.trim().toUpperCase();

    try {
      const response = await fetch("/api/vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: normalizedVin }),
      });

      if (!response.ok) {
        throw new Error("Failed to verify VIN");
      }

      const data = await response.json();

      if (!data.valid) {
        throw new Error(data.error || "VIN not found");
      }

      // Simple validation: Check if make and model match (case-insensitive)
      // NHTSA returns fields like 'Make', 'Model', 'ModelYear'
      const makeMatch = data.Make?.toLowerCase().includes(makeName.toLowerCase()) || 
                        makeName.toLowerCase().includes(data.Make?.toLowerCase() || "");
      
      const modelMatch = data.Model?.toLowerCase().includes(modelName.toLowerCase()) || 
                         modelName.toLowerCase().includes(data.Model?.toLowerCase() || "");

      if (!makeMatch || !modelMatch) {
        throw new Error("This VIN does not match this vehicle.");
      }

      // VIN is valid and matches the model, now execute the claim server action
      await claimVehicle(modelId, normalizedVin);
      
      router.refresh();
      router.push("/garage");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not verify this VIN.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="claim-form">
      <div className="claim-field">
        <label>Vehicle VIN</label>
        <input
          value={vin}
          onChange={(e) => setVin(e.target.value.toUpperCase().replace(/\s/g, ""))}
          placeholder="Enter 17-character VIN"
          maxLength={17}
          autoComplete="off"
          required
        />
      </div>
      {error && (
        <div className="claim-error">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="garage-primary-button claim-submit-button"
      >
        {loading ? "Verifying..." : "Continue"}
      </button>
    </form>
  );
}
