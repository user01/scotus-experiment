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
  const filtered = R.filter((item) => {
    return match.test(item);
  }, list);
  return Promise.resolve(filtered);
};
const readJson = (filename) => {
  return fs.readFileAsync(path.join(tweetRoot, filename)).then((buffer) => {
    return Promise.resolve({ filename, data: JSON.parse(buffer.toString()) });
  })
};
const isJustice = /^Justice\s+/;
const transformJsonTweetIntoZeroedDoc = (json) => {
  return {
    name: json.data.name,
    filename: json.filename,
    currentTweet: 0,
    totalTweets: json.data.validTweets.length,
    isJustice: isJustice.test(json.data.name)
  };
};

//*********************************************************
// DB Tools
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
const findOnInDb = (query) => {
  return new Promise((resolve, reject) => {
    db.findOne(query).exec((err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

const handleEmptyState = (pulledState) => {
  return pulledState ? pulledState : { count: 0, tweeters: [] };
}



const handleMissingName = (filename) => {
  return readJson(filename)
    .then(transformJsonTweetIntoZeroedDoc);
}
const pickNextTweet = (state) => {
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


const generateMissingFiles = (state, fsFiles) => {
  const dbKnownFilesnames = R.map(R.prop('filename'), state.tweeters);
  const missingFiles = R.filter(R.pipe(
    R.flip(R.contains)(dbKnownFilesnames),
    R.not
  ))(fsFiles);
  return missingFiles;
};

const ensureStateMatchesFiles = (state) => {
  return fs.readdirAsync(tweetRoot)
    .then(filterToJsonFiles)
    .then(R.curry(generateMissingFiles)(state))
    .map(handleMissingName)
    .then((addedFiles) => {
      // console.log("All done with ", addedFiles);
      const tweeters = R.concat(addedFiles, state.tweeters);
      // console.log('Tweeters', tweeters);
      const newState = R.merge(state, { tweeters });
      return newState;
    });
};

const joinTweetingAndStateWriting = (payload) => {
  const tweetingPromise = Promise.resolve(payload.tweet);
  const writingStatePromise = setDocInDb(payload.newState);
  return Promise.join(tweetingPromise, writingStatePromise);
}



findOnInDb({ count: { $exists: true } })
  .then(handleEmptyState)
  .then(ensureStateMatchesFiles)
  .then(pickNextTweet)
  .then(getPickedTweet)
  .then(joinTweetingAndStateWriting)
  .then((res) => {
    //all done with tweet pass
    console.log('All done!', res[0]);
  });
