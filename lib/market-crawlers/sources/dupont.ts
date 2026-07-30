import { PublicPageSource } from "./public-page-source";

const DUPONT_MAKES = ["ferrari", "lamborghini", "mclaren"];
const DUPONT_PAGES = Array.from({ length: 15 }, (_, index) => index + 1);

export class DuPontRegistryCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "DuPont Registry",
      sourceType: "MARKETPLACE",
      urls: DUPONT_MAKES.flatMap((make) =>
        DUPONT_PAGES.map((page) =>
          page === 1
            ? `https://www.dupontregistry.com/autos/results/${make}`
            : `https://www.dupontregistry.com/autos/results/${make}?page=${page}`,
        ),
      ),
    });
  }
}
