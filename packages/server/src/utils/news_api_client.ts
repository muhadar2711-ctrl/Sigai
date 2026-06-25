
import axios from 'axios';

export class NewsApiClient {
    private apiKey: string;
    private baseUrl = 'https://newsapi.org/v2/everything';

    constructor(apiKey: string | undefined) {
        if (!apiKey) {
            throw new Error("News API key is not defined");
        }
        this.apiKey = apiKey;
    }

    async hasHighImpactNews(symbol: string): Promise<boolean> {
        // This is a simplified mock. A real implementation would need to map
        // the symbol (e.g., 'XAU/USD') to relevant query terms (e.g., 'gold', 'USD').
        const query = this.getQueryForSymbol(symbol);
        if (!query) return false;

        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    q: query,
                    apiKey: this.apiKey,
                    sortBy: 'publishedAt',
                    language: 'en',
                    pageSize: 5
                }
            });

            // A real implementation would analyze headlines for impact words.
            // For now, we'll just check if any news is returned.
            return response.data.articles.length > 0;

        } catch (error) {
            console.error('Error fetching news:', error);
            // Fail-safe: don't block trading if the news service fails
            return false;
        }
    }

    private getQueryForSymbol(symbol: string): string | null {
        if (symbol.includes('USD')) return 'US dollar';
        if (symbol.includes('EUR')) return 'Euro';
        if (symbol.includes('XAU')) return 'gold';
        return null;
    }
}
