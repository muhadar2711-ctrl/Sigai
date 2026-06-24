import * as MetaApiSDK from 'metaapi.cloud-sdk';

export class MetaApiBridge {
  private api: any = null;
  private connection: any = null;
  private accountId: string;
  private token: string;

  constructor() {
    this.token = process.env.META_API_TOKEN || "";
    this.accountId = process.env.META_API_ACCOUNT_ID || "";

    if (this.token && this.accountId) {
      // Use the default export from the imported module
      this.api = new (MetaApiSDK as any).default(this.token);
    }
  }

  public async connect(): Promise<void> {
    if (!this.api || !this.accountId) {
      console.warn("[METAAPI] Token or Account ID missing. Cannot connect.");
      return;
    }

    try {
      const account = await this.api.metatraderAccountApi.getAccount(
        this.accountId,
      );

      if (account.state !== "DEPLOYED") {
        console.log(
          `[METAAPI] Account state is ${account.state}, deploying...`,
        );
        await account.deploy();
      }

      await account.waitConnected();

      this.connection = account.getRPCConnection();
      await this.connection.connect();
      await this.connection.waitSynchronized();
      console.log(
        `[METAAPI] Successfully connected and synchronized to account ${this.accountId}`,
      );
    } catch (e: any) {
      console.error("[METAAPI] Connection Error:", e.message);
      throw e;
    }
  }

  public async executeTrade(
    symbol: string,
    action: "BUY" | "SELL" | "CLOSE",
    volume: number,
    sl: number,
    tp: number,
  ): Promise<any> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      throw new Error("MetaApi connection not available.");
    }

    if (action === "CLOSE") {
      throw new Error(
        "Generic CLOSE not implemented natively yet. Use specific positionId close.",
      );
    }

    try {
      let result;
      if (action === "BUY") {
        result = await this.connection.createMarketBuyOrder(
          symbol,
          volume,
          sl,
          tp,
        );
      } else if (action === "SELL") {
        result = await this.connection.createMarketSellOrder(
          symbol,
          volume,
          sl,
          tp,
        );
      }
      return result;
    } catch (e: any) {
      console.error("[METAAPI] Trade Execution Error:", e.message);
      throw e;
    }
  }

  public async getPositions(): Promise<any[]> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      return [];
    }

    try {
      const positions = await this.connection.getPositions();
      return positions;
    } catch (e: any) {
      console.error("[METAAPI] Get Positions Error:", e.message);
      return [];
    }
  }

  public async getAccountInformation(): Promise<any> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      throw new Error("MetaApi connection not available.");
    }

    try {
      const accountInfo = await this.connection.getAccountInformation();
      return accountInfo;
    } catch (e: any) {
      console.error("[METAAPI] Account Info Error:", e.message);
      throw e;
    }
  }
}

export const metaApiBridge = new MetaApiBridge();
