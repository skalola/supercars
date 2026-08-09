export type MeetEvent = {
  slug: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  city: string;
  state: string;
  type: string;
  status: "Open" | "Invite Only" | "Full";
  expectedCars: number;
  host: string;
  locationName: string;
  locationDetail: string;
  description: string;
  allowedMakes: string[];
  mapX: number;
  mapY: number;
  accent: "red" | "white";
  cars: Array<{
    name: string;
    owner: string;
    image: string;
  }>;
};

export const meetEvents: MeetEvent[] = [
  {
    slug: "charlotte-supercar-breakfast",
    title: "Charlotte Supercar Breakfast",
    dateLabel: "Aug 24",
    timeLabel: "8:30 AM",
    city: "Charlotte",
    state: "NC",
    type: "Cars & Coffee",
    status: "Open",
    expectedCars: 18,
    host: "SUPERCAR DASH Hosted",
    locationName: "South End Garage Row",
    locationDetail: "Exact bay shared after RSVP",
    description: "A low-key owner breakfast and morning roll-out built around verified garage profiles.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 69,
    mapY: 58,
    accent: "red",
    cars: [
      { name: "Ferrari 458 Italia", owner: "@redlineCLT", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Huracan", owner: "@southendcars", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren 720S", owner: "@carbonclub", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
  {
    slug: "miami-coastal-cruise",
    title: "Miami Coastal Cruise",
    dateLabel: "Aug 31",
    timeLabel: "7:00 AM",
    city: "Miami",
    state: "FL",
    type: "Private Drive",
    status: "Open",
    expectedCars: 24,
    host: "Miami Owners Circle",
    locationName: "Brickell Meet Point",
    locationDetail: "Route opens after RSVP",
    description: "Early coastal drive with photo stop, breakfast, and verified car roll call.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 77,
    mapY: 78,
    accent: "red",
    cars: [
      { name: "Ferrari F8 Tributo", owner: "@rosso305", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Revuelto", owner: "@v12miami", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren Artura", owner: "@hybridline", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
  {
    slug: "la-canyon-run",
    title: "Canyon Run",
    dateLabel: "Sep 7",
    timeLabel: "6:45 AM",
    city: "Los Angeles",
    state: "CA",
    type: "Drive",
    status: "Invite Only",
    expectedCars: 20,
    host: "West Coast Garage",
    locationName: "Malibu Staging Point",
    locationDetail: "Private route shared with approved cars",
    description: "Morning canyon session with a verified-car attendance list and post-drive gallery.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 16,
    mapY: 60,
    accent: "red",
    cars: [
      { name: "Ferrari 812 Superfast", owner: "@canyonv12", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Aventador SVJ", owner: "@svjwest", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren 765LT", owner: "@ltclub", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
  {
    slug: "atlanta-midtown-meet",
    title: "Midtown Meet",
    dateLabel: "Sep 14",
    timeLabel: "9:00 AM",
    city: "Atlanta",
    state: "GA",
    type: "Garage Night",
    status: "Open",
    expectedCars: 15,
    host: "Atlanta Supercar Society",
    locationName: "Midtown Private Deck",
    locationDetail: "Address shared after RSVP",
    description: "A city meet for owners who want a clean roll call, parking order, and car-led profiles.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 65,
    mapY: 64,
    accent: "white",
    cars: [
      { name: "Ferrari Roma", owner: "@atlrosso", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Urus Performante", owner: "@peachtreev8", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren GT", owner: "@grandtouratl", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
  {
    slug: "chicago-lakeside-drive",
    title: "Lakeside Drive",
    dateLabel: "Sep 21",
    timeLabel: "8:00 AM",
    city: "Chicago",
    state: "IL",
    type: "Drive",
    status: "Open",
    expectedCars: 22,
    host: "Great Lakes Owners",
    locationName: "North Shore Start",
    locationDetail: "Parking zone shared after RSVP",
    description: "Lakefront morning route with verified cars and owner activity logged back to the garage.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 58,
    mapY: 43,
    accent: "red",
    cars: [
      { name: "Ferrari 296 GTB", owner: "@lakeside296", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Huracan STO", owner: "@sto312", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren 750S", owner: "@midwest750", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
  {
    slug: "seattle-mountain-loop",
    title: "Mountain Loop",
    dateLabel: "Sep 28",
    timeLabel: "7:30 AM",
    city: "Seattle",
    state: "WA",
    type: "Private Drive",
    status: "Full",
    expectedCars: 12,
    host: "Pacific Northwest Garage",
    locationName: "Eastside Start",
    locationDetail: "Waitlist open",
    description: "Small-capacity mountain drive with curated attendance and post-event car photography.",
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    mapX: 12,
    mapY: 23,
    accent: "white",
    cars: [
      { name: "Ferrari SF90 Stradale", owner: "@pnwsf90", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Tecnica", owner: "@raincityv10", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren 600LT", owner: "@cascade600", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
  },
];

export function getMeetBySlug(slug: string) {
  return meetEvents.find((meet) => meet.slug === slug) ?? null;
}
