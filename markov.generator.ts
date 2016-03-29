/// <reference path="./markov.types.ts" />

const R = require('ramda');
const Chance = require('chance');

import {Token, TokenType} from './markov.types';

const isEnding = /[\.!?]$/;
const fakeEndings = ['Mr.', 'Ms.', 'Mrs.', 'Miss.', 'St.', 'v.', 'vs.'];
const isMoney = /^\$[\d,]+$/;
const isNumber = /^[\d,]+$/;
const isJunkParan = /\(.+\)/;
const isAlpha = /[a-zA-Z]/;
const isNumeric = /[0-9]/;

const isEndingTest = (str: string) => {
  if (!isEnding.test(str)) {
    return false;
  }
  return !R.contains(str, fakeEndings);
}
const isJunk = (str): boolean => {
  //(d)(4) or 10b-5 or 77p(d)(4)
  if (isAlpha.test(str) && isNumeric.test(str)) return true;
  if (isJunkParan.test(str)) return true;
  return false;
}



// a chunk canNOT be an empty
const chunkToToken = (chunk: string, index: number, array: Array<string>): Token => {
  const forcedEnd = index == array.length - 1;

  if (isMoney.test(chunk)) {
    return {
      t: TokenType.Money,
      w: '',
      e: forcedEnd
    };
  }
  if (isNumber.test(chunk)) {
    return {
      t: TokenType.Number,
      w: '',
      e: forcedEnd
    };
  }
  if (isJunk(chunk)) {
    return {
      t: TokenType.Junk,
      w: '',
      e: forcedEnd
    };
  }

  const end = isEndingTest(chunk);
  return {
    t: end ? TokenType.WordEnd : TokenType.Word,
    w: chunk,
    e: forcedEnd || end
  }
}

const sentenceToTries = (depth: number, sentenceTokens: Array<Token>) => {

  const tokens = R.insertAll(0,
    R.map(() => {
      return {
        t: TokenType.Empty,
        w: '',
        e: false
      }
    })(R.range(0, depth - 1))
    , sentenceTokens);

  // generate tries (depth + 1 sets) of words
  const tries = R.aperture(depth, tokens);

  // filter invalid tries (1st word is an ender)
  const filteredTries = R.filter((tri: Array<Token>) => {
    //fails if any elem but the last is an ending
    return !R.pipe(
      R.dropLast(1),
      R.any(R.prop('e'))
    )(tri);
  }, tries);

  return filteredTries;
}

const buildSentences = (shardsLeft: Array<string>): Array<Array<Token>> => {
  if (shardsLeft.length < 1) return [];

  const indexOfNextBreak = R.findIndex(isEndingTest)(shardsLeft);

  var newSentenceOfTokens: Array<Token>;
  if (indexOfNextBreak > -1) {
    const sentencePair = R.splitAt(indexOfNextBreak + 1)(shardsLeft);
    newSentenceOfTokens = sentencePair[0].map(chunkToToken);
    return R.concat([newSentenceOfTokens], buildSentences(sentencePair[1]));
  }
  return [shardsLeft.map(chunkToToken)];
}

const breakIntoSentences = (line: string): Array<Array<Token>> => {
  // debugger;
  const shards = line.split(/\s+/);
  const sentences = buildSentences(shards);
  return sentences;
}

const makeMarkovSetsFromLine = (depth: number, line: string): Array<Token> => {
  const s = R.pipe(breakIntoSentences,
    R.map(R.curry(sentenceToTries)(depth)),
    R.unnest
  )(line);
  return s;
}
const makeMarkovMap = (speaker: string, data: Array<string>, depth: number = 3) => {
  const allTries = R.pipe(
    R.map(R.curry(makeMarkovSetsFromLine)(depth)),
    R.unnest
  )(data);

  const map = R.reduce((map, tri) => {
    const target = R.last(tri);
    // console.log(target);
    const targetKey = JSON.stringify(target);
    const previous = R.take(tri.length - 1, tri);
    const previousKey = JSON.stringify(previous);
    map[previousKey] = map[previousKey] ? map[previousKey] : {};
    map[previousKey][targetKey] = map[previousKey][targetKey] ? map[previousKey][targetKey] + 1 : 1;
    return map;
  }, {})(allTries);

  R.pipe(
    R.keys,
    R.forEach((key: string) => {
      const total = R.pipe(
        R.values,
        R.sum
      )(map[key]);
      map[key]['__total'] = total;
    })
  )(map);

  return { map, depth, speaker };
}
export const jsonPayloadIntoMarkovMap = (jsonData: { filename: string, data: Array<string> }) => {
  const name = R.pipe(
    R.split('.'),
    R.head,
    R.split('_'),
    R.map(R.pipe(
      R.toLower,
      (str) => (new Chance()).capitalize(str)
    )
    ),
    R.join(' ')
  )(jsonData.filename);
  return makeMarkovMap(name, jsonData.data);
}


export default jsonPayloadIntoMarkovMap;