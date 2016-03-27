
/// <reference path="./typings/tsd.d.ts" />

const Promise = require('bluebird');
const path = require('path');
const dataRoot = path.join(__dirname, 'speeches');
const R = require('ramda');
const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });

interface Tri {
  tokens: Array<string>
}

enum TokenType {
  Word, //think
  WordEnd, //standards.
  Empty, // non rendered. Nothing before this
  Number, //346
  Junk, //(d)(4) or 10b-5 or 77p(d)(4)
  Money //$75,000
}
interface Token {
  t: TokenType;
  w: string;
  e: boolean;
}

const filterToJsonFiles = (list) => {
  const match = /PERRY\.json$/;
  // const match = /.*\.json$/;
  return new Promise((resolve, reject) => {
    resolve(R.filter((item) => {
      return match.test(item);
    })(list));
  });
}
const readJson = (filename) => {
  return fs.readFileAsync(path.join(dataRoot, filename)).then((buffer) => {
    return Promise.resolve({ filename, data: JSON.parse(buffer.toString()) });
  })
};

const isEnding = /[\.!?]$/;
const isMoney = /^\$[\d,]+$/;
const isNumber = /^\d+$/;
const makeMarkovMap = (filename: string, data: Array<string>) => {

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
    }
  }

  const end = isEnding.test(chunk);
  return {
    t: end ? TokenType.WordEnd : TokenType.Word,
    w: chunk,
    e: forcedEnd || end
  }
}
const makeMarkovSetsFromLine = (depth: number, line: string): Array<Token> => {
  debugger;
  const s = R.pipe(breakIntoSentences,
    R.map(R.curry(sentenceToTries)(depth)),
    R.unnest
  )(line);
  return s;
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
    debugger;
    return !R.pipe(
      R.dropLast(1),
      R.any(R.prop('e'))
    )(tri);
  }, tries);

  return filteredTries;
}

const buildSentences = (shardsLeft: Array<string>): Array<Array<Token>> => {
  if (shardsLeft.length < 1) return [];

  const indexOfNextBreak = R.findIndex((str: string) => {
    return isEnding.test(str);
  })(shardsLeft);

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


// fs.readdirAsync(dataRoot)
//   .then(filterToJsonFiles)
//   .map(readJson, { concurrency: 6 })
//   .then((datas) => {
//     console.log(datas.length);
//   });



const test = 'Justice Kagan loves spiderman. I know that\'s a myth.';
console.log(makeMarkovSetsFromLine(3, test));
// breakIntoSentences(test);