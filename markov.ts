
/// <reference path="./typings/tsd.d.ts" />
/// <reference path="./markov.types.ts" />

const Promise = require('bluebird');
const path = require('path');
const dataRoot = path.join(__dirname, 'speeches');
const outRoot = path.join(__dirname, 'tweets');
const R = require('ramda');
const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
const Chance = require('chance');

import {Token, TokenType} from './markov.types';
import {jsonPayloadIntoMarkovMap} from './markov.generator';
import {generateStringAndProbablityFromMap} from './markov.tools';

const generationSize = 200;

const filterToJsonFiles = (list) => {
  // const match = /JUSTICE_KAGAN\.json$/;
  // const match = /JUSTICE.*\.json$/;
  // const match = /PERRY\.json$/;
  const match = /.*\.json$/;
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

const writeResults = (result) => {
  return fs.writeFileAsync(
    path.join(outRoot, result.filename + '.json'),
    JSON.stringify(result, null, 2)
  ).then(() => Promise.resolve(result));
}



const genTweetsFromMap = (map) => {
  const name = map.speaker + ': ';
  // console.log(map.map);
  // console.log(name);
  // console.log(generateStringAndProbablityFromMap);
  // debugger;
  // console.log(generateStringAndProbablityFromMap(map, 2));

  const validTweets = R.pipe(
    R.range(0),
    R.map(R.curry(generateStringAndProbablityFromMap)(map)),
    R.filter(R.pipe(R.last, R.gte(0.5))),
    R.map(R.head),
    R.filter(R.pipe(R.length, R.lte(R.__, 140 - name.length))),
    R.filter(R.pipe(R.length, R.gte(R.__, 40 - name.length))),
    R.uniq
  )(generationSize);

  return { name: map.speaker, filename: map.speaker.replace(/\s+/, '_').toLowerCase(), validTweets };
}


fs.readdirAsync(dataRoot)
  .then(filterToJsonFiles)
  .map(readJson, { concurrency: 2 })
  .map(jsonPayloadIntoMarkovMap, { concurrency: 2 })
  .map(genTweetsFromMap, { concurrency: 2 })
  .map(writeResults, { concurrency: 2 })
  .then((datas) => {
    const tweetCount = R.pipe(
      R.map(R.prop('validTweets')),
      R.map(R.length),
      R.sum
    )(datas);
    console.log('Generated ' + tweetCount + ' tweets');
    // console.log(datas);
    console.log(datas.length);
  });

