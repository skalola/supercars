import { PrismaClient } from "@prisma/client";
import { toPartSlug } from "@/lib/parts/slug";

const prisma = new PrismaClient();

type SourcePartSeed = {
  name: string;
  brandSlug: string;
  categorySlug: string;
  sourceName: string;
  sourceUrl: string;
  partNumber?: string;
  description: string;
  status?: "ACTIVE" | "MANUAL_REVIEW";
  estimatedHpGain?: number;
  estimatedTorqueGain?: number;
  gainBasis?: string;
  installComplexity?: "DIY" | "SHOP_RECOMMENDED" | "PRO_ONLY";
  compatibility: Array<{
    makeSlug: string;
    modelSlug?: string;
    yearStart?: number;
    yearEnd?: number;
    trim?: string;
    engine?: string;
    notes?: string;
  }>;
};

const REAL_PART_BATCH: SourcePartSeed[] = [
  {
    name: "Lamborghini Huracan Intake System",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/lamborghini-huracan/",
    partNumber: "EVE-HCN-CF-INT",
    description: "Carbon intake system for Lamborghini Huracan V10 models with sealed airflow housings and tune-aware MAF behavior.",
    status: "ACTIVE",
    estimatedHpGain: 12,
    gainBasis: "Source states 12-15 hp gain; stored conservatively at the low end.",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "huracan", yearStart: 2014, trim: "V10" },
      { makeSlug: "lamborghini", modelSlug: "hurac-n-lp-610-4", yearStart: 2014, trim: "LP 610-4" },
    ],
  },
  {
    name: "Slip-On Line Titanium Exhaust - Huracan",
    brandSlug: "akrapovic",
    categorySlug: "exhaust",
    sourceName: "Akrapovic",
    sourceUrl: "https://www.akrapovic.com/en/car/product/15981?brandId=24&modelId=861&yearId=4564",
    partNumber: "MTP-LA/TI/2",
    description: "Titanium slip-on exhaust system for Lamborghini Huracan fitments published by Akrapovic.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "huracan", yearStart: 2014, trim: "LP 580-2 / LP 610-4" },
      { makeSlug: "lamborghini", modelSlug: "hurac-n-lp-610-4", yearStart: 2014, trim: "LP 610-4" },
    ],
  },
  {
    name: "Slip-On Line Titanium Exhaust - Aventador",
    brandSlug: "akrapovic",
    categorySlug: "exhaust",
    sourceName: "Akrapovic",
    sourceUrl: "https://www.akrapovic.com/en/car/product/15512?brandId=24&modelId=694&yearId=4603",
    description: "Titanium slip-on exhaust system for Lamborghini Aventador LP 700-4 applications.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "aventador", yearStart: 2011, trim: "LP 700-4" },
      { makeSlug: "lamborghini", modelSlug: "aventador-lp-700-4", yearStart: 2011 },
    ],
  },
  {
    name: "Ferrari F12 Carbon Intake System",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/ferrari-f12-berlinetta/",
    partNumber: "EVE-F12-CF-INT",
    description: "Carbon intake system for Ferrari F12 Berlinetta with carbon airbox lids and high-flow panel filters.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "f12berlinetta", yearStart: 2012, yearEnd: 2017 },
    ],
  },
  {
    name: "Ferrari F12/812SF/812GTS Valved Exhaust",
    brandSlug: "capristo",
    categorySlug: "exhaust",
    sourceName: "Capristo Exhaust",
    sourceUrl: "https://capristoexhaust.com/collections/ferrari-f12",
    description: "Valved exhaust listing from Capristo for Ferrari F12 and 812-family applications.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "f12berlinetta", yearStart: 2012, yearEnd: 2017 },
      { makeSlug: "ferrari", modelSlug: "812-superfast", yearStart: 2017, trim: "812 Superfast / GTS" },
    ],
  },
  {
    name: "GR Supra Super Turbo Muffler Urban Matte Edition",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/pickup-car/gr_supra/index.html",
    partNumber: "31029-AT013",
    description: "HKS Super Turbo Muffler Urban Matte Edition for GR Supra RZ 3.0-liter B58 manual fitment.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, trim: "RZ 6MT", engine: "B58" },
    ],
  },
  {
    name: "GR Supra Dry Carbon Racing Suction",
    brandSlug: "hks",
    categorySlug: "intake",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/intake/db/21926",
    partNumber: "70028-AT001",
    description: "Dry carbon racing suction intake pipe for Toyota GR Supra 3.0-liter B58 applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, engine: "B58" },
    ],
  },
  {
    name: "GR Supra Power Editor Vehicle Specific Kit",
    brandSlug: "hks",
    categorySlug: "ecu-tuning",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/electronics/db/29932",
    partNumber: "42018-AT016",
    description: "Plug-in boost control and calibration device for Toyota GR Supra 3.0-liter B58 fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, engine: "B58" },
    ],
  },
  {
    name: "GT800 Full Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/13909",
    partNumber: "11003-AN012",
    description: "HKS GT800 full turbine kit for R35 GT-R applications using the VR38DETT platform.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "gt-r", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
      { makeSlug: "nissan", modelSlug: "gt-r-nismo", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
    ],
  },
  {
    name: "Street Advance Z Coilover Kit - Acura RSX",
    brandSlug: "tein",
    categorySlug: "suspension",
    sourceName: "TEIN USA",
    sourceUrl: "https://www.tein.com/srch/us_search.php?carmodel=&item=STREETADVANCEZ&maker=ACURA&modelyear=",
    description: "TEIN Street Advance Z coilover kit application for Acura RSX model years.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "acura", modelSlug: "rsx", yearStart: 2002, yearEnd: 2006 },
      { makeSlug: "acura", modelSlug: "rsx-type-s", yearStart: 2002, yearEnd: 2006 },
    ],
  },
  {
    name: "Flex Z Coilover Kit - Acura RSX",
    brandSlug: "tein",
    categorySlug: "suspension",
    sourceName: "TEIN USA",
    sourceUrl: "https://www.tein.com/srch/us_search.php?carmodel=RSX&genuine=0&item=FLEXZ&maker=ACURA&modelyear=2005-2006",
    description: "TEIN Flex Z coilover kit application for late Acura RSX fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "acura", modelSlug: "rsx", yearStart: 2005, yearEnd: 2006 },
      { makeSlug: "acura", modelSlug: "rsx-type-s", yearStart: 2005, yearEnd: 2006 },
    ],
  },
  {
    name: "Honda Civic FK8 Type R Carbon Intake",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/honda-civic-fk8-type-r/",
    partNumber: "EVE-FK8-CF-INT",
    description: "Eventuri carbon intake system for the FK8 Honda Civic Type R with sealed airbox, high-flow filter, and carbon Venturi stack.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r", yearStart: 2017, yearEnd: 2021, engine: "K20C" },
      { makeSlug: "honda", modelSlug: "civic-type-r-limited-edition-fk8", yearStart: 2021, yearEnd: 2021, engine: "K20C" },
    ],
  },
  {
    name: "Honda Civic FL5 Type R Carbon Intake",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/honda-civic-fl5-type-r/",
    partNumber: "EVE-FL5-CF-INT",
    description: "Eventuri carbon intake system for the FL5 Civic Type R with a sealed airbox designed to reduce heat soak.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "Honda FK8 Carbon Turbo Tube V3",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/honda-fk8-turbo-tube-v3/",
    description: "Eventuri carbon turbo tube for FK8 Civic Type R applications with enlarged volume for reduced turbo restriction.",
    status: "ACTIVE",
    estimatedHpGain: 9,
    estimatedTorqueGain: 9,
    gainBasis: "Source states 9 hp and 9 ft-lb peak gains.",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r", yearStart: 2017, yearEnd: 2021, engine: "K20C" },
      { makeSlug: "honda", modelSlug: "civic-type-r-limited-edition-fk8", yearStart: 2021, yearEnd: 2021, engine: "K20C" },
    ],
  },
  {
    name: "Honda FK2 Carbon Turbo Tube V3",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/honda-fk2-turbo-tube-v3/",
    description: "Eventuri carbon turbo tube for FK2 Civic Type R applications with revised airflow volume and MAF integration.",
    status: "ACTIVE",
    estimatedHpGain: 9,
    estimatedTorqueGain: 9,
    gainBasis: "Source states 9 hp and 9 ft-lb peak gains.",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fk2", yearStart: 2015, yearEnd: 2016, engine: "K20C" },
    ],
  },
  {
    name: "Porsche 991 GT3 RS Carbon Intake",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/porsche-991-gt3-rs/",
    description: "Eventuri carbon intake system for Porsche 991 GT3 RS applications using patented Venturi filter housings.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "porsche", modelSlug: "911-gt3-rs-991", yearStart: 2015, yearEnd: 2019 },
    ],
  },
  {
    name: "Toyota GR86 Carbon Intake",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/toyota-gr86/",
    description: "Eventuri carbon intake system for the Toyota GR86 platform with a carbon fiber intake path and high-flow filtration.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr86-rz", yearStart: 2022, engine: "FA24" },
    ],
  },
  {
    name: "Toyota GR Yaris Carbon Intake",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/toyota-gr-yaris/",
    description: "Eventuri intake system for GR Yaris turbo applications designed around low intake temperatures and higher flow rate.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-yaris-rz-high-performance", yearStart: 2020, engine: "G16E-GTS" },
    ],
  },
  {
    name: "Civic Type R FL5 Hi-Power Exhaust",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/muffler/db/33938",
    description: "HKS Hi-Power exhaust system for FL5 Civic Type R applications with reduced exhaust pressure versus stock.",
    status: "ACTIVE",
    estimatedHpGain: 5,
    estimatedTorqueGain: 6,
    gainBasis: "Source states maximum increase of 3.6 kW and torque increase up to 7.5 Nm; stored as rounded imperial estimates.",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "Civic Type R FL5 Power Editor",
    brandSlug: "hks",
    categorySlug: "ecu-tuning",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/electronics/db/33087",
    partNumber: "42018-AH013",
    description: "HKS Power Editor boost control kit for the FL5 Civic Type R with preset boost increase data and bypass connector.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "Civic Type R FL5 R Type Intercooler",
    brandSlug: "hks",
    categorySlug: "cooling",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/cooling/db/33737",
    partNumber: "13001-AH008",
    description: "HKS R Type intercooler kit for FL5 Civic Type R with increased core area for sustained cooling under boost.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "Civic Type R FL5 GT Sports Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/33968",
    description: "HKS GT Sports Turbine Kit for FL5 Civic Type R, designed to maintain boost at high RPM.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "Civic Type R FK8 Hipermax R Coilovers",
    brandSlug: "hks",
    categorySlug: "suspension",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/hipermax/db/31703",
    partNumber: "80310-AH003",
    description: "HKS Hipermax R coilover kit for FK8 Civic Type R applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r", yearStart: 2017, yearEnd: 2021, engine: "K20C" },
      { makeSlug: "honda", modelSlug: "civic-type-r-limited-edition-fk8", yearStart: 2021, yearEnd: 2021, engine: "K20C" },
    ],
  },
  {
    name: "Civic Type R FL5 Hipermax S Coilovers",
    brandSlug: "hks",
    categorySlug: "suspension",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/hipermax/db/33300",
    description: "HKS Hipermax S suspension kit for FL5 Civic Type R, built for street comfort and sporty control.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "honda", modelSlug: "civic-type-r-fl5", yearStart: 2023, engine: "K20C" },
    ],
  },
  {
    name: "BRZ Hi-Power Spec-L II Exhaust",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/muffler/db/33896",
    description: "HKS Hi-Power Spec-L II exhaust for Subaru BRZ ZN6/ZC6 applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "subaru", modelSlug: "brz", yearStart: 2012, yearEnd: 2020 },
      { makeSlug: "subaru", modelSlug: "brz-s", yearStart: 2012, yearEnd: 2020 },
    ],
  },
  {
    name: "GT-R R35 R Type Intercooler",
    brandSlug: "hks",
    categorySlug: "cooling",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/cooling/db/11267",
    partNumber: "13001-AN013",
    description: "HKS R Type intercooler kit for Nissan GT-R R35 with large-capacity core and carbon air guide.",
    status: "ACTIVE",
    estimatedHpGain: 12,
    gainBasis: "Source comparison shows 608.6 ps with HKS intercooler versus 596.3 ps stock.",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "gt-r", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
      { makeSlug: "nissan", modelSlug: "gt-r-nismo", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
    ],
  },
  {
    name: "GT-R R35 GT5565 BB Full Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/36404",
    description: "HKS GT5565 BB full turbine kit for high-power Nissan GT-R R35 configurations.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "gt-r", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
      { makeSlug: "nissan", modelSlug: "gt-r-nismo", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
    ],
  },
  {
    name: "GT-R R35 Turbine Suction Kit",
    brandSlug: "hks",
    categorySlug: "intake",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/36406",
    description: "HKS turbine suction kit for R35 GT-R turbo applications using D70 mm silicone hose and dual-layer wet filters.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "gt-r", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
      { makeSlug: "nissan", modelSlug: "gt-r-nismo", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
    ],
  },
  {
    name: "Ferrari 296 GTB Performance Exhaust Program",
    brandSlug: "novitec",
    categorySlug: "exhaust",
    sourceName: "NOVITEC",
    sourceUrl: "https://www.novitecgroup.com/en/brands/ferrari/296/296-gtb/",
    description: "NOVITEC Ferrari 296 GTB performance exhaust and sports catalyst program.",
    status: "ACTIVE",
    estimatedHpGain: 38,
    gainBasis: "Source states an additional 38 horsepower with turbo inlets, exhaust, and sports catalysts.",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "296-gtb", yearStart: 2022 },
      { makeSlug: "ferrari", modelSlug: "296-gtb-gts", yearStart: 2022 },
    ],
  },
  {
    name: "Ferrari F8 Tributo Performance Exhaust Program",
    brandSlug: "novitec",
    categorySlug: "exhaust",
    sourceName: "NOVITEC",
    sourceUrl: "https://www.novitecgroup.com/en/brands/ferrari/f8/f8-tributo/",
    description: "NOVITEC Ferrari F8 Tributo performance range including high-performance exhaust, suspension, wheels, and aerodynamic components.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "f8-tributo", yearStart: 2020 },
    ],
  },
  {
    name: "Lamborghini Revuelto Performance Exhaust Program",
    brandSlug: "novitec",
    categorySlug: "exhaust",
    sourceName: "NOVITEC",
    sourceUrl: "https://www.novitecgroup.com/en/brands/lamborghini/revuelto/",
    description: "NOVITEC Lamborghini Revuelto refinement program focused on V12 acoustic character, exhaust, stance, and carbon components.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "revuelto", yearStart: 2024 },
    ],
  },
  {
    name: "McLaren Artura High-Performance Exhaust Program",
    brandSlug: "novitec",
    categorySlug: "exhaust",
    sourceName: "NOVITEC",
    sourceUrl: "https://www.novitecgroup.com/en/brands/mclaren/artura/",
    description: "NOVITEC McLaren Artura high-performance exhaust program with optional Inconel construction.",
    status: "ACTIVE",
    estimatedHpGain: 35,
    gainBasis: "Source states about 26 kW / 35 hp added to the twin-turbo V6 internal-combustion engine.",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "mclaren", modelSlug: "artura", yearStart: 2023 },
    ],
  },
  {
    name: "McLaren 765LT Performance Exhaust Program",
    brandSlug: "novitec",
    categorySlug: "exhaust",
    sourceName: "NOVITEC",
    sourceUrl: "https://www.novitecgroup.com/en/brands/mclaren/765lt-2/765lt/",
    description: "NOVITEC McLaren 765LT performance exhaust, aero, wheels, and suspension range for the Longtail platform.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "mclaren", modelSlug: "765lt", yearStart: 2021 },
    ],
  },
  {
    name: "RX-7 FD3S Super Turbo Muffler",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/muffler/db/12776",
    partNumber: "31029-AZ001",
    description: "HKS Super Turbo Muffler for Mazda RX-7 FD3S 13B-REW applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "mazda", modelSlug: "rx-7", yearStart: 1991, yearEnd: 2002, engine: "13B-REW" },
      { makeSlug: "mazda", modelSlug: "rx-7-spirit-r-type-a-fd", yearStart: 1991, yearEnd: 2002, engine: "13B-REW" },
      { makeSlug: "mazda", modelSlug: "fini-rx-7-type-r-fd", yearStart: 1991, yearEnd: 2002, engine: "13B-REW" },
    ],
  },
  {
    name: "RX-7 FD3S Silent Hi-Power Exhaust",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/muffler/db/361",
    partNumber: "31019-AZ002",
    description: "HKS Silent Hi-Power exhaust for earlier Mazda RX-7 FD3S 13B-REW fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "mazda", modelSlug: "rx-7", yearStart: 1991, yearEnd: 1998, engine: "13B-REW" },
      { makeSlug: "mazda", modelSlug: "fini-rx-7-type-r-fd", yearStart: 1991, yearEnd: 1998, engine: "13B-REW" },
    ],
  },
  {
    name: "Lancer Evolution IX R Type Intercooler",
    brandSlug: "hks",
    categorySlug: "cooling",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/cooling/db/8926",
    description: "HKS R Type intercooler kit for Lancer Evolution IX with lightweight core and short piping layout.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-ix", yearStart: 2005, yearEnd: 2007, engine: "4G63" },
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-ix-mr-gsr", yearStart: 2005, yearEnd: 2007, engine: "4G63" },
    ],
  },
  {
    name: "Lancer Evolution X R Type Intercooler",
    brandSlug: "hks",
    categorySlug: "cooling",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/cooling/db/10306",
    description: "HKS R Type intercooler kit for Lancer Evolution X with larger low-pressure-loss core and 70 mm piping spec.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-final", yearStart: 2008, yearEnd: 2015, engine: "4B11T" },
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution", yearStart: 2008, yearEnd: 2015, engine: "4B11T" },
    ],
  },
  {
    name: "Lancer Evolution IX GT III Sports Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/20283",
    description: "HKS GT III Sports Turbine Kit for Lancer Evolution IX 4G63 high-power applications.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-ix", yearStart: 2005, yearEnd: 2007, engine: "4G63" },
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-ix-mr-gsr", yearStart: 2005, yearEnd: 2007, engine: "4G63" },
    ],
  },
  {
    name: "Lancer Evolution X GT II Sports Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/12540",
    description: "HKS GT II Sports Turbine Kit for Lancer Evolution X with ball-bearing stock replacement turbo design.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution-final", yearStart: 2008, yearEnd: 2015, engine: "4B11T" },
      { makeSlug: "mitsubishi", modelSlug: "lancer-evolution", yearStart: 2008, yearEnd: 2015, engine: "4B11T" },
    ],
  },
  {
    name: "WRX STI Hipermax R Coilovers",
    brandSlug: "hks",
    categorySlug: "suspension",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/hipermax/db/31700",
    description: "HKS Hipermax R suspension kit for Subaru Impreza WRX STI applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "subaru", modelSlug: "wrx-sti", yearStart: 2015, yearEnd: 2021, engine: "EJ25" },
      { makeSlug: "subaru", modelSlug: "impreza-wrx-sti", yearStart: 2000, yearEnd: 2014, engine: "EJ20 / EJ25" },
    ],
  },
  {
    name: "WRX STI Hipermax S Coilovers",
    brandSlug: "hks",
    categorySlug: "suspension",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/hipermax/db/31689",
    description: "HKS Hipermax S suspension kit for Subaru WRX STI street and sports use.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "subaru", modelSlug: "wrx-sti", yearStart: 2015, yearEnd: 2021, engine: "EJ25" },
    ],
  },
  {
    name: "Silvia S15 Super Turbo Muffler",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/muffler/db/13177",
    partNumber: "31029-AN004",
    description: "HKS Super Turbo Muffler for Nissan Silvia S15 SR20DET fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "silvia-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
      { makeSlug: "nissan", modelSlug: "silvia-spec-r-aero-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
    ],
  },
  {
    name: "Silvia S15 Racing Suction Intake",
    brandSlug: "hks",
    categorySlug: "intake",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/intake/db/18106",
    partNumber: "70020-AN101",
    description: "HKS Racing Suction intake for Nissan Silvia S15 SR20DET applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "silvia-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
      { makeSlug: "nissan", modelSlug: "silvia-spec-r-aero-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
    ],
  },
  {
    name: "Silvia S15 GT III Sports Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/17757",
    partNumber: "11004-AN013",
    description: "HKS GT III Sports Turbine Kit for Nissan Silvia S15 and S14 SR20DET platforms.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "silvia-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
      { makeSlug: "nissan", modelSlug: "silvia-spec-r-aero-s15", yearStart: 1999, yearEnd: 2002, engine: "SR20DET" },
      { makeSlug: "nissan", modelSlug: "silvia-s14", yearStart: 1993, yearEnd: 1998, engine: "SR20DET" },
    ],
  },
  {
    name: "Silvia S15 Hipermax R Coilovers",
    brandSlug: "hks",
    categorySlug: "suspension",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/hipermax/db/31707",
    description: "HKS Hipermax R coilover kit for Nissan Silvia S15 chassis applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "silvia-s15", yearStart: 1999, yearEnd: 2002 },
      { makeSlug: "nissan", modelSlug: "silvia-spec-r-aero-s15", yearStart: 1999, yearEnd: 2002 },
    ],
  },
];

