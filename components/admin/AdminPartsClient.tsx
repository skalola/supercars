"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  addPartBrandAction,
  addPartCategoryAction,
  addPerformancePartAction,
  updateAffiliatePartnerAction,
  updatePerformancePartAffiliateAction,
} from "@/app/actions/admin-parts";
import type { MakeOption, ModelEditorOption } from "@/lib/makes/catalog";
import { fetchCatalogModels } from "@/lib/makes/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AdminPartCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  partCount: number;
};

export type AdminPartBrandRow = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  country: string | null;
  partCount: number;
};

export type AdminAffiliatePartnerRow = {
  id: string;
  name: string;
  status: string;
  network: string | null;
  websiteUrl: string | null;
  commissionLabel: string | null;
  trackingTemplate: string | null;
  disclosure: string | null;
  active: boolean;
  partCount: number;
};

export type AdminPerformancePartRow = {
  id: string;
  name: string;
  partNumber: string | null;
  status: string;
  sourceConfidence: string;
  trackingStatus: string;
  retailPrice: string;
  estimatedHpGain: string;
  estimatedTorqueGain: string;
  categoryName: string;
  brandName: string;
  affiliatePartnerId: string | null;
  affiliatePartnerName: string | null;
  affiliateUrl: string | null;
  commissionRateBps: number | null;
  affiliateReady: boolean;
  clickCount: number;
  sourceUrl: string | null;
  publicEligible: boolean;
  trustScore: number;
  trustIssues: string[];
  trustWarnings: string[];
  compatibility: string[];
  updatedAt: string;
};

export type AdminAffiliateAnalyticsRow = {
  label: string;
  detail: string;
  clicks: number;
  estimatedCommissionLabel: string;
};

export type AdminRecentAffiliateClickRow = {
  id: string;
  partName: string;
  brandName: string;
  categoryName: string;
  affiliatePartnerName: string | null;
  routeType: "affiliate" | "source" | "unknown";
  routeSource: string | null;
  sourcePath: string | null;
  outboundUrl: string;
  userLabel: string;
  clickedAt: string;
};

type AdminAffiliateAnalytics = {
  totalClicks: number;
  recentClickCount: number;
  affiliateClickCount: number;
  sourceClickCount: number;
  configuredParts: number;
  estimatedCommissionLabel: string;
  topParts: AdminAffiliateAnalyticsRow[];
  topBrands: AdminAffiliateAnalyticsRow[];
  recentClicks: AdminRecentAffiliateClickRow[];
};

type AdminPartsClientProps = {
  categories: AdminPartCategoryRow[];
  brands: AdminPartBrandRow[];
  affiliatePartners: AdminAffiliatePartnerRow[];
  parts: AdminPerformancePartRow[];
  catalogSummary: {
    totalParts: number;
    publicReadyParts: number;
    needsReviewParts: number;
  };
  activeFilters: {
    search: string;
    category: string;
    brand: string;
    status: string;
    trust: string;
  };
  affiliateAnalytics: AdminAffiliateAnalytics;
  makes: MakeOption[];
};

type PartFormState = {
  name: string;
  categoryId: string;
  brandId: string;
  partNumber: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  sourceName: string;
  status: string;
  sourceConfidence: string;
  retailPrice: string;
  retailerName: string;
  retailerSku: string;
  estimatedHpGain: string;
  estimatedTorqueGain: string;
  gainBasis: string;
  installComplexity: string;
  notes: string;
  makeId: string;
  modelId: string;
  yearStart: string;
  yearEnd: string;
  trim: string;
  engine: string;
};

type AffiliatePartFormState = {
  affiliatePartnerId: string;
  affiliateUrl: string;
  trackingStatus: string;
  commissionRateBps: string;
};

type AffiliatePartnerFormState = {
  partnerId: string;
  status: string;
  active: boolean;
  network: string;
  websiteUrl: string;
  commissionLabel: string;
  trackingTemplate: string;
  disclosure: string;
};

