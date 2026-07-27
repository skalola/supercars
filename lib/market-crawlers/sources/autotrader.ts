import { PublicPageSource } from "./public-page-source";

export class AutoTraderCrawler extends PublicPageSource {
  constructor() {
    super({
      sourceName: "AutoTrader",
      sourceType: "MARKETPLACE",
      urls: [
        "https://www.autotrader.com/cars-for-sale/ferrari",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=25",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=50",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=75",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=100",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=125",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=150",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=175",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=200",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=225",
        "https://www.autotrader.com/cars-for-sale/ferrari?firstRecord=250",
        "https://www.autotrader.com/cars-for-sale/lamborghini",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=25",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=50",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=75",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=100",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=125",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=150",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=175",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=200",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=225",
        "https://www.autotrader.com/cars-for-sale/lamborghini?firstRecord=250",
      ],
    });
  }
}
