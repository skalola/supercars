"use client";

import { useState, useTransition } from "react";
import { addVendorAction } from "@/app/actions/admin-partner";
import type { PartnerType } from "@/lib/fulfillment/partner-registry";
import type { MakeOption } from "@/lib/makes/catalog";

type VendorFormState = {
  name: string;
  type: PartnerType;
  location: string;
  email: string;
  phone: string;
  website: string;
  makeSpecialization: string;
};

const initialForm: VendorFormState = {
  name: "",
  type: "DEALER",
  location: "",
  email: "",
  phone: "",
  website: "",
  makeSpecialization: "ALL",
};

export function AdminDirectoryActions({ makeOptions }: { makeOptions: MakeOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<VendorFormState>(initialForm);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const updateForm = (field: keyof VendorFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setMessage({ type: "error", text: "Vendor name is required." });
      return;
    }

    if (!form.email.trim() && !form.phone.trim() && !form.website.trim()) {
      setMessage({ type: "error", text: "Add at least one contact method." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await addVendorAction(form);
      setMessage({ type: result.success ? "success" : "error", text: result.message });

      if (result.success) {
        setForm(initialForm);
        setIsOpen(false);
      }
    });
  };

  return (
    <div className="admin-directory-actions">
      <button type="button" className="site-button" onClick={() => setIsOpen(true)}>
        Add Vendor
      </button>

      {message ? (
        <div className={`admin-directory-message ${message.type === "success" ? "is-success" : "is-error"}`}>
          {message.text}
        </div>
      ) : null}

      {isOpen ? (
        <div className="admin-modal-backdrop" role="presentation">
          <div className="admin-modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-vendor-title">
            <div className="admin-modal-header">
              <div>
                <div className="eyebrow">Manual Vendor</div>
                <h2 id="add-vendor-title">Add Vendor</h2>
              </div>
              <button type="button" className="site-button secondary" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            <div className="admin-modal-grid">
              <label>
                <span>Name</span>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ferrari Miami" />
              </label>
              <label>
                <span>Service Type</span>
                <select value={form.type} onChange={(event) => updateForm("type", event.target.value as PartnerType)}>
                  <option value="DEALER">Dealer</option>
                  <option value="SERVICE_SHOP">Service</option>
                  <option value="TRANSPORTER">Transport</option>
                  <option value="INSURER">Insurance</option>
                </select>
              </label>
              <label>
                <span>Location</span>
                <input value={form.location} onChange={(event) => updateForm("location", event.target.value)} placeholder="Miami, FL" />
              </label>
              <label>
                <span>Make</span>
                <select value={form.makeSpecialization} onChange={(event) => updateForm("makeSpecialization", event.target.value)}>
                  <option value="ALL">All</option>
                  {makeOptions.map((make) => (
                    <option key={make.id} value={make.name}>
                      {make.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="sales@example.com" />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="(305) 555-0100" />
              </label>
              <label className="admin-modal-wide">
                <span>Website</span>
                <input value={form.website} onChange={(event) => updateForm("website", event.target.value)} placeholder="https://example.com" />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="site-button secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="button" className="site-button" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Saving..." : "Save Vendor"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
