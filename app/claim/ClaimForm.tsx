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

    try {
      const response = await fetch("/api/vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin }),
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
      await claimVehicle(modelId, vin, parseInt(data.ModelYear) || 2024, data);
      
      router.refresh();
      router.push("/garage");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>Vehicle VIN</label>
        <input 
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          placeholder="Enter 17-digit VIN..." 
          style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: 16 }}
          required 
        />
      </div>
      {error && (
        <div style={{ color: "#dc2626", fontSize: 14, fontWeight: 500 }}>{error}</div>
      )}
      <button 
        type="submit" 
        disabled={loading}
        style={{ 
          padding: "12px 16px", 
          borderRadius: 8, 
          background: loading ? "#ccc" : "#000", 
          color: "#fff", 
          border: "none", 
          cursor: loading ? "not-allowed" : "pointer", 
          fontWeight: 600 
        }}
      >
        {loading ? "Verifying..." : "Continue"}
      </button>
    </form>
  );
}
