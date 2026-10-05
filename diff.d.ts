declare module "diff" {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export function diffWords(
    oldStr: string,
    newStr: string,
    options?: any
  ): Change[];

  export function diffLines(
    oldStr: string,
    newStr: string,
    options?: any
  ): Change[];
}
