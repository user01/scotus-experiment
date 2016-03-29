/// <reference path="./markov.types.ts" />
"use strict";
var R = require('ramda');
var Chance = require('chance');
var markov_types_1 = require('./markov.types');
var isEnding = /[\.!?]$/;
var fakeEndings = ['Mr.', 'Ms.', 'Mrs.', 'Miss.', 'St.', 'v.', 'vs.'];
var isMoney = /^\$[\d,]+$/;
var isNumber = /^[\d,]+$/;
var isJunkParan = /\(.+\)/;
var isAlpha = /[a-zA-Z]/;
var isNumeric = /[0-9]/;
var isEndingTest = function (str) {
    if (!isEnding.test(str)) {
        return false;
    }
    return !R.contains(str, fakeEndings);
};
var isJunk = function (str) {
    //(d)(4) or 10b-5 or 77p(d)(4)
    if (isAlpha.test(str) && isNumeric.test(str))
        return true;
    if (isJunkParan.test(str))
        return true;
    return false;
};
// a chunk canNOT be an empty
var chunkToToken = function (chunk, index, array) {
    var forcedEnd = index == array.length - 1;
    if (isMoney.test(chunk)) {
        return {
            t: markov_types_1.TokenType.Money,
            w: '',
            e: forcedEnd
        };
    }
    if (isNumber.test(chunk)) {
        return {
            t: markov_types_1.TokenType.Number,
            w: '',
            e: forcedEnd
        };
    }
    if (isJunk(chunk)) {
        return {
            t: markov_types_1.TokenType.Junk,
            w: '',
            e: forcedEnd
        };
    }
    var end = isEndingTest(chunk);
    return {
        t: end ? markov_types_1.TokenType.WordEnd : markov_types_1.TokenType.Word,
        w: chunk,
        e: forcedEnd || end
    };
};
var sentenceToTries = function (depth, sentenceTokens) {
    var tokens = R.insertAll(0, R.map(function () {
        return {
            t: markov_types_1.TokenType.Empty,
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
    var indexOfNextBreak = R.findIndex(isEndingTest)(shardsLeft);
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
var makeMarkovSetsFromLine = function (depth, line) {
    var s = R.pipe(breakIntoSentences, R.map(R.curry(sentenceToTries)(depth)), R.unnest)(line);
    return s;
};
var makeMarkovMap = function (speaker, data, depth) {
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
    return { map: map, depth: depth, speaker: speaker };
};
exports.jsonPayloadIntoMarkovMap = function (jsonData) {
    var name = R.pipe(R.split('.'), R.head, R.split('_'), R.map(R.pipe(R.toLower, function (str) { return (new Chance()).capitalize(str); })), R.join(' '))(jsonData.filename);
    return makeMarkovMap(name, jsonData.data);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.jsonPayloadIntoMarkovMap;
//# sourceMappingURL=markov.generator.js.map