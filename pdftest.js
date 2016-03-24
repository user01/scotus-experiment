// var pdfText = require('pdf-text')

var Promise = require('bluebird');

const dataRoot = __dirname + '/data/';
var R = require('ramda');
var objectAssign = require('object-assign');
const PDFParser = require("./node_modules/pdf3json/PDFParser");
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });

const filterFiles = (list) => {
  const match = /2012-11-01.*\.pdf$/;
  return new Promise((resolve, reject) => {
    resolve(R.filter((item) => {
      return match.test(item);
    })(list));
  });
}




const getTextFromPdf = (path) => {
  return new Promise((resolve, reject) => {

    try {

      console.log('reading ', path);
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
            R.join('')
          )
        ))(pageLines);
        const pageTextsCleaned = R.map(
          R.pipe(
            R.addIndex(R.map)((line, idx) => {
              if (line.trim() == '') return false;
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
        const allLines = R.flatten(pageTextsCleaned);

        console.log('read ', allLines.length, 'from', path);
        resolve(allLines);
      });

      pdfParser.loadPDF(dataRoot + path);
    } catch (e) {
      console.error('unable to read file ', path, e);
      reject(e);
    }

  });
}

fs.readdirAsync(dataRoot)
  .then(filterFiles)
  .map(getTextFromPdf, { concurrency: 3 })
  .then((list) => {
    debugger;
    console.log(list);
    console.log(list.length);
  })
