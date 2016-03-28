
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
  const match = /JUSTICE_KAGAN\.json$/;
  // const match = /JUSTICE.*\.json$/;
  // const match = /PERRY\.json$/;
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
const fakeEndings = ['Mr.', 'Ms.', 'Mrs.', 'Miss.'];
const isMoney = /^\$[\d,]+$/;
const isNumber = /^\d+$/;
const isJunkParan = /\(.+\)/;
const isAlpha = /[a-zA-Z]/;
const isNumeric = /[0-9]/;

const isJunk = (str): boolean => {
  //(d)(4) or 10b-5 or 77p(d)(4)
  if (isAlpha.test(str) && isNumeric.test(str)) return true;
  if (isJunkParan.test(str)) return true;
  return false;
}
const generateJunk = (chanceEngine = new Chance(150)) => {
  const chunkCount = chanceEngine.natural({ min: 1, max: 3 });
  console.log('count: ', chunkCount);
  const junk = R.pipe(
    R.range(0),
    R.map(() => generateJunkChunk(chanceEngine, chunkCount)),
    R.addIndex(R.reduce)((accum, chunk, index) => {
      const joiner = chanceEngine.pickone(index == chunkCount || index == 0 ? [''] : ['', '-'])
      return accum + joiner + chunk;
    }, '')
  )(chunkCount);
  return junk;
}
const generateJunkChunk = (chanceEngine = new Chance(10), sizeModifier: number = 2) => {
  const chunkType = chanceEngine.natural({ min: 1, max: (sizeModifier < 2 ? 2 : 4) });
  switch (chunkType) {
    case 1:
      return '(' + chanceEngine.natural({ min: 3, max: 19 }) + ')';
    case 2:
      return '(' + chanceEngine.character({ alpha: true, casing: 'lower' }) + ')';
    case 3:
      return '' + chanceEngine.natural({ min: 10, max: 161 });
    case 4:
    default:
      break;
  }
  return '' + chanceEngine.character({ alpha: true, casing: 'lower' });
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
    if (!isEnding.test(str)) {
      return false;
    }
    return !R.contains(str, fakeEndings);
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
      return generateJunk(chanceEngine);
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


const jsonPayloadIntoMarkovMap = (jsonData: { filename: string, data: Array<string> }) => {
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

const testMap = (map) => {

  console.log('');
  console.log('==========================================');
  console.log('==========================================');
  console.log('Name: ', map.speaker);

  console.log(generateFromMap(map, 1));
  console.log(generateFromMap(map, 2));
  console.log(generateFromMap(map, 3));
  console.log(generateFromMap(map, 4));
  console.log(generateFromMap(map, 5));
  console.log(generateFromMap(map, 6));
  console.log(generateFromMap(map, 1));

  return map;
}


// fs.readdirAsync(dataRoot)
//   .then(filterToJsonFiles)
//   .map(readJson, { concurrency: 6 })
//   .map(jsonPayloadIntoMarkovMap)
//   .map(testMap)
//   .then((datas) => {
//     console.log(datas.length);
//   });


console.log(generateJunk(new Chance(10)));
console.log(generateJunk(new Chance(110)));
console.log(generateJunk(new Chance(210)));
console.log(generateJunk(new Chance(510)));
console.log(generateJunk(new Chance(5310)));
console.log(generateJunk(new Chance(1510)));
console.log(generateJunk(new Chance(55510)));
console.log(generateJunk(new Chance(517670)));