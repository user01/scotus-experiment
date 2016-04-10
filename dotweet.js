const Datastore = require('nedb');
const path = require('path');
const Promise = require('bluebird');
const R = require('ramda');
const Chance = require('chance');

const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
const db = new Datastore({ filename: path.join(__dirname, 'tweets.db'), autoload: true });

const NO_TWEETS_REMAIN = "NO_TWEETS_REMAIN";
const tweetRoot = path.join(__dirname, 'tweets');

const filterToJsonFiles = (list) => {
  const match = /.*\.json$/;
  // const match = /justice_kagan\.json$/;
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
  // console.log(newDoc);
  return Promise.resolve(newDoc);
};

// Simple tool that blindly writes to the db
const setDocInDb = (doc) => {
  return new Promise((resolve, reject) => {
    if (R.has('_id', doc)) {
      db.update({ _id: doc._id }, doc, {}, (err, numChanged) => {
        if (err || numChanged != 1) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    } else {
      db.insert(doc, (err, newDoc) => {
        if (err) {
          reject(err);
        } else {
          resolve(newDoc);
        }
      });
    }
  });
};
const handleMissingName = (filename) => {
  return readJson(filename)
    .then(transformJsonTweetIntoZeroedDoc);
}
// const pickTweetFromTweeter = (count,)=>{}
const pickNextTweet = (state) => {
  // debugger;
  // console.log('pick next tweet', state);
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
  if (validTweeters.length < 1) {
    throw NO_TWEETS_REMAIN;
  }

  const chance = new Chance(state.count);
  const pickedIndex = chance.natural({ min: 0, max: validTweeters.length - 1 });
  // console.log('pickedIndex', pickedIndex);
  const filename = validTweeters[pickedIndex].filename;
  const tweetIndex = validTweeters[pickedIndex].currentTweet;

  const oldTweeters = R.addIndex(R.filter)((item, idx) => idx != pickedIndex)(state.tweeters);
  const newTweeter = R.pipe(
    R.nth(pickedIndex),
    R.mapObjIndexed((val, key, obj) => {
      return (key == 'currentTweet') ? val + 1 : val;
    })
  )(state.tweeters);

  const newState = R.merge(state, {
    count: state.count + 1,
    tweeters: R.concat(oldTweeters, [newTweeter])
  });

  return {
    filename,
    tweetIndex,
    newState
  };
};
const grabTweet = (index, filejson) => {
  return `${filejson.data.name}: ${R.nth(index, filejson.data.validTweets)}`;
}
const getPickedTweet = (payload) => {
  return readJson(payload.filename)
    .then(R.curry(grabTweet)(payload.tweetIndex))
    .then((tweet) => {
      return {
        tweet,
        newState: payload.newState,
      };
    })
}

// {
//   count: 0,
//   tweeters: [{name,filename,currentTweet,totalTweets,isJustice}]
// }



db.find({ count: { $exists: true } }).exec((err, states) => {
  debugger;
  const state = states.length > 0 ? R.head(states) : { count: 0, tweeters: [] };
  // console.log(state);

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
          // console.log("All done with ", addedFiles);
          const tweeters = R.concat(addedFiles, state.tweeters);
          // console.log('Tweeters', tweeters);
          const newState = R.merge(state, { tweeters });
          return newState;
        })
        .then(pickNextTweet)
        .then(getPickedTweet)
        .then((dat) => {
          // console.log(dat);
          const tweetingPromise = Promise.resolve(dat.tweet);
          const writingStatePromise = setDocInDb(dat.newState);
          return Promise.join(tweetingPromise, writingStatePromise);
        })
        .then((res) => {
          //all done with tweet pass
          console.log('All done!', res[0]);
        });
    });

});