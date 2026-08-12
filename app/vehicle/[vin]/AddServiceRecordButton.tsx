"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addServiceRecord } from "@/app/actions/passport";

type AddServiceRecordButtonProps = {
  vin: string;
};

export default function AddServiceRecordButton({ vin }: AddServiceRecordButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceDate, setServiceDate] = useState("");
  const [mileage, setMileage] = useState("");
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setServiceDate("");
    setMileage("");
    setShopName("");
    setDescription("");
    setCost("");
    setError(null);
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceDate) {
      setError("Service date is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await addServiceRecord(vin, {
        serviceDate,
        mileage: mileage ? Number(mileage) : null,
        shopName,
        description,
        cost: cost ? Number(cost) : null,
      });
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add service record.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="vehicle-intelligence-add-record-button" onClick={() => setOpen(true)}>
        Add Service Record
      </button>

      {open ? (
        <div className="vehicle-intelligence-modal-backdrop" role="presentation">
          <div className="vehicle-intelligence-modal" role="dialog" aria-modal="true" aria-labelledby="add-service-record-title">
            <div className="vehicle-intelligence-modal-header">
              <div>
                <span>Passport Service History</span>
                <h2 id="add-service-record-title">Add Service Record</h2>
              </div>
              <button
                type="button"
                className="vehicle-intelligence-modal-close"
                aria-label="Close service record form"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
              >
                X
              </button>
            </div>

            <form onSubmit={handleSubmit} className="vehicle-intelligence-service-form">
              <label>
                Service Date *
                <input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
              </label>
              <label>
                Mileage
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={mileage}
                  onChange={(event) => setMileage(event.target.value)}
                  placeholder="e.g. 6842"
                />
              </label>
              <label>
                Shop
                <input value={shopName} onChange={(event) => setShopName(event.target.value)} placeholder="e.g. Ferrari Miami" />
              </label>
              <label>
                Cost
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  placeholder="e.g. 1250"
                />
              </label>
              <label className="vehicle-intelligence-service-form-wide">
                Service Performed
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. Annual service, oil change, brake fluid flush"
                  rows={4}
                />
              </label>

              {error ? <p className="vehicle-intelligence-form-error">{error}</p> : null}

              <div className="vehicle-intelligence-modal-actions">
                <button
                  type="button"
                  className="vehicle-intelligence-secondary-button"
                  disabled={loading}
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="vehicle-intelligence-primary-button" disabled={loading}>
                  {loading ? "Adding..." : "Add Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
