const Datastore = require('nedb');
const path = require('path');
const Promise = require('bluebird');
const R = require('ramda');

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
    .then(transformJsonTweetIntoZeroedDoc)
    // .then((doc) => {
    //   console.log('heard doc', doc);
    // })
    .then(writeDocToDb);
}

db.find({ filename: { $exists: true } }).exec((err, dbKnownFiles) => {

  fs.readdirAsync(tweetRoot)
    .then(filterToJsonFiles)
    .then((fsFiles) => {
      console.log('fs seen files', fsFiles.length)
      const dbKnownFilesnames = R.map(R.prop('filename'))(dbKnownFiles);
      console.log('Known ', dbKnownFilesnames.length);
      const missingFiles = R.filter(R.pipe(
        R.flip(R.contains)(dbKnownFilesnames),
        R.not
      ))(fsFiles);
      console.log('Missing:', missingFiles.length);
      Promise.map(missingFiles, handleMissingName)
        .then((addedFiles) => {
          console.log("All done with ", addedFiles);
          const knownFiles = R.concat(addedFiles, dbKnownFiles);

          db.find({ index: { $exists: true } }).exec((err, dbKnownFiles) => {
          });
        })
    });

});