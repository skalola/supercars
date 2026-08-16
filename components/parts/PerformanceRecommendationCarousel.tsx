"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type UIEvent } from "react";

export type PartsRecommendationSummary = {
  title: string;
  summary: string;
  href?: string | null;
  limitingFactor?: string;
  expectedBenefit?: string;
  tradeoff?: string;
  confidence?: string;
  confidenceLevel?: string;
  supportingRequirements?: string[];
  warning?: string | null;
  missingDataDisclosure?: string | null;
};

type RecommendationSlide = {
  eyebrow: string;
  title: string;
  body: string;
  tone?: "warning" | "disclosure";
};

export function PerformanceRecommendationCarousel({ recommendation }: { recommendation: PartsRecommendationSummary }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = buildSlides(recommendation);

  function goToSlide(index: number) {
    const nextIndex = Math.min(Math.max(index, 0), slides.length - 1);
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior: "smooth" });
    setActiveIndex(nextIndex);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const viewport = event.currentTarget;
    if (!viewport.clientWidth) return;
    const nextIndex = Math.min(Math.round(viewport.scrollLeft / viewport.clientWidth), slides.length - 1);
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToSlide(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToSlide(activeIndex + 1);
    }
  }

  return (
    <aside className="parts-vehicle-recommendation-summary" aria-label="Performance recommendations">
      <div className="parts-recommendation-controls" aria-label="Recommendation controls">
        <button type="button" onClick={() => goToSlide(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Previous recommendation">&#8249;</button>
        <button type="button" onClick={() => goToSlide(activeIndex + 1)} disabled={activeIndex === slides.length - 1} aria-label="Next recommendation">&#8250;</button>
      </div>

      <div
        ref={viewportRef}
        className="parts-recommendation-viewport"
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Performance recommendation details"
      >
        {slides.map((slide, index) => (
          <article
            key={`${slide.eyebrow}-${index}`}
            className={`parts-recommendation-slide${slide.tone ? ` is-${slide.tone}` : ""}`}
            aria-label={`${index + 1} of ${slides.length}: ${slide.eyebrow}`}
          >
            <span>{slide.eyebrow}</span>
            <strong>{slide.title}</strong>
            <p>{slide.body}</p>
          </article>
        ))}
      </div>

      <div className="parts-recommendation-footer">
        <div className="parts-recommendation-dots" role="tablist" aria-label="Choose recommendation">
          {slides.map((slide, index) => (
            <button
              key={`${slide.eyebrow}-dot`}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              onClick={() => goToSlide(index)}
              aria-label={`Show ${slide.eyebrow.toLowerCase()}`}
              aria-selected={index === activeIndex}
              role="tab"
            />
          ))}
        </div>
        {recommendation.href ? <Link href={recommendation.href}>View Upgrade</Link> : null}
      </div>
    </aside>
  );
}

function buildSlides(recommendation: PartsRecommendationSummary): RecommendationSlide[] {
  const slides: RecommendationSlide[] = [
    {
      eyebrow: recommendation.limitingFactor ? `Limiting Factor · ${recommendation.limitingFactor}` : "Recommended Next",
      title: recommendation.title,
      body: recommendation.summary,
    },
  ];

  if (recommendation.expectedBenefit) {
    slides.push({
      eyebrow: "Expected Benefit",
      title: "What this improves",
      body: recommendation.expectedBenefit,
    });
  }

  if (recommendation.tradeoff || recommendation.warning) {
    slides.push({
      eyebrow: "Tradeoffs & Risk",
      title: recommendation.warning ? "Plan before installing" : "What to consider",
      body: [recommendation.tradeoff, recommendation.warning].filter(Boolean).join(" "),
      tone: "warning",
    });
  }

  if (recommendation.supportingRequirements?.length || recommendation.missingDataDisclosure) {
    slides.push({
      eyebrow: "Supporting Work",
      title: recommendation.supportingRequirements?.length ? "Complete the system" : "Data confidence",
      body: recommendation.supportingRequirements?.length
        ? `${recommendation.supportingRequirements.join(" · ")}${recommendation.missingDataDisclosure ? ` ${recommendation.missingDataDisclosure}` : ""}`
        : recommendation.missingDataDisclosure ?? "",
      tone: recommendation.missingDataDisclosure ? "disclosure" : undefined,
    });
  }

  return slides;
}
