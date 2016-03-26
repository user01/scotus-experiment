// var pdfText = require('pdf-text')

var Promise = require('bluebird');
const pathNode = require('path');
const dataRoot = __dirname + '/data/';
const outRoot = pathNode.join(__dirname, 'json')
const R = require('ramda');
const objectAssign = require('object-assign');
const PDFParser = require("./node_modules/pdf3json/PDFParser");
const fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });

const filterFiles = (list) => {
  const match = /.*\.pdf$/;
  // const match = /2012-11-01.*\.pdf$/;
  // const match = /2016-03-23.14-14.*\.pdf$/;
  return new Promise((resolve, reject) => {
    resolve(R.filter((item) => {
      return match.test(item);
    })(list));
  });
}


var hackCount = 0;
const pReg = /\s*P R O C E E D I N G S\s*/;
const cReg = /\s*\(Whereupon, at \d\d:\d\d .\..\.. the case in.*/;
const timeOnly = /\s*\(\d\d:\d\d\s.\..\.\)\s*/;
const speechCheck = /\s*([\.\sA-Z]+):\s*(.+)\s*/;
const numberOnly = /^\d+$/;
const replaceStrs = [
  ['JUDGE', 'JUSTICE'], ['JUSTCIE', 'JUSTICE'], ['JUTICE', 'JUSTICE'],
  ['GINSBURGH', 'GINSBURG'],
  ['GINSBERG', 'GINSBURG'],
  ['JUSTINE', 'JUSTICE'],
  /\s*\.(?=\s+)/, /\s*CHIEF(?=\s+)/, /\s*GENERAL(?=\s+)/, /\s*MR(?=\s+)/, /\s*MRS(?=\s+)/, /\s*MS(?=\s+)/, /\s*GEN(?=\s+)/, /\s+I(?=\s+)/,
  [/[\s|\u00A0]+/, ' '],
];

const getTextFromPdf = (path) => {
  return new Promise((resolve, reject) => {

    try {

      // console.log('reading ', path);
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataError", errData => console.error('err', errData));
      pdfParser.on("pdfParser_dataReady", pdfData => {

        const pages = R.pipe(
          R.prop('data'),
          R.prop('Pages'))(pdfData);
        const pageLines = R.map(
          R.pipe(
            R.prop('Texts'),
            R.map((elm) => {
              return objectAssign({}, elm, { line: Math.floor(elm.y * 10) });
            }),
            R.groupBy(R.prop('line')),
            R.values
          )
        )(pages);
        const pageTexts = R.map(R.map(
          R.pipe(
            R.map(R.prop('R')),
            R.flatten,
            R.map(R.prop('T')),
            R.map(decodeURIComponent),
            R.join(' '),
            R.replace(/\s+/g, ' ')
          )
        ))(pageLines);

        const testLineIndex = R.curry((line, idx) => {
          const targetCurrentStr = '' + idx;
          const current = line.indexOf(targetCurrentStr);
          if (current > -1) {
            const currentRegExp = new RegExp('^\\s*' + targetCurrentStr);
            if (currentRegExp.test(line)) {
              return R.splitAt(current + targetCurrentStr.length)(line)[1];
            }
          }
          return false;
        });

        const pageTextsCleaned = R.map(
          R.pipe(
            R.addIndex(R.map)((line, idx) => {
              if (line.trim().length == 0) return false;
              if (numberOnly.test(line.trim())) return false;
              // lines need to have the string of the idx+n leading.
              // this number gets stripped off
              // if it's missing the line is turned into a false

              const testLine = testLineIndex(line);

              const indexResults = R.map(testLine)(R.range(idx - 1, idx + 2));

              const fixedLine = R.find(R.pipe(R.type, R.equals('String')))(indexResults)
              return fixedLine ? fixedLine : false;

            }),
            R.filter(R.identity)
          )
        )(pageTexts);
        const allLines = R.flatten(pageTextsCleaned);
        // console.log(allLines);

        // Trim down to real lines
        const proceedingsIndex = R.findIndex((line) => {
          return pReg.test(line);
        })(allLines);
        const endingsIndex = R.findLastIndex((line) => {
          return cReg.test(line);
        })(allLines);

        const workingLines = R.slice(proceedingsIndex + 1, endingsIndex, allLines);
        const trimmedLines = R.filter((line) => {
          if (line.trim().length < 6) return true;
          if (timeOnly.test(line)) return false;
          const alreadyUpper = R.toUpper(line) == line;
          return !alreadyUpper;
        })(workingLines);


        const cleanSpeaker = (currentContent) => {

          const fixed = R.reduce((speaker, replacePair) => {
            const src = R.isArrayLike(replacePair) ? replacePair[0] : replacePair;
            const tar = R.isArrayLike(replacePair) ? replacePair[1] : '';
            return R.replace(src, tar, speaker);
          }, ' ' + currentContent + ' ')(replaceStrs);

          // console.log('started with ', currentContent, ' and ended with ', fixed.trim());

          return fixed.trim();
        }
        const isSpeaker = (line) => {
          const speakerLine = speechCheck.test(line);
          if (!speakerLine) return false;
          const speakerData = speechCheck.exec(line);
          if (numberOnly.test(speakerData[1])) return false;
          return R.toUpper(speakerData[1]) == speakerData[1];
        }

        const speakers = R.reduce((acc, line) => {

          if (!isSpeaker(line)) {
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

        if (completeLines.length > 5) {
          console.log(hackCount++, ' read ', allLines.length, 'from', path);
          resolve(writeResults({ success: true, completeLines, path }))
        } else {
          console.log(hackCount++, 'failed read of ', path);
          debugger;

          resolve(writeResults({ success: false, completeLines: workingLines, path: "bad." + path }));
          // resolve({ success: false });
        }
      });

      pdfParser.loadPDF(dataRoot + path);
    } catch (e) {
      console.error('unable to read file ', path, e);
      reject(e);
    }

  });
}

const writeResults = (result) => {
  return fs.writeFileAsync(
    pathNode.join(outRoot, result.path + '.json'),
    JSON.stringify(result, null, 2)
  )
    .then(() => {
      return Promise.resolve(result);
    });
}

fs.readdirAsync(dataRoot)
  .then(filterFiles)
  .map(getTextFromPdf, { concurrency: 6 })
  // .map(writeResults, { concurrency: 3 })
  .then((list) => {
    debugger;
    // console.log(list);
    console.log(list.length);
  })
