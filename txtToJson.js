// var pdfText = require('pdf-text')

var Promise = require('bluebird');

const path = require('path')
const dataRoot = path.join(__dirname, 'data');
var R = require('ramda');
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });

const matchAllFiles = /(.*)\.(json|txt)$/;
// const matchTxt = /(.*)\.txt$/;
const matchTxt = /(2016-03-22.15-233.Puerto_Rico_v._Franklin_Cal._Tax-Free_Trust)\.txt$/;
const matchJson = /(.*)\.json$/;


const filterFiles = (list) => {

  return new Promise((resolve, reject) => {

    console.log('all ', list.length);
    const existingJsonFiles =
      R.pipe(
        R.filter((item) => matchJson.test(item)),
        R.map((item) => matchJson.exec(item)),
        R.map(R.nth(1))
      )(list);
    console.log('txts ', existingJsonFiles.length);

    const pendingTxtFiles =
      R.pipe(
        R.filter((item) => matchTxt.test(item)),
        R.map((item) => matchTxt.exec(item)),
        R.map(R.nth(1)),
        R.filter(
          R.pipe(
            R.flip(R.contains)(existingJsonFiles),
            R.not
          )
        )
      )(list);

    console.log('pendingJsonFiles ', pendingTxtFiles.length);

    resolve(pendingTxtFiles);

  });
}



const processText = (rawText) => {

  debugger;
  const pageTexts = R.split('\r\n')(rawText.toString());
  console.log(rawText.toString());
  // console.log('pageTexts', pageTexts);

  const pageTextsCleaned = R.map(
    R.pipe(
      R.addIndex(R.map)((line, idx) => {
        if (line.trim().length == 0) return false;
        // lines need to have the string of the idx+1 leading.
        // this number gets stripped off
        // if it's missing the line is turned into a false
        const targetCurrentStr = '' + idx;
        const targetNextStr = '' + (idx + 1);
        const current = line.indexOf(targetCurrentStr) == 0;
        if (current) {
          return R.splitAt(targetCurrentStr.length)(line)[1];
        }
        const next = line.indexOf(targetNextStr) == 0;
        if (next) {
          return R.splitAt(targetNextStr.length)(line)[1];
        }
        return false;
      }),
      R.filter(R.identity)
    )
  )(pageTexts);
  // console.log(pageTextsCleaned);
  const allLines = R.flatten(pageTextsCleaned);
  // console.log(allLines);

  // Trim down to real lines
  const pReg = /\s*P R O C E E D I N G S\s*/;
  const proceedingsIndex = R.findIndex((line) => {
    return pReg.test(line);
  })(allLines);
  const cReg = /\s*\(Whereupon, at \d\d:\d\d .\..\.. the case in.*/;
  const endingsIndex = R.findLastIndex((line) => {
    return cReg.test(line);
  })(allLines);

  const workingLines = R.slice(proceedingsIndex + 1, endingsIndex, allLines);
  const timeOnly = /\s*\(\d\d:\d\d\s.\..\.\)\s*/;
  const trimmedLines = R.filter((line) => {
    if (line.trim().length < 6) return true;
    if (timeOnly.test(line)) return false;
    const alreadyUpper = R.toUpper(line) == line;
    return !alreadyUpper;
  })(workingLines);

  const cleanSpeaker = (currentContent) => {
    const removeStrs = ['CHIEF JUSTICE', 'JUSTICE', 'GENERAL', 'MR.', 'MRS.'];
    const cleaned = R.reduce((speaker, removeStr) => {
      return R.replace(removeStr, '', speaker)
    }, currentContent)(removeStrs);
    return cleaned.trim();
  }

  const speechCheck = /\s*(.+):\s*(.+)\s*/;
  const speakers = R.reduce((acc, line) => {
    const speakerLine = speechCheck.test(line);
    if (!speakerLine) {
      return {
        lines: acc.lines,
        current: {
          speaker: acc.current.speaker,
          speech: R.append(line.trim(), acc.current.speech)
        }
      };
    }

    const speakerData = speechCheck.exec(line);
    const speaker = cleanSpeaker(speakerData[1]);
    const text = speakerData[2].trim();

    const lines = acc.current.speaker != '' ? R.append({
      speaker: acc.current.speaker,
      speech: R.join(' ')(acc.current.speech)
    }, acc.lines) : acc.lines;

    return {
      lines,
      current: {
        speaker,
        speech: [text]
      }
    };

  })({
    lines: [],
    current: {
      speaker: '',
      speech: []
    }
  })(trimmedLines);

  const completeLines = R.append({
    speaker: speakers.current.speaker,
    speech: R.join(' ')(speakers.current.speech)
  }, speakers.lines);

  console.log('read ', allLines.length, 'from', rawText.toString().length);

  return completeLines;
}// end process text



const handlePath = (filename) => {
  const fullPath = path.join(dataRoot, filename + '.txt');
  return fs.readFileAsync(fullPath)
    .then(convertTextToJson)
  // .then(writeResults);
}

const convertTextToJson = (path) => {
  return Promise.resolve(processText(path));
}

const writeResults = (result) => {
  return fs.writeFileAsync(
    dataRoot + result.path + '.json',
    JSON.stringify(result.completeLines, null, 2)
  )
    .then(() => {
      return Promise.resolve(result);
    });
}

fs.readdirAsync(dataRoot)
  .then(filterFiles)
  .map(handlePath, { concurrency: 3 })
  // .map(writeResults, { concurrency: 3 })
  .then((list) => {
    debugger;
    // console.log(list);
    console.log(list.length);
  })
