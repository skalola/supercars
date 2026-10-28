"use client";

import { useState, useTransition } from "react";
import {
  completeUserPartOrderAction,
  fulfillUserPartOrderAction,
  refundUserPartOrderAction,
} from "@/app/actions/user-part-orders";

type Props = {
  orderId: string;
  status: string;
  isBuyer: boolean;
  shippingMode: string;
};

export default function UserPartOrderControls({ orderId, status, isBuyer, shippingMode }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? "Transaction updated." : result.error || "The transaction could not be updated.");
      if (result.ok) setConfirmRefund(false);
    });
  }

  if (isBuyer && status === "FULFILLED") {
    return (
      <section className="part-order-workflow">
        <div><span>Buyer action</span><h2>Confirm delivery</h2><p>Confirm only after the part has arrived and you have inspected the package.</p></div>
        <button disabled={pending} onClick={() => run(() => completeUserPartOrderAction(orderId))}>Confirm received</button>
        {message ? <p role="status" className="part-order-message">{message}</p> : null}
      </section>
    );
  }

  if (!isBuyer && status === "PAID") {
    return (
      <section className="part-order-workflow">
        <div><span>Seller action</span><h2>{shippingMode === "LOCAL_PICKUP" ? "Complete handoff" : "Fulfill order"}</h2><p>Add shipment details when available. The buyer will be notified after fulfillment.</p></div>
        <form action={(formData) => run(() => fulfillUserPartOrderAction(orderId, formData))}>
          {shippingMode !== "LOCAL_PICKUP" ? <>
            <label>Carrier<input name="shippingCarrier" maxLength={80} placeholder="UPS, FedEx, USPS" /></label>
            <label>Tracking number<input name="trackingNumber" maxLength={120} autoComplete="off" /></label>
            <label className="is-wide">Tracking link<input name="trackingUrl" type="url" maxLength={500} placeholder="https://" /></label>
          </> : null}
          <label className="is-wide">Note to buyer<textarea name="sellerNote" maxLength={500} rows={3} placeholder={shippingMode === "LOCAL_PICKUP" ? "Pickup confirmation or handoff note" : "Packing or delivery note"} /></label>
          <button className="is-primary" disabled={pending} type="submit">{pending ? "Saving..." : shippingMode === "LOCAL_PICKUP" ? "Confirm handoff" : "Mark fulfilled"}</button>
        </form>
        <button className="is-danger" disabled={pending} onClick={() => setConfirmRefund(true)}>Cancel and refund</button>
        {message ? <p role="status" className="part-order-message">{message}</p> : null}
        {confirmRefund ? <RefundConfirmation pending={pending} onClose={() => setConfirmRefund(false)} onConfirm={() => run(() => refundUserPartOrderAction(orderId))} /> : null}
      </section>
    );
  }

  if (!isBuyer && status === "FULFILLED") {
    return (
      <section className="part-order-workflow is-compact">
        <div><span>Seller controls</span><h2>Order fulfilled</h2><p>The buyer can now confirm receipt. A full refund remains available if the sale must be reversed.</p></div>
        <button className="is-danger" disabled={pending} onClick={() => setConfirmRefund(true)}>Refund order</button>
        {message ? <p role="status" className="part-order-message">{message}</p> : null}
        {confirmRefund ? <RefundConfirmation pending={pending} onClose={() => setConfirmRefund(false)} onConfirm={() => run(() => refundUserPartOrderAction(orderId))} /> : null}
      </section>
    );
  }

  return null;
}

function RefundConfirmation({ pending, onClose, onConfirm }: { pending: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="part-order-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="part-order-confirm" role="alertdialog" aria-modal="true" aria-labelledby="refund-title">
        <span>Permanent financial action</span>
        <h2 id="refund-title">Cancel and refund this order?</h2>
        <p>Stripe will return the full buyer payment and reverse the SUPERCAR DASH application fee. This cannot be undone.</p>
        <div><button disabled={pending} onClick={onClose}>Keep order</button><button className="is-danger" disabled={pending} onClick={onConfirm}>{pending ? "Refunding..." : "Confirm refund"}</button></div>
      </div>
    </div>
  );
}
