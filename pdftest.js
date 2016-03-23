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
        debugger;
        
        var text = R.pipe(
          R.prop('data'),
          R.prop('Pages'),
          R.map(R.pipe(
            R.prop('Texts'),
            R.map((elm) => {
              return objectAssign({}, elm, { line: Math.floor(elm.y * 10) });
            }),
            R.groupBy(R.prop('line')),
            R.values,
            //now an array of arr of objs with R props
            R.map(R.pipe(
              R.map(R.prop('R')),
              R.flatten,
              R.map(R.prop('T')),
              R.map(decodeURIComponent),
              R.join('')
            )),
            R.addIndex(R.map)((line, idx) => {
              // lines need to have the string of the idx+1 leading.
              // this number gets stripped off
              // if it's missing the line is turned into a false
              const targetStr = '' + (idx + 1);
              const index = line.indexOf(targetStr);
              return (index != 0) ? false : R.splitAt(targetStr.length)(line)[1];
            }),
            R.filter(R.identity)

          )),
          R.flatten
        )(pdfData);

        // console.log(text);
        console.log('read ', text.length, 'from', path);
        resolve(text);
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
    console.log(list.length);
    console.log(list[1]);
  })
