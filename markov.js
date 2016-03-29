/// <reference path="./typings/tsd.d.ts" />
/// <reference path="./markov.types.ts" />
"use strict";
var Promise = require('bluebird');
var path = require('path');
var dataRoot = path.join(__dirname, 'speeches');
var outRoot = path.join(__dirname, 'tweets');
var R = require('ramda');
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
var Chance = require('chance');
var markov_generator_1 = require('./markov.generator');
var markov_tools_1 = require('./markov.tools');
var generationSize = 200;
var filterToJsonFiles = function (list) {
    // const match = /JUSTICE_KAGAN\.json$/;
    // const match = /JUSTICE.*\.json$/;
    // const match = /PERRY\.json$/;
    var match = /.*\.json$/;
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
var writeResults = function (result) {
    return fs.writeFileAsync(path.join(outRoot, result.filename + '.json'), JSON.stringify(result, null, 2)).then(function () { return Promise.resolve(result); });
};
var genTweetsFromMap = function (map) {
    var name = map.speaker + ': ';
    // console.log(map.map);
    // console.log(name);
    // console.log(generateStringAndProbablityFromMap);
    // debugger;
    // console.log(generateStringAndProbablityFromMap(map, 2));
    var validTweets = R.pipe(R.range(0), R.map(R.curry(markov_tools_1.generateStringAndProbablityFromMap)(map)), R.filter(R.pipe(R.last, R.gte(0.5))), R.map(R.head), R.filter(R.pipe(R.length, R.lte(R.__, 140 - name.length))), R.filter(R.pipe(R.length, R.gte(R.__, 40 - name.length))), R.uniq)(generationSize);
    return { name: map.speaker, filename: map.speaker.replace(/\s+/, '_').toLowerCase(), validTweets: validTweets };
};
fs.readdirAsync(dataRoot)
    .then(filterToJsonFiles)
    .map(readJson, { concurrency: 2 })
    .map(markov_generator_1.jsonPayloadIntoMarkovMap, { concurrency: 2 })
    .map(genTweetsFromMap, { concurrency: 2 })
    .map(writeResults, { concurrency: 2 })
    .then(function (datas) {
    var tweetCount = R.pipe(R.map(R.prop('validTweets')), R.map(R.length), R.sum)(datas);
    console.log('Generated ' + tweetCount + ' tweets');
    // console.log(datas);
    console.log(datas.length);
});
//# sourceMappingURL=markov.js.map