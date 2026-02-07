export type TapeSourceFetchParams = {
  symbol: string;
  timeoutMs: number;
};

export type TapeSourcePrice = {
  name: string;
  symbol: string;
  price: number;
  ts: string;
};

export type TapeSourceHandler = (params: TapeSourceFetchParams) => Promise<TapeSourcePrice | null>;
