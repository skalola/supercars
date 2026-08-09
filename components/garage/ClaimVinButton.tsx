"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { claimVehicleByVin } from "@/app/actions/claim";

type ClaimVinButtonProps = {
  label?: string;
  className?: string;
  isSignedIn: boolean;
  onOpen?: () => void;
  variant?: "hero" | "menu" | "empty";
};

export function ClaimVinButton({
  label = "Claim Your Car",
  className,
  isSignedIn,
  onOpen,
  variant = "hero",
}: ClaimVinButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [vin, setVin] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function openWorkflow() {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    setError("");
    onOpen?.();
    setIsOpen(true);
  }

  function submitVin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await claimVehicleByVin(vin);
      if (!result.ok) {
        if (result.reason === "unauthenticated") {
          router.push("/login");
          return;
        }
        setError(result.message || "Unable to claim this VIN.");
        return;
      }
      setIsOpen(false);
      router.push(result.href || "/garage");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={[className, variant === "menu" ? "site-account-button" : "supercar-logo-cta"].filter(Boolean).join(" ")}
        onClick={openWorkflow}
      >
        {label}
        {variant !== "menu" ? <span aria-hidden="true">&gt;</span> : null}
      </button>

      {isOpen ? (
        <div className="claim-vin-modal" role="dialog" aria-modal="true" aria-labelledby="claim-vin-title">
          <button type="button" className="claim-vin-backdrop" aria-label="Close claim VIN dialog" onClick={() => setIsOpen(false)} />
          <form className="claim-vin-card" onSubmit={submitVin}>
            <div>
              <span>SUPERCAR DASH</span>
              <h2 id="claim-vin-title">Claim your car</h2>
              <p>Enter the VIN and we will match it to the catalog before adding it to your garage.</p>
            </div>
            <label>
              <span>Vehicle VIN</span>
              <input
                value={vin}
                onChange={(event) => setVin(event.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="17-character VIN"
                maxLength={17}
                autoComplete="off"
                required
              />
            </label>
            {error ? <p className="claim-vin-error">{error}</p> : null}
            <div className="claim-vin-actions">
              <button type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={isPending || vin.length !== 17}>
                {isPending ? "Checking..." : "Claim Vehicle"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
