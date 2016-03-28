
/// <reference path="./typings/tsd.d.ts" />

const Promise = require('bluebird');
const path = require('path');
const dataRoot = path.join(__dirname, 'speeches');
const R = require('ramda');
const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
const Chance = require('chance');

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
const makeMarkovMap = (filename: string, data: Array<string>, depth: number = 3) => {
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

  return { map, depth, speaker: filename };
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
  const s = R.pipe(breakIntoSentences,
    R.map(R.curry(sentenceToTries)(depth)),
    R.unnest
  )(line);
  return s;
}

const commaNumber = (n: number) => {
  return String(Math.floor(n)).replace(/(.)(?=(\d{3})+$)/g, '$1,');
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


const generateOpenerKey = (depth: number) => {
  return R.pipe(
    R.range(0),
    R.map(() => {
      return {
        t: TokenType.Empty,
        w: '',
        e: false
      };
    })
  )(depth)
}
const pickFromKey = (map, key, chanceEngine): Token => {
  const options = map[key];
  // console.log(options);
  const total = options['__total'];
  const pick = chanceEngine.natural({ min: 1, max: total });
  const pickedToken =
    R.pipe(
      R.keys,
      R.reduce((accum, val) => {
        if (accum + options[val] >= pick) {
          return R.reduced(JSON.parse(val))
        }
        return accum + options[val];
      }, 0)
    )(options)

  return pickedToken;
}
const grabTokenFromKey = (tokenKeySet: Array<Token>, map, chanceEngine) => {
  const currenTokenKey = JSON.stringify(tokenKeySet);
  const currentToken = pickFromKey(map, currenTokenKey, chanceEngine);
  const newTokenSet = R.concat(R.tail(tokenKeySet), currentToken);
  return currentToken.e ? [currentToken] : R.prepend(currentToken, grabTokenFromKey(newTokenSet, map, chanceEngine));
}
const renderToken = (token: Token, chanceEngine): string => {
  switch (token.t) {
    case TokenType.Word:
      return token.w;
    case TokenType.WordEnd:
      return token.w;
    case TokenType.Number:
      const num = chanceEngine.natural({ min: 5, max: 6440 });
      return commaNumber(num);
    case TokenType.Money:
      const numm = (chanceEngine.natural({ min: 2, max: 70 }) * 100);
      return '$' + commaNumber(numm);
    case TokenType.Junk:
      return 'FIX THE JUNK ISSUE';
    default:
      break;
  }
  return token.w;
}
const generateStringFromTokens = (tokenSet: Array<Token>, chanceEngine) => {
  return R.pipe(
    R.map(R.curry(renderToken)(R.__, chanceEngine)),
    R.join(' ')
  )(tokenSet);
}
const generateFromMap = (map, seed: number = 100) => {
  const openerKey = generateOpenerKey(map.depth - 1);
  const chance = new Chance(seed);
  // console.log(openerKey);
  // console.log(map);

  // const pick = pickFromKey(map, openerKey, chance);
  // console.log('picked ', pick);
  const tokenChain = grabTokenFromKey(openerKey, map.map, chance);

  return generateStringFromTokens(tokenChain, chance);
}


// fs.readdirAsync(dataRoot)
//   .then(filterToJsonFiles)
//   .map(readJson, { concurrency: 6 })
//   .then((datas) => {
//     console.log(datas.length);
//   });



const test = 'Justice Kagan loves spiderman. I know that\'s a myth.';
// console.log(makeMarkovSetsFromLine(3, test));
// breakIntoSentences(test);
const testData = [test,
  'Iris pours her heart out. While the city is under attack.',
  'Iris writes on the page.',
  'Iris has a night on the city.'];

// console.log(makeMarkovMap('', testData));

const test2 = [
  'Barry writes on the 576 wall.',
  'Iris writes on the $590 page.',
  'Iris has a night on the city.'
];

const map = makeMarkovMap('', test2, 2);
// console.log();

// debugger;
// console.log(generateFromMap(map, (new Chance()).natural()));
console.log(generateFromMap(map, 1));
console.log(generateFromMap(map, 2));
console.log(generateFromMap(map, 3));
console.log(generateFromMap(map, 1));
