"use client";

type ServiceBookingActionButtonProps = {
  vin: string;
};

export default function ServiceBookingActionButton({ vin }: ServiceBookingActionButtonProps) {
  return (
    <button
      type="button"
      className="vehicle-intelligence-link-button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("supercars:open-service-booking", {
            detail: { vin },
          }),
        );
      }}
    >
      <span aria-hidden="true">▣</span>
      Book Service
    </button>
  );
}
