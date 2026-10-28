"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  deleteUserPartListingImageAction,
  saveUserPartListingAction,
  setUserPartListingStatusAction,
  uploadUserPartListingImageAction,
} from "@/app/actions/user-part-listings";
import { prepareVehiclePhoto } from "@/lib/media/client-image-upload";
import type { GaragePartListing } from "@/lib/parts/user-part-marketplace";

export type GaragePartCatalogOptions = {
  makes: Array<{ id: string; name: string }>;
  components: Array<{ id: string; name: string; label: string; shippingRestriction: string }>;
  brands: Array<{ id: string; name: string }>;
  paymentsReady: boolean;
};

type ModelOption = { id: string; name: string; makeId: string };
type EditorState = {
  id: string | null;
  componentTypeId: string;
  brandId: string;
  brandName: string;
  manufacturerPartNumber: string;
  title: string;
  description: string;
  condition: string;
  price: string;
  quantity: string;
  mileageOnPart: string;
  includedHardware: string;
  knownDefects: string;
  shippingMode: string;
  shippingCost: string;
  shipsFromCity: string;
  shipsFromState: string;
  returnPolicy: string;
  makeId: string;
  modelId: string;
  yearStart: string;
  yearEnd: string;
  trim: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  bodyStyle: string;
  sellerAttestationAccepted: boolean;
};

const emptyEditor: EditorState = {
  id: null,
  componentTypeId: "",
  brandId: "",
  brandName: "",
  manufacturerPartNumber: "",
  title: "",
  description: "",
  condition: "USED",
  price: "",
  quantity: "1",
  mileageOnPart: "",
  includedHardware: "",
  knownDefects: "",
  shippingMode: "SHIPPING",
  shippingCost: "",
  shipsFromCity: "",
  shipsFromState: "",
  returnPolicy: "NO_RETURNS",
  makeId: "",
  modelId: "",
  yearStart: "",
  yearEnd: "",
  trim: "",
  engine: "",
  transmission: "",
  drivetrain: "",
  bodyStyle: "",
  sellerAttestationAccepted: false,
};

