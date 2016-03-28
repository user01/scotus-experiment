/// <reference path="./typings/tsd.d.ts" />
var Promise = require('bluebird');
var path = require('path');
var dataRoot = path.join(__dirname, 'speeches');
var R = require('ramda');
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
var Chance = require('chance');
var TokenType;
(function (TokenType) {
    TokenType[TokenType["Word"] = 0] = "Word";
    TokenType[TokenType["WordEnd"] = 1] = "WordEnd";
    TokenType[TokenType["Empty"] = 2] = "Empty";
    TokenType[TokenType["Number"] = 3] = "Number";
    TokenType[TokenType["Junk"] = 4] = "Junk";
    TokenType[TokenType["Money"] = 5] = "Money"; //$75,000
})(TokenType || (TokenType = {}));
var filterToJsonFiles = function (list) {
    var match = /PERRY\.json$/;
    // const match = /.*\.json$/;
    return new Promise(function (resolve, reject) {
        resolve(R.filter(function (item) {
            return match.test(item);
        })(list));
    });
};
var readJson = function (filename) {
    return fs.readFileAsync(path.join(dataRoot, filename)).then(function (buffer) {
        return Promise.resolve({ filename: filename, data: JSON.parse(buffer.toString()) });
    });
};
var isEnding = /[\.!?]$/;
var isMoney = /^\$[\d,]+$/;
var isNumber = /^\d+$/;
var makeMarkovMap = function (filename, data, depth) {
    if (depth === void 0) { depth = 3; }
    var allTries = R.pipe(R.map(R.curry(makeMarkovSetsFromLine)(depth)), R.unnest)(data);
    var map = R.reduce(function (map, tri) {
        var target = R.last(tri);
        // console.log(target);
        var targetKey = JSON.stringify(target);
        var previous = R.take(tri.length - 1, tri);
        var previousKey = JSON.stringify(previous);
        map[previousKey] = map[previousKey] ? map[previousKey] : {};
        map[previousKey][targetKey] = map[previousKey][targetKey] ? map[previousKey][targetKey] + 1 : 1;
        return map;
    }, {})(allTries);
    R.pipe(R.keys, R.forEach(function (key) {
        var total = R.pipe(R.values, R.sum)(map[key]);
        map[key]['__total'] = total;
    }))(map);
    return { map: map, depth: depth, speaker: filename };
};
// a chunk canNOT be an empty
var chunkToToken = function (chunk, index, array) {
    var forcedEnd = index == array.length - 1;
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
    var end = isEnding.test(chunk);
    return {
        t: end ? TokenType.WordEnd : TokenType.Word,
        w: chunk,
        e: forcedEnd || end
    };
};
var makeMarkovSetsFromLine = function (depth, line) {
    var s = R.pipe(breakIntoSentences, R.map(R.curry(sentenceToTries)(depth)), R.unnest)(line);
    return s;
};
var commaNumber = function (n) {
    return String(Math.floor(n)).replace(/(.)(?=(\d{3})+$)/g, '$1,');
};
var sentenceToTries = function (depth, sentenceTokens) {
    var tokens = R.insertAll(0, R.map(function () {
        return {
            t: TokenType.Empty,
            w: '',
            e: false
        };
    })(R.range(0, depth - 1)), sentenceTokens);
    // generate tries (depth + 1 sets) of words
    var tries = R.aperture(depth, tokens);
    // filter invalid tries (1st word is an ender)
    var filteredTries = R.filter(function (tri) {
        //fails if any elem but the last is an ending
        return !R.pipe(R.dropLast(1), R.any(R.prop('e')))(tri);
    }, tries);
    return filteredTries;
};
var buildSentences = function (shardsLeft) {
    if (shardsLeft.length < 1)
        return [];
    var indexOfNextBreak = R.findIndex(function (str) {
        return isEnding.test(str);
    })(shardsLeft);
    var newSentenceOfTokens;
    if (indexOfNextBreak > -1) {
        var sentencePair = R.splitAt(indexOfNextBreak + 1)(shardsLeft);
        newSentenceOfTokens = sentencePair[0].map(chunkToToken);
        return R.concat([newSentenceOfTokens], buildSentences(sentencePair[1]));
    }
    return [shardsLeft.map(chunkToToken)];
};
var breakIntoSentences = function (line) {
    // debugger;
    var shards = line.split(/\s+/);
    var sentences = buildSentences(shards);
    return sentences;
};
var generateOpenerKey = function (depth) {
    return R.pipe(R.range(0), R.map(function () {
        return {
            t: TokenType.Empty,
            w: '',
            e: false
        };
    }))(depth);
};
var pickFromKey = function (map, key, chanceEngine) {
    var options = map[key];
    // console.log(options);
    var total = options['__total'];
    var pick = chanceEngine.natural({ min: 1, max: total });
    var pickedToken = R.pipe(R.keys, R.reduce(function (accum, val) {
        if (accum + options[val] >= pick) {
            return R.reduced(JSON.parse(val));
        }
        return accum + options[val];
    }, 0))(options);
    return pickedToken;
};
var grabTokenFromKey = function (tokenKeySet, map, chanceEngine) {
    var currenTokenKey = JSON.stringify(tokenKeySet);
    var currentToken = pickFromKey(map, currenTokenKey, chanceEngine);
    var newTokenSet = R.concat(R.tail(tokenKeySet), currentToken);
    return currentToken.e ? [currentToken] : R.prepend(currentToken, grabTokenFromKey(newTokenSet, map, chanceEngine));
};
var renderToken = function (token, chanceEngine) {
    switch (token.t) {
        case TokenType.Word:
            return token.w;
        case TokenType.WordEnd:
            return token.w;
        case TokenType.Number:
            var num = chanceEngine.natural({ min: 5, max: 6440 });
            return commaNumber(num);
        case TokenType.Money:
            var numm = (chanceEngine.natural({ min: 2, max: 70 }) * 100);
            return '$' + commaNumber(numm);
        case TokenType.Junk:
            return 'FIX THE JUNK ISSUE';
        default:
            break;
    }
    return token.w;
};
var generateStringFromTokens = function (tokenSet, chanceEngine) {
    return R.pipe(R.map(R.curry(renderToken)(R.__, chanceEngine)), R.join(' '))(tokenSet);
};
var generateFromMap = function (map, seed) {
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
// fs.readdirAsync(dataRoot)
//   .then(filterToJsonFiles)
//   .map(readJson, { concurrency: 6 })
//   .then((datas) => {
//     console.log(datas.length);
//   });
var test = 'Justice Kagan loves spiderman. I know that\'s a myth.';
// console.log(makeMarkovSetsFromLine(3, test));
// breakIntoSentences(test);
var testData = [test,
    'Iris pours her heart out. While the city is under attack.',
    'Iris writes on the page.',
    'Iris has a night on the city.'];
// console.log(makeMarkovMap('', testData));
var test2 = [
    'Barry writes on the 576 wall.',
    'Iris writes on the $590 page.',
    'Iris has a night on the city.'
];
var map = makeMarkovMap('', test2, 2);
// console.log();
// debugger;
// console.log(generateFromMap(map, (new Chance()).natural()));
console.log(generateFromMap(map, 1));
console.log(generateFromMap(map, 2));
console.log(generateFromMap(map, 3));
console.log(generateFromMap(map, 1));
