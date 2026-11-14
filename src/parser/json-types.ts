export interface IntegerLexeme {
  source: string;
  value: number;
}

export interface RawJsonRuntime {
  rawJSON: (source: string) => unknown;
}
