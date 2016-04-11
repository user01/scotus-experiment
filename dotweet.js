const Datastore = require('nedb');
const path = require('path');
const Promise = require('bluebird');
const R = require('ramda');
const Chance = require('chance');
const Moment = require('moment');
const MomentTz = require('moment-timezone');
const Twitter = require('twitter');

const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
const db = new Datastore({ filename: path.join(__dirname, 'tweets.db'), autoload: true });
const twitterCreds = require('./twitter.credentials.js');


const twitterClient = new Twitter(twitterCreds);

const NO_TWEETS_REMAIN = "NO_TWEETS_REMAIN";
const tweetRoot = path.join(__dirname, 'tweets');
const TIME_FRAME_MINUTES = 10;

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

// *********************************************************
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

// *********************************************************
// Cleanup items
const handleEmptyState = (pulledState) => {
  return pulledState ? pulledState : { count: 0, tweeters: [] };
}
const handleMissingName = (filename) => {
  return readJson(filename)
    .then(transformJsonTweetIntoZeroedDoc);
}

const pickNextTweetIndex = (state) => {
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

const tweet = (content) => {
  return new Promise((resolve, reject) => {
    twitterClient.post('statuses/update',
      {
        status: content,
        lat: 38.890656,
        long: -77.004440,

      },
      (error, tweet, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(tweet);
        }
      });
  });
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
  const tweetingPromise = tweet(payload.tweet);
  const writingStatePromise = setDocInDb(payload.newState);
  return Promise.join(tweetingPromise, writingStatePromise);
}


const doTweet = () => {

  return findOnInDb({ count: { $exists: true } })
    .then(handleEmptyState)
    .then(ensureStateMatchesFiles)
    .then(pickNextTweetIndex)
    .then(getPickedTweet)
    .then(joinTweetingAndStateWriting)
}

const cleanMoment = (targetMoment) => {
  return MomentTz(targetMoment, "America/New_York").set({ 'second': 0, 'millisecond': 0 });
}
const shouldDoTweet = (moment) => {
  const currentTime = cleanMoment(moment);
  if (currentTime.day() < 1 && currentTime.day() > 3) return false;
  if (currentTime.hour() < 10 || currentTime.hour() >= 12) return false;
  return true;
}

const shouldBeClerkOpeningTweet = (currentTime) => {
  if (currentTime.hour() !== 10) return false;
  if (currentTime.minute() < TIME_FRAME_MINUTES) return true;
  return false;
}
const shouldBeClerkClosingTweet = (currentTime) => {
  if (currentTime.hour() == 11) {
    if (currentTime.minute() >= 60 - TIME_FRAME_MINUTES) return true;
  }
  return false;
}

const CLERK_HEADER = 'Clerk: ';
const CLERK_OPENERS = [
  "Starting to record. I hope this tinnitus abates or I'll never hear the arguments",
  "Opening the transcript. I hope the Justices stop mumbling.",
  "Word Processor. New Document. Oops, the they've started already.",
  "That loud concert last night really hit my ears hard. Mind if I sprinkle in a few lyrics? They'll be relevant.",
  "Another day, another dollar.",
  "I'm in the mood for an easy day. What say everyone speaks really slowly.",
  "In this building. Again. It's stately enough, but can't we do this outside for once? My feed says it's a nice day.",
  "My aren't those robes slimming. Wait, hold on, I'm writing all this down."
];
const CLERK_CLOSERS = [
  "Phew. All done for the day. Who's up for a party?",
  "That's all folks.",
  "Well, I think we're all full up on legal history today.",
  "Strict constructionism certainly won today. Whatever that is.",
  "Saw some judical activism today. You should see how active they are. When they're hungry for lunch.",
  "I live-tweeted this on my personal account. Should I have checked with the court first?",
  "Did you see that guy in the thrid row? I have no idea how he got a tuba into the gallery."
]
const openerTweet = (currentTime) => {
  return tweet(`${CLERK_HEADER}${new Chance(currentTime.unix()).pickone(CLERK_OPENERS)}`);
}
const closerTweet = (currentTime) => {
  return tweet(`${CLERK_HEADER}${new Chance(currentTime.unix()).pickone(CLERK_CLOSERS)}`);
}



const go = (moment) => {
  const currentTime = cleanMoment(moment);
  if (!shouldDoTweet(currentTime)) return Promise.resolve(false);
  if (shouldBeClerkOpeningTweet(currentTime)) {
    return openerTweet(currentTime);
  } else if (shouldBeClerkClosingTweet(currentTime)) {
    return closerTweet(currentTime);
  }
  return doTweet();
}


const currentTime = Moment();
go(currentTime)
  .then(() => console.log(`Completed run ${currentTime.format("dddd, MMMM Do YYYY, h:mm:ss a")}`))
  .catch((err) => {
    console.warn(`ERROR at ${currentTime.format("dddd, MMMM Do YYYY, h:mm:ss a")}`);
    console.warn(err);
  });