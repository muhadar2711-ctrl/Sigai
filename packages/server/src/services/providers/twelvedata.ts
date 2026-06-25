export class TwelveData {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getQuotes(symbol: string, interval: string, outputsize: number): Promise<any> {
    // Implement the actual API call logic here
    console.log(`Fetching quotes for ${symbol}`)
    return Promise.resolve([]);
  }
}