export default function GaragePartListings({
  listings,
  isOwner,
  catalog,
  initialPurchaseListingId,
}: {
  listings: GaragePartListing[];
  isOwner: boolean;
  catalog: GaragePartCatalogOptions | null;
  initialPurchaseListingId?: string | null;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [purchaseListing, setPurchaseListing] = useState<GaragePartListing | null>(null);
  const [purchaseTermsAccepted, setPurchaseTermsAccepted] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOwner || !initialPurchaseListingId) return;
    const listing = listings.find((item) => item.id === initialPurchaseListingId);
    if (listing) setPurchaseListing(listing);
  }, [initialPurchaseListingId, isOwner, listings]);

  useEffect(() => {
    if (!editor?.makeId) return;
    const controller = new AbortController();
    fetch(`/api/catalog/models?makeId=${encodeURIComponent(editor.makeId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load models.")))
      .then((payload: { models?: ModelOption[] }) => setModels(payload.models ?? []))
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load models.");
      });
    return () => controller.abort();
  }, [editor?.makeId]);

  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  const selectedComponent = useMemo(
    () => catalog?.components.find((component) => component.id === editor?.componentTypeId) ?? null,
    [catalog?.components, editor?.componentTypeId],
  );
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  if (listings.length === 0 && !isOwner) {
    return (
      <div className="garage-collection-empty">
        <div className="garage-collection-empty-mark" aria-hidden="true">SD</div>
        <div><h2>No parts listed</h2><p>This garage does not have any active parts for sale.</p></div>
      </div>
    );
  }

  return (
    <div className="garage-parts-marketplace">
      {isOwner ? (
        <div className="garage-parts-toolbar">
          <div>
            <strong>Parts for Sale</strong>
            <span>List genuine parts with exact fitment and condition details.</span>
          </div>
          <button type="button" onClick={() => openEditor(null)}>+ Add Part</button>
        </div>
      ) : null}

      {listings.length ? (
        <div className="garage-part-listing-grid">
          {listings.map((listing) => (
            <article key={listing.id} className="garage-part-listing-card">
              <div className="garage-part-listing-image">
                {listing.images[0] ? <Image src={listing.images[0].url} alt={listing.title} fill sizes="(max-width: 700px) 112px, 360px" unoptimized /> : <span>Photo pending</span>}
                <em data-status={listing.status}>{formatLabel(listing.status)}</em>
              </div>
              <div className="garage-part-listing-body">
                <span>{listing.componentLabel}</span>
                <h2>{listing.title}</h2>
                <p>{listing.description}</p>
                <div className="garage-part-listing-meta">
                  <span><em>Price</em><strong>{formatCents(listing.priceCents)}</strong></span>
                  <span><em>Condition</em><strong>{formatLabel(listing.condition)}</strong></span>
                  <span><em>Brand</em><strong>{listing.brandName || "Unbranded"}</strong></span>
                  <span><em>Fits</em><strong>{formatFitment(listing)}</strong></span>
                </div>
              </div>
              {isOwner ? (
                <div className="garage-part-listing-actions">
                  <button type="button" onClick={() => openEditor(listing)}>Edit</button>
                  {listing.status === "DRAFT" || listing.status === "INACTIVE" ? (
                    <button type="button" className="is-primary" onClick={() => updateStatus(listing.id, "ACTIVE")}>Publish</button>
                  ) : listing.status === "ACTIVE" ? (
                    <button type="button" onClick={() => updateStatus(listing.id, "INACTIVE")}>Pause</button>
                  ) : null}
                  <button type="button" className="is-danger" onClick={() => confirmRemove(listing.id)}>Remove</button>
                </div>
              ) : (
                <div className="garage-part-listing-actions is-public">
                  <span>Sold directly by this garage owner</span>
                  <button type="button" className="is-primary" onClick={() => { setPurchaseListing(listing); setPurchaseTermsAccepted(false); setError(""); }}>Purchase Part</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="garage-collection-empty">
          <div className="garage-collection-empty-mark" aria-hidden="true">SD</div>
          <div><h2>List your first part</h2><p>Turn unused garage parts into a fitment-verified listing.</p></div>
          <button type="button" onClick={() => openEditor(null)}>Add Part</button>
        </div>
      )}

      {editor && catalog ? (
        <div className="garage-part-editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="part-editor-title">
          <form className="garage-part-editor" onSubmit={submitListing}>
            <header>
              <div><span>Garage Marketplace</span><h2 id="part-editor-title">{editor.id ? "Edit Part Listing" : "Add Part for Sale"}</h2></div>
              <button type="button" aria-label="Close part editor" onClick={closeEditor}>×</button>
            </header>
            {!catalog.paymentsReady ? (
              <div className="garage-part-payment-notice">
                <strong>Seller payments need setup</strong>
                <span>You can save a draft now. Complete Stripe seller setup before publishing.</span>
                <a href="/profile/edit#seller-payments">Set up payments</a>
              </div>
            ) : null}
            <fieldset>
              <legend>Part details</legend>
              <label className="is-wide">Title<input required minLength={5} maxLength={180} value={editor.title} onChange={field("title")} placeholder="Injen cold air intake with heat shield" /></label>
              <label>Category<select required value={editor.componentTypeId} onChange={(event) => {
                const component = catalog.components.find((item) => item.id === event.target.value);
                setEditor((current) => current ? {
                  ...current,
                  componentTypeId: event.target.value,
                  ...(component?.shippingRestriction === "LOCAL_PICKUP_ONLY" ? { shippingMode: "LOCAL_PICKUP", shippingCost: "" } : {}),
                } : current);
              }}><option value="">Select component</option>{catalog.components.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>Known brand<select value={editor.brandId} onChange={field("brandId")}><option value="">Other / unbranded</option>{catalog.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
              {!editor.brandId ? <label>Brand name<input required value={editor.brandName} onChange={field("brandName")} placeholder="Manufacturer or unbranded" /></label> : null}
              <label>Part number<input value={editor.manufacturerPartNumber} onChange={field("manufacturerPartNumber")} placeholder="Optional" /></label>
              <label>Condition<select value={editor.condition} onChange={field("condition")}><option value="NEW">New</option><option value="OPEN_BOX">Open box</option><option value="USED">Used</option><option value="REBUILT">Rebuilt</option><option value="FOR_PARTS">For parts</option></select></label>
              <label>Price (USD)<input required inputMode="decimal" value={editor.price} onChange={field("price")} placeholder="275.00" /></label>
              <label>Quantity<input required type="number" min="1" max="100" value={editor.quantity} onChange={field("quantity")} /></label>
              <label>Miles used<input type="number" min="0" value={editor.mileageOnPart} onChange={field("mileageOnPart")} placeholder="Optional" /></label>
              <label className="is-wide">Description<textarea required minLength={20} maxLength={5000} value={editor.description} onChange={field("description")} placeholder="Describe condition, history, and what buyers should know." /></label>
              <label className="is-wide">Included hardware<textarea value={editor.includedHardware} onChange={field("includedHardware")} placeholder="Clamps, brackets, wiring, original box..." /></label>
              <label className="is-wide">Known defects<textarea value={editor.knownDefects} onChange={field("knownDefects")} placeholder="Disclose scratches, missing pieces, repairs, or enter None." /></label>
            </fieldset>
            <fieldset>
              <legend>Vehicle fitment</legend>
              <label>Make<select required value={editor.makeId} onChange={(event) => { setModels([]); setEditor((current) => current ? { ...current, makeId: event.target.value, modelId: "" } : current); }}><option value="">Select make</option>{catalog.makes.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}</select></label>
              <label>Model<select required disabled={!editor.makeId} value={editor.modelId} onChange={field("modelId")}><option value="">Select model</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
              <label>Start year<input type="number" min="1886" max="2100" value={editor.yearStart} onChange={field("yearStart")} placeholder="Optional" /></label>
              <label>End year<input type="number" min="1886" max="2100" value={editor.yearEnd} onChange={field("yearEnd")} placeholder="Optional" /></label>
              <label>Trim<input value={editor.trim} onChange={field("trim")} placeholder="Type-S, GT, Base..." /></label>
              <label>Engine<input value={editor.engine} onChange={field("engine")} placeholder="K20A2, 4.0L V8..." /></label>
              <label>Transmission<input value={editor.transmission} onChange={field("transmission")} placeholder="6-speed manual" /></label>
              <label>Drivetrain<input value={editor.drivetrain} onChange={field("drivetrain")} placeholder="FWD, RWD, AWD" /></label>
            </fieldset>
            <fieldset>
              <legend>Delivery and returns</legend>
              {selectedComponent?.shippingRestriction === "LOCAL_PICKUP_ONLY" ? (
                <div className="garage-part-compliance-notice is-wide">
                  <strong>Local pickup required</strong>
                  <span>This component is shipping-sensitive and cannot use the standard shipping flow.</span>
                </div>
              ) : null}
              <label>Delivery<select value={editor.shippingMode} onChange={field("shippingMode")} disabled={selectedComponent?.shippingRestriction === "LOCAL_PICKUP_ONLY"}><option value="SHIPPING">Shipping</option><option value="LOCAL_PICKUP">Local pickup</option><option value="BOTH">Shipping or pickup</option></select></label>
              {editor.shippingMode !== "LOCAL_PICKUP" ? <label>Shipping cost<input required inputMode="decimal" value={editor.shippingCost} onChange={field("shippingCost")} placeholder="0 for free shipping" /></label> : null}
              {editor.shippingMode !== "SHIPPING" ? <><label>Pickup city<input required value={editor.shipsFromCity} onChange={field("shipsFromCity")} /></label><label>State<input required maxLength={2} value={editor.shipsFromState} onChange={field("shipsFromState")} placeholder="NC" /></label></> : null}
              <label>Returns<select value={editor.returnPolicy} onChange={field("returnPolicy")}><option value="NO_RETURNS">No returns</option><option value="RETURNS_ACCEPTED">Returns accepted</option></select></label>
            </fieldset>
            <label className="garage-part-seller-attestation">
              <input type="checkbox" checked={editor.sellerAttestationAccepted} onChange={(event) => setEditor((current) => current ? { ...current, sellerAttestationAccepted: event.target.checked } : current)} />
              <span>I confirm I own or am authorized to sell this part, the description and fitment are accurate, known defects are disclosed, and the item is lawful to sell and deliver. I agree to the <a href="/legal/terms" target="_blank" rel="noreferrer">seller terms</a>.</span>
            </label>
            <fieldset>
              <legend>Photos</legend>
              <label className="garage-part-photo-input is-wide">Upload photos<input type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 12))} /><span>JPG, PNG, HEIC, or HEIF. The first photo is the listing image.</span></label>
              <div className="garage-part-photo-grid is-wide">
                {editor.id ? listings.find((listing) => listing.id === editor.id)?.images.map((image) => <div key={image.id}><Image src={image.url} alt="" fill sizes="120px" unoptimized /><button type="button" aria-label="Remove photo" onClick={() => removeImage(editor.id!, image.id)}>×</button></div>) : null}
                {previewUrls.map((url) => <div key={url}><Image src={url} alt="New part preview" fill sizes="120px" unoptimized /></div>)}
              </div>
            </fieldset>
            {error ? <p className="garage-part-editor-error" role="alert">{error}</p> : null}
            <footer>
              <button type="button" onClick={closeEditor}>Cancel</button>
              <button type="submit" className="is-primary" disabled={isPending}>{isPending ? "Saving..." : "Save Draft"}</button>
            </footer>
          </form>
        </div>
      ) : null}
      {purchaseListing ? (
        <div className="garage-part-editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="part-purchase-title">
          <section className="garage-part-purchase-modal">
            <header>
              <div><span>Purchase Review</span><h2 id="part-purchase-title">{purchaseListing.title}</h2></div>
              <button type="button" aria-label="Close purchase review" onClick={() => setPurchaseListing(null)}>×</button>
            </header>
            <div className="garage-part-purchase-summary">
              <div className="garage-part-purchase-image">
                {purchaseListing.images[0] ? <Image src={purchaseListing.images[0].url} alt={purchaseListing.title} fill sizes="220px" unoptimized /> : <span>Photo pending</span>}
              </div>
              <div>
                <span>{purchaseListing.componentLabel}</span>
                <strong>{purchaseListing.brandName || "Unbranded"}</strong>
                <p>{purchaseListing.description}</p>
                <dl>
                  <div><dt>Condition</dt><dd>{formatLabel(purchaseListing.condition)}</dd></div>
                  <div><dt>Fitment</dt><dd>{formatFitment(purchaseListing)}</dd></div>
                  <div><dt>Part price</dt><dd>{formatCents(purchaseListing.priceCents)}</dd></div>
                  <div><dt>Shipping</dt><dd>{purchaseListing.shippingMode === "LOCAL_PICKUP" ? "Local pickup" : formatCents(purchaseListing.shippingCostCents || 0)}</dd></div>
                  <div className="is-total"><dt>Total</dt><dd>{formatCents(purchaseListing.priceCents + (purchaseListing.shippingMode === "LOCAL_PICKUP" ? 0 : purchaseListing.shippingCostCents || 0))}</dd></div>
                </dl>
              </div>
            </div>
            <label className="garage-part-purchase-terms">
              <input type="checkbox" checked={purchaseTermsAccepted} onChange={(event) => setPurchaseTermsAccepted(event.target.checked)} />
              <span>I agree to the <a href="/legal/terms" target="_blank" rel="noreferrer">Terms of Use</a> and understand this item is sold directly by the garage owner.</span>
            </label>
            {error ? <p className="garage-part-editor-error" role="alert">{error}</p> : null}
            <footer>
              <button type="button" onClick={() => setPurchaseListing(null)}>Cancel</button>
              <button type="button" className="is-primary" disabled={!purchaseTermsAccepted || checkoutPending} onClick={startCheckout}>{checkoutPending ? "Opening Checkout..." : "Continue to Secure Checkout"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );

  function field(key: keyof EditorState) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setEditor((current) => current ? { ...current, [key]: value } : current);
    };
  }

  function openEditor(listing: GaragePartListing | null) {
    setError("");
    setFiles([]);
    setEditor(listing ? editorFromListing(listing) : { ...emptyEditor });
  }

  function closeEditor() {
    if (isPending) return;
    setEditor(null);
    setFiles([]);
    setError("");
  }

  function submitListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setError("");
    startTransition(async () => {
      const result = await saveUserPartListingAction(editor.id, toListingInput(editor));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      for (const sourceFile of files) {
        try {
          const prepared = await prepareVehiclePhoto(sourceFile);
          const formData = new FormData();
          formData.set("file", prepared.file);
          const uploadResult = await uploadUserPartListingImageAction(result.listingId, formData);
          if (!uploadResult.ok) throw new Error(uploadResult.error);
        } catch (uploadError) {
          setError(uploadError instanceof Error ? uploadError.message : "Could not upload a photo.");
          router.refresh();
          return;
        }
      }
      closeEditor();
      router.refresh();
    });
  }

  function updateStatus(listingId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    startTransition(async () => {
      const result = await setUserPartListingStatusAction(listingId, status);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function confirmRemove(listingId: string) {
    if (!window.confirm("Remove this part listing? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await setUserPartListingStatusAction(listingId, "REMOVED");
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function removeImage(listingId: string, imageId: string) {
    startTransition(async () => {
      const result = await deleteUserPartListingImageAction(listingId, imageId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  async function startCheckout() {
    if (!purchaseListing || !purchaseTermsAccepted) return;
    setCheckoutPending(true);
    setError("");
    try {
      const response = await fetch("/api/payments/user-part-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: purchaseListing.id }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Secure Checkout could not be started.");
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Secure Checkout could not be started.");
      setCheckoutPending(false);
    }
  }
}

function editorFromListing(listing: GaragePartListing): EditorState {
  const fitment = listing.fitments[0];
  return {
    ...emptyEditor,
    id: listing.id,
    componentTypeId: listing.componentTypeId,
    brandId: listing.brandId || "",
    brandName: listing.brandName || "",
    manufacturerPartNumber: listing.manufacturerPartNumber || "",
    title: listing.title,
    description: listing.description,
    condition: listing.condition,
    price: (listing.priceCents / 100).toFixed(2),
    quantity: String(listing.quantity),
    mileageOnPart: listing.mileageOnPart === null ? "" : String(listing.mileageOnPart),
    includedHardware: listing.includedHardware || "",
    knownDefects: listing.knownDefects || "",
    shippingMode: listing.shippingMode,
    shippingCost: listing.shippingCostCents === null ? "" : (listing.shippingCostCents / 100).toFixed(2),
    shipsFromCity: listing.shipsFromCity || "",
    shipsFromState: listing.shipsFromState || "",
    returnPolicy: listing.returnPolicy,
    makeId: fitment?.makeId || "",
    modelId: fitment?.modelId || "",
    yearStart: fitment?.yearStart ? String(fitment.yearStart) : "",
    yearEnd: fitment?.yearEnd ? String(fitment.yearEnd) : "",
    trim: fitment?.trim || "",
    engine: fitment?.engine || "",
    transmission: fitment?.transmission || "",
    drivetrain: fitment?.drivetrain || "",
    bodyStyle: fitment?.bodyStyle || "",
    sellerAttestationAccepted: listing.sellerAttestationAccepted,
  };
}

function toListingInput(editor: EditorState) {
  const nullable = (value: string) => value.trim() || null;
  const cents = (value: string) => Math.round(Number(value) * 100);
  return {
    componentTypeId: editor.componentTypeId,
    brandId: nullable(editor.brandId),
    removedFromVehicleId: null,
    title: editor.title,
    description: editor.description,
    brandName: nullable(editor.brandName),
    manufacturerPartNumber: nullable(editor.manufacturerPartNumber),
    condition: editor.condition,
    priceCents: cents(editor.price),
    currency: "USD",
    quantity: Number(editor.quantity),
    mileageOnPart: editor.mileageOnPart ? Number(editor.mileageOnPart) : null,
    includedHardware: nullable(editor.includedHardware),
    knownDefects: nullable(editor.knownDefects),
    shippingMode: editor.shippingMode,
    shippingCostCents: editor.shippingMode === "LOCAL_PICKUP" ? null : cents(editor.shippingCost),
    shipsFromCity: nullable(editor.shipsFromCity),
    shipsFromState: nullable(editor.shipsFromState),
    returnPolicy: editor.returnPolicy,
    sellerAttestationAccepted: editor.sellerAttestationAccepted,
    universalFitment: false,
    fitments: [{
      makeId: editor.makeId,
      modelId: editor.modelId,
      modelVariantId: null,
      yearStart: editor.yearStart ? Number(editor.yearStart) : null,
      yearEnd: editor.yearEnd ? Number(editor.yearEnd) : null,
      trim: nullable(editor.trim),
      engine: nullable(editor.engine),
      transmission: nullable(editor.transmission),
      drivetrain: nullable(editor.drivetrain),
      bodyStyle: nullable(editor.bodyStyle),
    }],
  };
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFitment(listing: GaragePartListing) {
  if (listing.universalFitment) return "Universal";
  const fitment = listing.fitments[0];
  if (!fitment) return "Fitment pending";
  const years = fitment.yearStart || fitment.yearEnd
    ? `${fitment.yearStart || "Any"}${fitment.yearEnd && fitment.yearEnd !== fitment.yearStart ? `-${fitment.yearEnd}` : ""}`
    : "All years";
  return `${years} ${fitment.makeName} ${fitment.modelName}`;
}
