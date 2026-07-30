import type { PublicInventorySource } from "../types";
import { AutoTraderCrawler } from "./autotrader";
import { BeverlyHillsCarClubCrawler } from "./beverly-hills-car-club";
import { CarsDotComCrawler } from "./cars";
import { CNCMotorsCrawler } from "./cnc-motors";
import { CuratedCrawler } from "./curated";
import { DuPontRegistryCrawler } from "./dupont";
import { DuPontSitemapCrawler } from "./dupont-sitemap";
import { EuropeanCollectiblesCrawler } from "./european-collectibles";
import { HemmingsCrawler } from "./hemmings";
import { HighYieldSpecialistCrawler } from "./high-yield-specialists";
import { MarshallGoldmanCrawler } from "./marshall-goldman";
import { SpecialistDealerCrawler } from "./specialist-dealers";
import { VelocityMotorcarsCrawler } from "./velocity-motorcars";

export function defaultInventorySources(): PublicInventorySource[] {
  return [
    new DuPontRegistryCrawler(),
    new DuPontSitemapCrawler(),
    new AutoTraderCrawler(),
    new CarsDotComCrawler(),
    new HemmingsCrawler(),
    new SpecialistDealerCrawler(),
    new CNCMotorsCrawler(),
    new MarshallGoldmanCrawler(),
    new CuratedCrawler(),
    new VelocityMotorcarsCrawler(),
    new BeverlyHillsCarClubCrawler(),
    new EuropeanCollectiblesCrawler(),
    new HighYieldSpecialistCrawler(),
  ];
}
