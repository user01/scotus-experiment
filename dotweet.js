const Datastore = require('nedb');
const path = require('path');
const Promise = require('bluebird');
const R = require('ramda');
const Chance = require('chance');

const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
const db = new Datastore({ filename: path.join(__dirname, 'tweets.db'), autoload: true });


const tweetRoot = path.join(__dirname, 'tweets');

const filterToJsonFiles = (list) => {
  // const match = /.*\.json$/;
  const match = /justice_kagan\.json$/;
  // console.log(list);
  const filtered = R.filter((item) => {
    return match.test(item);
  }, list);
  // console.log(filtered);
  return Promise.resolve(filtered);
};
const readJson = (filename) => {
  return fs.readFileAsync(path.join(tweetRoot, filename)).then((buffer) => {
    return Promise.resolve({ filename, data: JSON.parse(buffer.toString()) });
  })
};
const isJustice = /^Justice\s+/;
const transformJsonTweetIntoZeroedDoc = (json) => {
  // console.log(json);
  const newDoc = {
    name: json.data.name,
    filename: json.filename,
    currentTweet: 0,
    totalTweets: json.data.validTweets.length,
    isJustice: isJustice.test(json.data.name)
  };
  console.log(newDoc);
  return Promise.resolve(newDoc);
};

const writeDocToDb = (doc) => {
  console.log('new doc', doc);
  return new Promise((resolve, reject) => {
    db.insert(doc, (err, newDoc) => {
      if (err) {
        reject(err);
      } else {
        resolve(newDoc);
      }
    });
  });
};
const handleMissingName = (filename) => {
  return readJson(filename)
    .then(transformJsonTweetIntoZeroedDoc);
}
const pickNextTweet = (state) => {
  const chance = new Chance(state.count);
  const justiceSpeaking = state.count % 2 == 0;
  const validTweeters = R.pipe(R.filter(
    R.pipe(
      R.prop('isJustice'),
      justiceSpeaking ? R.identity : R.not
    )),
    R.filter((item) => {
      return item.currentTweet < item.totalTweets
    })
  )(state.tweeters);
  if (validTweeters < 1) {
    return 000;
  }

  const pickedIndex = chance.natural({ min: 0, max: validTweeters.length });
  const filename = validTweeters[pickedIndex].filename;

  return {
    filename,
    tweet,
    newState
  }
}

// {
//   count: 0,
//   tweeters: [{name,filename,currentTweet,totalTweets,isJustice}]
// }

db.find({ count: { $exists: true } }).exec((err, states) => {
  const state = states.length > 0 ? states[0] : { count: 0, tweeters: [] };
  console.log(state);

  fs.readdirAsync(tweetRoot)
    .then(filterToJsonFiles)
    .then((fsFiles) => {
      console.log('fs seen files', fsFiles.length)
      const dbKnownFilesnames = R.map(R.prop('filename'), state.tweeters);
      console.log('Known ', dbKnownFilesnames.length);
      const missingFiles = R.filter(R.pipe(
        R.flip(R.contains)(dbKnownFilesnames),
        R.not
      ))(fsFiles);
      console.log('Missing:', missingFiles.length);

      Promise.map(missingFiles, handleMissingName)
        .then((addedFiles) => {
          console.log("All done with ", addedFiles);
          const tweeters = R.concat(addedFiles, state.tweeters);
          console.log(tweeters);
          const newState = {
            count: state.count,
            tweeters
          };
          return newState;

          // db.find({ index: { $exists: true } }).exec((err, dbKnownFiles) => {
        })
        .then()
    });

});