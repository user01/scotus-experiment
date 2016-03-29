/// <reference path="./typings/tsd.d.ts" />
/// <reference path="./markov.types.ts" />
"use strict";
var Chance = require('chance');
var R = require('ramda');
var markov_types_1 = require('./markov.types');
var commaNumber = function (n) {
    return String(Math.floor(n)).replace(/(.)(?=(\d{3})+$)/g, '$1,');
};
var generateJunk = function (chanceEngine) {
    if (chanceEngine === void 0) { chanceEngine = new Chance(150); }
    var chunkCount = chanceEngine.natural({ min: 1, max: 3 });
    var junk = R.pipe(R.range(0), R.map(function () { return generateJunkChunk(chanceEngine, chunkCount); }), R.addIndex(R.reduce)(function (accum, chunk, index) {
        var joiner = chanceEngine.pickone(index == chunkCount || index == 0 ? [''] : ['', '-']);
        return accum + joiner + chunk;
    }, ''))(chunkCount);
    return junk;
};
var generateJunkChunk = function (chanceEngine, sizeModifier) {
    if (chanceEngine === void 0) { chanceEngine = new Chance(10); }
    if (sizeModifier === void 0) { sizeModifier = 2; }
    var chunkType = chanceEngine.natural({ min: 1, max: (sizeModifier < 2 ? 2 : 4) });
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
};
var generateOpenerKey = function (depth) {
    return R.pipe(R.range(0), R.map(function () {
        return {
            t: markov_types_1.TokenType.Empty,
            w: '',
            e: false
        };
    }))(depth);
};
var pickFromKey = function (map, key, chanceEngine) {
    var options = map[key];
    var total = options['__total'];
    var pick = chanceEngine.natural({ min: 1, max: total });
    var pickedToken = R.pipe(R.keys, R.reduce(function (accum, val) {
        if (accum + options[val] >= pick) {
            var token = JSON.parse(val);
            return R.reduced([token, options[val] / total]);
        }
        return accum + options[val];
    }, 0))(options);
    // console.log('picked token: ', pickedToken);
    return pickedToken;
};
var grabTokenFromKey = function (tokenKeySet, map, chanceEngine) {
    var currentTokenKey = JSON.stringify(tokenKeySet);
    // console.log('grabbing with key ', currentTokenKey);
    var currentTokenSet = pickFromKey(map, currentTokenKey, chanceEngine);
    var newTokenSet = R.concat(R.tail(tokenKeySet), currentTokenSet[0]);
    return currentTokenSet[0].e ? [currentTokenSet] : R.prepend(currentTokenSet, grabTokenFromKey(newTokenSet, map, chanceEngine));
};
var renderToken = function (token, chanceEngine) {
    switch (token.t) {
        case markov_types_1.TokenType.Word:
            return token.w;
        case markov_types_1.TokenType.WordEnd:
            return token.w;
        case markov_types_1.TokenType.Number:
            var num = chanceEngine.natural({ min: 2, max: 99 }) * Math.pow(10, chanceEngine.natural({ min: 1, max: 3 }));
            return commaNumber(num);
        case markov_types_1.TokenType.Money:
            var numm = (chanceEngine.natural({ min: 2, max: 70 }) * Math.pow(10, chanceEngine.natural({ min: 1, max: 4 })));
            return '$' + commaNumber(numm);
        case markov_types_1.TokenType.Junk:
            return generateJunk(chanceEngine);
        default:
            break;
    }
    return token.w;
};
var generateStringFromTokens = function (tokenSet, chanceEngine) {
    var prob = R.reduce(function (accum, set) {
        return accum * set[1];
    }, 1)(tokenSet);
    var str = R.pipe(R.map(R.pipe(R.head, R.curry(renderToken)(R.__, chanceEngine))), R.join(' '))(tokenSet);
    return [str, prob];
};
exports.generateStringAndProbablityFromMap = function (map, seed) {
    if (seed === void 0) { seed = 100; }
    var openerKey = generateOpenerKey(map.depth - 1);
    var chance = new Chance(seed);
    // console.log(openerKey);
    // console.log(map);
    // const pick = pickFromKey(map, openerKey, chance);
    // console.log('picked ', pick);
    var tokenChain = grabTokenFromKey(openerKey, map.map, chance);
    return generateStringFromTokens(tokenChain, chance);
};
exports.teal = 90;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.generateStringAndProbablityFromMap;
//# sourceMappingURL=markov.tools.js.map