const emptyPartForm: PartFormState = {
  name: "",
  categoryId: "",
  brandId: "",
  partNumber: "",
  description: "",
  imageUrl: "",
  sourceUrl: "",
  sourceName: "",
  status: "MANUAL_REVIEW",
  sourceConfidence: "MANUAL_REVIEW",
  retailPrice: "",
  retailerName: "",
  retailerSku: "",
  estimatedHpGain: "",
  estimatedTorqueGain: "",
  gainBasis: "",
  installComplexity: "SHOP_RECOMMENDED",
  notes: "",
  makeId: "",
  modelId: "",
  yearStart: "",
  yearEnd: "",
  trim: "",
  engine: "",
};

export function AdminPartsClient({
  categories,
  brands,
  affiliatePartners,
  parts,
  catalogSummary,
  activeFilters,
  affiliateAnalytics,
  makes,
}: AdminPartsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeModal, setActiveModal] = useState<"category" | "brand" | "part" | "affiliatePart" | "affiliatePartners" | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandWebsite, setBrandWebsite] = useState("");
  const [brandCountry, setBrandCountry] = useState("");
  const [partForm, setPartForm] = useState<PartFormState>(emptyPartForm);
  const [selectedAffiliatePart, setSelectedAffiliatePart] = useState<AdminPerformancePartRow | null>(null);
  const [affiliatePartForm, setAffiliatePartForm] = useState<AffiliatePartFormState>({
    affiliatePartnerId: "",
    affiliateUrl: "",
    trackingStatus: "NOT_CONFIGURED",
    commissionRateBps: "",
  });
  const [affiliatePartnerForm, setAffiliatePartnerForm] = useState<AffiliatePartnerFormState>(() =>
    toAffiliatePartnerForm(affiliatePartners[0] ?? null)
  );
  const [searchQuery, setSearchQuery] = useState(activeFilters.search);
  const [filteredModels, setFilteredModels] = useState<ModelEditorOption[]>([]);
  const [modelLoadState, setModelLoadState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!partForm.makeId) return;

    const controller = new AbortController();
    fetchCatalogModels([partForm.makeId], controller.signal)
      .then((rows) => {
        setFilteredModels(rows);
        setModelLoadState("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFilteredModels([]);
        setModelLoadState("error");
      });

    return () => controller.abort();
  }, [partForm.makeId]);

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const updatePartForm = (field: keyof PartFormState, value: string) => {
    if (field === "makeId") {
      setFilteredModels([]);
      setModelLoadState(value ? "loading" : "idle");
    }
    setPartForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "makeId" ? { modelId: "" } : {}),
    }));
  };

  const saveCategory = () => {
    if (!categoryName.trim()) {
      setMessage({ type: "error", text: "Category name is required." });
      return;
    }

    startTransition(async () => {
      const result = await addPartCategoryAction({
        name: categoryName,
        description: categoryDescription,
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setCategoryName("");
        setCategoryDescription("");
        setActiveModal(null);
      }
    });
  };

  const saveBrand = () => {
    if (!brandName.trim()) {
      setMessage({ type: "error", text: "Brand name is required." });
      return;
    }

    startTransition(async () => {
      const result = await addPartBrandAction({
        name: brandName,
        websiteUrl: brandWebsite,
        country: brandCountry,
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setBrandName("");
        setBrandWebsite("");
        setBrandCountry("");
        setActiveModal(null);
      }
    });
  };

  const savePart = () => {
    if (!partForm.name.trim() || !partForm.categoryId || !partForm.brandId) {
      setMessage({ type: "error", text: "Part name, category, and brand are required." });
      return;
    }

    startTransition(async () => {
      const result = await addPerformancePartAction({
        ...partForm,
        retailPrice: toOptionalNumber(partForm.retailPrice),
        estimatedHpGain: toOptionalNumber(partForm.estimatedHpGain),
        estimatedTorqueGain: toOptionalNumber(partForm.estimatedTorqueGain),
        yearStart: toOptionalNumber(partForm.yearStart),
        yearEnd: toOptionalNumber(partForm.yearEnd),
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setPartForm(emptyPartForm);
        setActiveModal(null);
      }
    });
  };

  const openAffiliatePartModal = (part: AdminPerformancePartRow) => {
    setSelectedAffiliatePart(part);
    setAffiliatePartForm({
      affiliatePartnerId: part.affiliatePartnerId ?? "",
      affiliateUrl: part.affiliateUrl ?? "",
      trackingStatus: part.trackingStatus || "NOT_CONFIGURED",
      commissionRateBps: part.commissionRateBps === null ? "" : String(part.commissionRateBps),
    });
    setActiveModal("affiliatePart");
  };

  const openAffiliatePartnersModal = () => {
    setAffiliatePartnerForm(toAffiliatePartnerForm(affiliatePartners[0] ?? null));
    setActiveModal("affiliatePartners");
  };

  const updateAffiliatePartForm = (field: keyof AffiliatePartFormState, value: string) => {
    setAffiliatePartForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateAffiliatePartnerForm = (field: keyof AffiliatePartnerFormState, value: string | boolean) => {
    setAffiliatePartnerForm((prev) => ({ ...prev, [field]: value }));
  };

  const chooseAffiliatePartner = (partnerId: string) => {
    const partner = affiliatePartners.find((item) => item.id === partnerId) ?? null;
    setAffiliatePartnerForm(toAffiliatePartnerForm(partner));
  };

  const saveAffiliatePart = () => {
    if (!selectedAffiliatePart) return;

    startTransition(async () => {
      const result = await updatePerformancePartAffiliateAction({
        partId: selectedAffiliatePart.id,
        affiliatePartnerId: affiliatePartForm.affiliatePartnerId || null,
        affiliateUrl: affiliatePartForm.affiliateUrl,
        trackingStatus: affiliatePartForm.trackingStatus,
        commissionRateBps: toOptionalNumber(affiliatePartForm.commissionRateBps),
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setActiveModal(null);
        setSelectedAffiliatePart(null);
      }
    });
  };

  const saveAffiliatePartner = () => {
    if (!affiliatePartnerForm.partnerId) {
      setMessage({ type: "error", text: "Choose an affiliate partner." });
      return;
    }

    startTransition(async () => {
      const result = await updateAffiliatePartnerAction({
        partnerId: affiliatePartnerForm.partnerId,
        status: affiliatePartnerForm.status,
        active: affiliatePartnerForm.active,
        network: affiliatePartnerForm.network,
        websiteUrl: affiliatePartnerForm.websiteUrl,
        commissionLabel: affiliatePartnerForm.commissionLabel,
        trackingTemplate: affiliatePartnerForm.trackingTemplate,
        disclosure: affiliatePartnerForm.disclosure,
      });
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      if (result.success) {
        setActiveModal(null);
      }
    });
  };

  return (
    <section className="surface-panel admin-management-panel admin-parts-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Parts Catalog</p>
          <h2>Performance Parts Foundation</h2>
        </div>
        <div className="admin-parts-actions">
          <button type="button" className="admin-secondary-button" onClick={() => setActiveModal("category")}>
            Add Category
          </button>
          <button type="button" className="admin-secondary-button" onClick={() => setActiveModal("brand")}>
            Add Brand
          </button>
          <button type="button" className="admin-primary-button" onClick={() => setActiveModal("part")}>
            Add Part
          </button>
          <button type="button" className="admin-secondary-button" onClick={openAffiliatePartnersModal}>
            Affiliate Partners
          </button>
        </div>
      </div>

      <div className="admin-parts-kpi-grid" aria-label="Parts catalog summary">
        <SummaryCard label="Categories" value={categories.length.toLocaleString()} />
        <SummaryCard label="Brands" value={brands.length.toLocaleString()} />
        <SummaryCard label="Parts Captured" value={catalogSummary.totalParts.toLocaleString()} />
        <SummaryCard label="Public Ready" value={catalogSummary.publicReadyParts.toLocaleString()} />
        <SummaryCard label="Needs Review" value={catalogSummary.needsReviewParts.toLocaleString()} />
        <SummaryCard label="Affiliate Candidates" value={affiliatePartners.length.toLocaleString()} />
      </div>

      <div className="admin-parts-analytics-grid" aria-label="Affiliate click analytics">
        <SummaryCard label="Total Clicks" value={affiliateAnalytics.totalClicks.toLocaleString()} />
        <SummaryCard label="30 Day Clicks" value={affiliateAnalytics.recentClickCount.toLocaleString()} />
        <SummaryCard label="Affiliate Routed" value={affiliateAnalytics.affiliateClickCount.toLocaleString()} />
        <SummaryCard label="Source Routed" value={affiliateAnalytics.sourceClickCount.toLocaleString()} />
        <SummaryCard label="Configured Parts" value={affiliateAnalytics.configuredParts.toLocaleString()} />
        <SummaryCard label="Estimated Commission" value={affiliateAnalytics.estimatedCommissionLabel} />
      </div>

      <div className="admin-parts-affiliate-insights">
        <AffiliateInsightPanel title="Top Parts" rows={affiliateAnalytics.topParts} />
        <AffiliateInsightPanel title="Top Brands" rows={affiliateAnalytics.topBrands} />
        <div className="admin-affiliate-recent-panel">
          <div className="admin-affiliate-panel-heading">
            <p className="eyebrow">Recent Clicks</p>
            <h3>Outbound Activity</h3>
          </div>
          {affiliateAnalytics.recentClicks.length === 0 ? (
            <p className="admin-affiliate-empty">No affiliate clicks logged yet.</p>
          ) : (
            <div className="admin-affiliate-click-list">
              {affiliateAnalytics.recentClicks.slice(0, 8).map((click) => (
                <a key={click.id} href={click.outboundUrl} target="_blank" rel="noopener noreferrer">
                  <div className="admin-affiliate-click-title">
                    <strong>{click.partName}</strong>
                    <span className={`admin-affiliate-route-pill is-${click.routeType}`}>
                      {formatRouteType(click.routeType)}
                    </span>
                  </div>
                  <span>{click.brandName} · {click.categoryName}</span>
                  <em>{click.clickedAt} · {click.affiliatePartnerName ?? "No partner"} · {click.userLabel}</em>
                  {click.routeSource ? <small>{click.routeSource}</small> : null}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {message && <div className={`admin-action-message ${message.type}`}>{message.text}</div>}

      <form
        className="admin-filter-toolbar admin-parts-filter-toolbar"
        aria-label="Parts filters"
        onSubmit={(event) => {
          event.preventDefault();
          updateFilters({ q: searchQuery.trim() });
        }}
      >
        <label>
          <span>Search</span>
          <input
            type="search"
            placeholder="Part, brand, category, fitment"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Category</span>
          <select value={activeFilters.category} onChange={(event) => updateFilters({ category: event.target.value })}>
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Brand</span>
          <select value={activeFilters.brand} onChange={(event) => updateFilters({ brand: event.target.value })}>
            <option value="">All Brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.name}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={activeFilters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label>
          <span>Catalog Trust</span>
          <select value={activeFilters.trust} onChange={(event) => updateFilters({ trust: event.target.value })}>
            <option value="">All Trust States</option>
            <option value="PUBLIC_READY">Public Ready</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
        </label>
        <button type="submit">Search</button>
        <button type="button" onClick={() => { setSearchQuery(""); router.push(pathname); }}>
          Reset
        </button>
      </form>

      <div className="mobile-scroll admin-management-table-shell admin-parts-table-shell">
        <table className="admin-management-table admin-parts-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Category</th>
              <th>Brand</th>
              <th>Status</th>
              <th>Price</th>
              <th>Gain</th>
              <th>Compatibility</th>
              <th>Tracking</th>
              <th>Source</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-management-empty">
                  No performance parts match the selected filters.
                </td>
              </tr>
            ) : (
              parts.map((part) => (
                <tr key={part.id}>
                  <td data-label="Part">
                    <strong>{part.name}</strong>
                    {part.partNumber ? <span className="admin-listing-identifier">{part.partNumber}</span> : null}
                  </td>
                  <td data-label="Category">{part.categoryName}</td>
                  <td data-label="Brand">{part.brandName}</td>
                  <td data-label="Status">
                    <span className={`admin-status-pill ${part.status === "ACTIVE" ? "" : "is-muted"}`}>
                      {part.status}
                    </span>
                    <span className="admin-listing-identifier">{part.sourceConfidence}</span>
                    <span className={`admin-status-pill ${part.publicEligible ? "" : "is-muted"}`}>
                      {part.publicEligible ? "Public Ready" : "Needs Review"}
                    </span>
                    <span className="admin-listing-identifier">Trust {part.trustScore}/100</span>
                    {[...part.trustIssues, ...part.trustWarnings].length > 0 ? (
                      <span className="admin-parts-quality-list">
                        {[...part.trustIssues, ...part.trustWarnings].slice(0, 3).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Price">{part.retailPrice}</td>
                  <td data-label="Gain">
                    <span>{part.estimatedHpGain}</span>
                    <span className="admin-listing-identifier">{part.estimatedTorqueGain}</span>
                  </td>
                  <td data-label="Compatibility">
                    {part.compatibility.length > 0 ? (
                      part.compatibility.map((item) => (
                        <span key={item} className="admin-parts-fitment-pill">
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="admin-listing-identifier">Universal / unscoped</span>
                    )}
                  </td>
                  <td data-label="Tracking">
                    <span className={`admin-status-pill ${part.affiliateReady ? "" : "is-muted"}`}>
                      {part.affiliateReady ? "Ready" : part.trackingStatus}
                    </span>
                    <span className="admin-listing-identifier">
                      {part.affiliatePartnerName ?? "No partner"} · {part.clickCount.toLocaleString()} clicks
                    </span>
                    <button type="button" className="admin-inline-action-button" onClick={() => openAffiliatePartModal(part)}>
                      Configure
                    </button>
                  </td>
                  <td data-label="Source">
                    {part.sourceUrl ? (
                      <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Open source
                      </a>
                    ) : (
                      <span className="admin-listing-identifier">No source</span>
                    )}
                  </td>
                  <td data-label="Updated">{part.updatedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {activeModal === "category" && (
        <AdminModal title="Add Category" onClose={() => setActiveModal(null)}>
          <div className="admin-modal-grid">
            <label className="admin-modal-wide">
              Name
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Description
              <textarea
                className="admin-modal-textarea"
                value={categoryDescription}
                onChange={(event) => setCategoryDescription(event.target.value)}
              />
            </label>
          </div>
          <ModalActions disabled={isPending} onCancel={() => setActiveModal(null)} onSave={saveCategory} />
        </AdminModal>
      )}

      {activeModal === "brand" && (
        <AdminModal title="Add Brand" onClose={() => setActiveModal(null)}>
          <div className="admin-modal-grid">
            <label>
              Name
              <input value={brandName} onChange={(event) => setBrandName(event.target.value)} />
            </label>
            <label>
              Country
              <input value={brandCountry} onChange={(event) => setBrandCountry(event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Website
              <input value={brandWebsite} onChange={(event) => setBrandWebsite(event.target.value)} placeholder="https://..." />
            </label>
          </div>
          <ModalActions disabled={isPending} onCancel={() => setActiveModal(null)} onSave={saveBrand} />
        </AdminModal>
      )}

      {activeModal === "part" && (
        <AdminModal title="Add Performance Part" onClose={() => setActiveModal(null)} isWide>
          <div className="admin-modal-grid admin-parts-modal-grid">
            <label className="admin-modal-wide">
              Part Name
              <input value={partForm.name} onChange={(event) => updatePartForm("name", event.target.value)} />
            </label>
            <label>
              Category
              <select value={partForm.categoryId} onChange={(event) => updatePartForm("categoryId", event.target.value)}>
                <option value="">Choose Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Brand
              <select value={partForm.brandId} onChange={(event) => updatePartForm("brandId", event.target.value)}>
                <option value="">Choose Brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Part Number
              <input value={partForm.partNumber} onChange={(event) => updatePartForm("partNumber", event.target.value)} />
            </label>
            <label>
              Status
              <select value={partForm.status} onChange={(event) => updatePartForm("status", event.target.value)}>
                <option value="MANUAL_REVIEW">Manual Review</option>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              Source Confidence
              <select value={partForm.sourceConfidence} onChange={(event) => updatePartForm("sourceConfidence", event.target.value)}>
                <option value="MANUAL_REVIEW">Manual Review</option>
                <option value="SOURCE_VERIFIED">Source Verified</option>
                <option value="LOW_CONFIDENCE">Low Confidence</option>
              </select>
            </label>
            <label>
              Retail Price
              <input type="number" min="0" step="0.01" value={partForm.retailPrice} onChange={(event) => updatePartForm("retailPrice", event.target.value)} />
            </label>
            <label>
              HP Gain
              <input type="number" value={partForm.estimatedHpGain} onChange={(event) => updatePartForm("estimatedHpGain", event.target.value)} />
            </label>
            <label>
              Torque Gain
              <input type="number" value={partForm.estimatedTorqueGain} onChange={(event) => updatePartForm("estimatedTorqueGain", event.target.value)} />
            </label>
            <label>
              Install Complexity
              <select value={partForm.installComplexity} onChange={(event) => updatePartForm("installComplexity", event.target.value)}>
                <option value="SHOP_RECOMMENDED">Shop Recommended</option>
                <option value="DIY">DIY</option>
                <option value="PRO_ONLY">Pro Only</option>
              </select>
            </label>
            <label className="admin-modal-wide">
              Gain Basis
              <input value={partForm.gainBasis} onChange={(event) => updatePartForm("gainBasis", event.target.value)} placeholder="Dyno, manufacturer estimate, owner reported..." />
            </label>
            <label>
              Make Compatibility
              <select value={partForm.makeId} onChange={(event) => updatePartForm("makeId", event.target.value)}>
                <option value="">All / Unscoped</option>
                {makes.map((make) => (
                  <option key={make.id} value={make.id}>
                    {make.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model Compatibility
              <select
                value={partForm.modelId}
                onChange={(event) => updatePartForm("modelId", event.target.value)}
                disabled={!partForm.makeId || modelLoadState === "loading"}
              >
                <option value="">
                  {!partForm.makeId
                    ? "Choose make first"
                    : modelLoadState === "loading"
                      ? "Loading models..."
                      : modelLoadState === "error"
                        ? "Unable to load models"
                        : "All Models"}
                </option>
                {filteredModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year Start
              <input type="number" value={partForm.yearStart} onChange={(event) => updatePartForm("yearStart", event.target.value)} />
            </label>
            <label>
              Year End
              <input type="number" value={partForm.yearEnd} onChange={(event) => updatePartForm("yearEnd", event.target.value)} />
            </label>
            <label>
              Trim
              <input value={partForm.trim} onChange={(event) => updatePartForm("trim", event.target.value)} />
            </label>
            <label>
              Engine
              <input value={partForm.engine} onChange={(event) => updatePartForm("engine", event.target.value)} />
            </label>
            <label>
              Retailer Name
              <input value={partForm.retailerName} onChange={(event) => updatePartForm("retailerName", event.target.value)} />
            </label>
            <label>
              Retailer SKU
              <input value={partForm.retailerSku} onChange={(event) => updatePartForm("retailerSku", event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Source URL
              <input value={partForm.sourceUrl} onChange={(event) => updatePartForm("sourceUrl", event.target.value)} placeholder="Original manufacturer or retailer page" />
            </label>
            <label>
              Source Name
              <input value={partForm.sourceName} onChange={(event) => updatePartForm("sourceName", event.target.value)} />
            </label>
            <label>
              Image URL
              <input value={partForm.imageUrl} onChange={(event) => updatePartForm("imageUrl", event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Description
              <textarea className="admin-modal-textarea" value={partForm.description} onChange={(event) => updatePartForm("description", event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Notes
              <textarea className="admin-modal-textarea" value={partForm.notes} onChange={(event) => updatePartForm("notes", event.target.value)} />
            </label>
          </div>
          <ModalActions disabled={isPending} onCancel={() => setActiveModal(null)} onSave={savePart} />
        </AdminModal>
      )}

      {activeModal === "affiliatePart" && selectedAffiliatePart && (
        <AdminModal title="Configure Affiliate Tracking" onClose={() => setActiveModal(null)} isWide>
          <div className="admin-modal-grid admin-parts-modal-grid">
            <div className="admin-modal-wide admin-affiliate-context">
              <span>Part</span>
              <strong>{selectedAffiliatePart.name}</strong>
              <em>{selectedAffiliatePart.brandName} · {selectedAffiliatePart.categoryName}</em>
            </div>
            <label>
              Affiliate Partner
              <select
                value={affiliatePartForm.affiliatePartnerId}
                onChange={(event) => updateAffiliatePartForm("affiliatePartnerId", event.target.value)}
              >
                <option value="">No Partner</option>
                {affiliatePartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name} ({partner.active ? "Enabled" : partner.status})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tracking Status
              <select
                value={affiliatePartForm.trackingStatus}
                onChange={(event) => updateAffiliatePartForm("trackingStatus", event.target.value)}
              >
                <option value="NOT_CONFIGURED">Not Configured</option>
                <option value="NEEDS_REVIEW">Needs Review</option>
                <option value="CONFIGURED">Configured</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <label className="admin-modal-wide">
              Affiliate URL
              <input
                value={affiliatePartForm.affiliateUrl}
                onChange={(event) => updateAffiliatePartForm("affiliateUrl", event.target.value)}
                placeholder="https://approved-partner.example/product?tag=..."
              />
            </label>
            <label>
              Commission Rate (bps)
              <input
                type="number"
                min="0"
                max="10000"
                value={affiliatePartForm.commissionRateBps}
                onChange={(event) => updateAffiliatePartForm("commissionRateBps", event.target.value)}
                placeholder="500 = 5%"
              />
            </label>
          </div>
          <ModalActions disabled={isPending} onCancel={() => setActiveModal(null)} onSave={saveAffiliatePart} />
        </AdminModal>
      )}

      {activeModal === "affiliatePartners" && (
        <AdminModal title="Affiliate Partners" onClose={() => setActiveModal(null)} isWide>
          <div className="admin-modal-grid admin-parts-modal-grid">
            <label className="admin-modal-wide">
              Partner
              <select value={affiliatePartnerForm.partnerId} onChange={(event) => chooseAffiliatePartner(event.target.value)}>
                {affiliatePartners.length === 0 ? <option value="">No partners captured</option> : null}
                {affiliatePartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name} · {partner.partCount.toLocaleString()} parts
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={affiliatePartnerForm.status}
                onChange={(event) => updateAffiliatePartnerForm("status", event.target.value)}
              >
                <option value="CANDIDATE">Candidate</option>
                <option value="APPROVED">Approved</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
            <label className="admin-checkbox-field">
              <input
                type="checkbox"
                checked={affiliatePartnerForm.active}
                onChange={(event) => updateAffiliatePartnerForm("active", event.target.checked)}
              />
              Enable Partner
            </label>
            <label>
              Network
              <input value={affiliatePartnerForm.network} onChange={(event) => updateAffiliatePartnerForm("network", event.target.value)} />
            </label>
            <label>
              Website
              <input value={affiliatePartnerForm.websiteUrl} onChange={(event) => updateAffiliatePartnerForm("websiteUrl", event.target.value)} placeholder="https://..." />
            </label>
            <label className="admin-modal-wide">
              Commission Label
              <input value={affiliatePartnerForm.commissionLabel} onChange={(event) => updateAffiliatePartnerForm("commissionLabel", event.target.value)} placeholder="Example: Up to 5% commission" />
            </label>
            <label className="admin-modal-wide">
              Tracking Template
              <textarea className="admin-modal-textarea" value={affiliatePartnerForm.trackingTemplate} onChange={(event) => updateAffiliatePartnerForm("trackingTemplate", event.target.value)} />
            </label>
            <label className="admin-modal-wide">
              Disclosure
              <textarea className="admin-modal-textarea" value={affiliatePartnerForm.disclosure} onChange={(event) => updateAffiliatePartnerForm("disclosure", event.target.value)} />
            </label>
          </div>
          <ModalActions disabled={isPending || affiliatePartners.length === 0} onCancel={() => setActiveModal(null)} onSave={saveAffiliatePartner} />
        </AdminModal>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-parts-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AffiliateInsightPanel({ title, rows }: { title: string; rows: AdminAffiliateAnalyticsRow[] }) {
  return (
    <div className="admin-affiliate-insight-panel">
      <div className="admin-affiliate-panel-heading">
        <p className="eyebrow">Affiliate</p>
        <h3>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="admin-affiliate-empty">No clicks yet.</p>
      ) : (
        <div className="admin-affiliate-row-list">
          {rows.map((row) => (
            <div key={row.label}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
              <div>
                <strong>{row.clicks.toLocaleString()}</strong>
                <span>{row.estimatedCommissionLabel}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRouteType(routeType: AdminRecentAffiliateClickRow["routeType"]) {
  if (routeType === "affiliate") return "Affiliate";
  if (routeType === "source") return "Source";
  return "Unknown";
}

function AdminModal({
  title,
  children,
  onClose,
  isWide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  isWide?: boolean;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <div className={`admin-modal-panel ${isWide ? "admin-parts-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="admin-parts-modal-title">
        <div className="admin-modal-header">
          <div>
            <p className="eyebrow">Parts Catalog</p>
            <h2 id="admin-parts-modal-title">{title}</h2>
          </div>
          <button type="button" className="admin-secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  disabled,
  onCancel,
  onSave,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="admin-modal-actions">
      <button type="button" className="admin-secondary-button" onClick={onCancel} disabled={disabled}>
        Cancel
      </button>
      <button type="button" className="admin-primary-button" onClick={onSave} disabled={disabled}>
        {disabled ? "Saving" : "Save"}
      </button>
    </div>
  );
}

function toOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAffiliatePartnerForm(partner: AdminAffiliatePartnerRow | null): AffiliatePartnerFormState {
  return {
    partnerId: partner?.id ?? "",
    status: partner?.status ?? "CANDIDATE",
    active: partner?.active ?? false,
    network: partner?.network ?? "",
    websiteUrl: partner?.websiteUrl ?? "",
    commissionLabel: partner?.commissionLabel ?? "",
    trackingTemplate: partner?.trackingTemplate ?? "",
    disclosure: partner?.disclosure ?? "",
  };
}