async function main() {
  const createdOrUpdated: string[] = [];
  const missingCompatibility: string[] = [];

  for (const seed of REAL_PART_BATCH) {
    const [category, brand] = await Promise.all([
      prisma.partCategory.findUnique({ where: { slug: seed.categorySlug } }),
      prisma.partBrand.findUnique({ where: { slug: seed.brandSlug } }),
    ]);

    if (!category) throw new Error(`Missing part category: ${seed.categorySlug}`);
    if (!brand) throw new Error(`Missing part brand: ${seed.brandSlug}`);

    const part = await prisma.performancePart.upsert({
      where: {
        brandId_slug: {
          brandId: brand.id,
          slug: toPartSlug(seed.name),
        },
      },
      update: {
        categoryId: category.id,
        name: seed.name,
        partNumber: seed.partNumber ?? null,
        description: seed.description,
        sourceUrl: seed.sourceUrl,
        sourceName: seed.sourceName,
        sourceConfidence: "SOURCE_VERIFIED",
        status: seed.status ?? "ACTIVE",
        estimatedHpGain: seed.estimatedHpGain ?? null,
        estimatedTorqueGain: seed.estimatedTorqueGain ?? null,
        gainBasis: seed.gainBasis ?? null,
        installComplexity: seed.installComplexity ?? "SHOP_RECOMMENDED",
        trackingStatus: "NOT_CONFIGURED",
      },
      create: {
        categoryId: category.id,
        brandId: brand.id,
        name: seed.name,
        slug: toPartSlug(seed.name),
        partNumber: seed.partNumber ?? null,
        description: seed.description,
        sourceUrl: seed.sourceUrl,
        sourceName: seed.sourceName,
        sourceConfidence: "SOURCE_VERIFIED",
        status: seed.status ?? "ACTIVE",
        estimatedHpGain: seed.estimatedHpGain ?? null,
        estimatedTorqueGain: seed.estimatedTorqueGain ?? null,
        gainBasis: seed.gainBasis ?? null,
        installComplexity: seed.installComplexity ?? "SHOP_RECOMMENDED",
        trackingStatus: "NOT_CONFIGURED",
      },
    });

    for (const fitment of seed.compatibility) {
      const make = await prisma.make.findUnique({ where: { slug: fitment.makeSlug } });
      if (!make) {
        missingCompatibility.push(`${seed.name}: missing make ${fitment.makeSlug}`);
        continue;
      }

      const model = fitment.modelSlug
        ? await prisma.model.findUnique({
            where: {
              makeId_slug: {
                makeId: make.id,
                slug: fitment.modelSlug,
              },
            },
          })
        : null;

      if (fitment.modelSlug && !model) {
        missingCompatibility.push(`${seed.name}: missing model ${fitment.makeSlug}/${fitment.modelSlug}`);
        continue;
      }

      const compatibilityScope = {
        partId: part.id,
        makeId: make.id,
        modelId: model?.id ?? null,
        yearStart: fitment.yearStart ?? null,
        yearEnd: fitment.yearEnd ?? null,
        trim: fitment.trim ?? null,
        engine: fitment.engine ?? null,
      };

      const existingCompatibility = await prisma.partCompatibility.findFirst({
        where: compatibilityScope,
        select: { id: true },
      });

      if (existingCompatibility) {
        await prisma.partCompatibility.update({
          where: { id: existingCompatibility.id },
          data: {
            notes: fitment.notes ?? null,
            confidence: "SOURCE_VERIFIED",
          },
        });
      } else {
        await prisma.partCompatibility.create({
          data: {
            ...compatibilityScope,
            notes: fitment.notes ?? null,
            confidence: "SOURCE_VERIFIED",
          },
        });
      }
    }

    createdOrUpdated.push(`${brand.name} ${seed.name}`);
  }

  const [activeParts, sourceVerifiedParts, compatibilityRows] = await Promise.all([
    prisma.performancePart.count({ where: { status: "ACTIVE" } }),
    prisma.performancePart.count({ where: { sourceConfidence: "SOURCE_VERIFIED" } }),
    prisma.partCompatibility.count({ where: { confidence: "SOURCE_VERIFIED" } }),
  ]);

  console.log(JSON.stringify({
    imported: createdOrUpdated.length,
    activeParts,
    sourceVerifiedParts,
    sourceVerifiedCompatibilityRows: compatibilityRows,
    missingCompatibility,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
