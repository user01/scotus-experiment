
const Promise = require('bluebird');
const path = require('path');
const dataRoot = path.join(__dirname, 'json');
const R = require('ramda');
const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });



const filterToJsonFiles = (list) => {
  const match = /.*\.json$/;
  return new Promise((resolve, reject) => {
    resolve(R.filter((item) => {
      return match.test(item);
    })(list));
  });
}

const readJson = (filename) => {
  return fs.readFileAsync(path.join(dataRoot, filename)).then((buffer) => {
    return Promise.resolve(JSON.parse(buffer.toString()));
  })
};

// const whitelistedSpeakers = ['THOMAS','SCALIA','ROBERTS',''];
const validSpeakerSet = (set) => {
  if (set.speeches.length < 20) return false; // less than 20, no one cares

  const isJustice = set.speaker.indexOf('JUSTICE') > -1;
  return (isJustice || set.speeches.length > 350);
}

const transformArgumentFilesIntoSpeechFiles = (argFiles) => {
  //argFiles is an array of the files data
  const speeches = R.pipe(
    R.map(R.prop('completeLines')),
    R.flatten, //ignore which cases
    R.groupBy(R.prop('speaker')), // group same speakers together
    R.map(R.map(R.prop('speech'))), //erase the redundant speaker fields
    R.toPairs,
    R.map((pair) => {
      return { speaker: pair[0], speeches: pair[1] };
    }),
    R.filter(validSpeakerSet)
  )(argFiles)
  return Promise.resolve(speeches);
};


fs.readdirAsync(dataRoot)
  .then(filterToJsonFiles)
  .map(readJson, { concurrency: 6 })
  .then(transformArgumentFilesIntoSpeechFiles)
  // .map(writeResults, { concurrency: 3 })
  .then((list) => {
    debugger;
    // console.log(R.map(R.prop('speaker'))(list));
    console.log(
      R.pipe(
        R.map((obj => {
          return {
            speaker: obj.speaker,
            size: obj.speeches.length
          };
        })),
        R.sort((a, b) => a.size - b.size)
      )(list));
    // console.log(list[2]);
    console.log(list.length);
  })
