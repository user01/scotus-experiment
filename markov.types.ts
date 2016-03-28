
/// <reference path="./typings/tsd.d.ts" />

export enum TokenType {
  Word, //think
  WordEnd, //standards.
  Empty, // non rendered. Nothing before this
  Number, //346
  Junk, //(d)(4) or 10b-5 or 77p(d)(4)
  Money //$75,000
}

export interface Token {
  t: TokenType;
  w: string;
  e: boolean;
}

export default TokenType;