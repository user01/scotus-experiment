
/// <reference path="./typings/tsd.d.ts" />
/// <reference path="./markov.types.ts" />

const Chance = require('chance');
const R = require('ramda');
import {Token, TokenType} from './markov.types';


const commaNumber = (n: number) => {
  return String(Math.floor(n)).replace(/(.)(?=(\d{3})+$)/g, '$1,');
}

const generateJunk = (chanceEngine = new Chance(150)) => {
  const chunkCount = chanceEngine.natural({ min: 1, max: 3 });
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
      const num = chanceEngine.natural({ min: 2, max: 99 }) * Math.pow(10, chanceEngine.natural({ min: 1, max: 3 }));
      return commaNumber(num);
    case TokenType.Money:
      const numm = (chanceEngine.natural({ min: 2, max: 70 }) * Math.pow(10, chanceEngine.natural({ min: 1, max: 4 })));
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


export const generateFromMap = (map, seed: number = 100) => {
  const openerKey = generateOpenerKey(map.depth - 1);
  const chance = new Chance(seed);
  // console.log(openerKey);
  // console.log(map);

  // const pick = pickFromKey(map, openerKey, chance);
  // console.log('picked ', pick);
  const tokenChain = grabTokenFromKey(openerKey, map.map, chance);

  return generateStringFromTokens(tokenChain, chance);
}

export default generateFromMap;