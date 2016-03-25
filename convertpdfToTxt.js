
var Promise = require('bluebird');

var path = require('path');
const dataRoot = path.join(__dirname, 'data');
var R = require('ramda');
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
// var exec = Promise.promisify(require('child_process').exec);
var exec = require('child_process').exec;

const match = /(2016-03-23.14-14.*)\.pdf$/;
const matchAllFiles = /(.*)\.(pdf|txt)$/;
const matchPDF = /(.*)\.pdf$/;
const matchTxt = /(.*)\.txt$/;

const filterFiles = (list) => {
  // const match = /.*\.pdf$/;
  // const match = /2012-11-01.*\.pdf$/;
  return new Promise((resolve, reject) => {
    debugger;

    console.log('all ', list.length);
    const existingTxtFiles =
      R.pipe(
        R.filter((item) => matchTxt.test(item)),
        R.map((item) => matchTxt.exec(item)),
        R.map(R.nth(1))
      )(list);
    console.log('txts ', existingTxtFiles.length);

    const pendingPdfFiles =
      R.pipe(
        R.filter((item) => matchPDF.test(item)),
        R.map((item) => matchPDF.exec(item)),
        R.map(R.nth(1)),
        R.filter(
          R.pipe(
            R.flip(R.contains)(existingTxtFiles),
            R.not
          )
        )
      )(list);

    console.log('pendingPdfFiles ', pendingPdfFiles.length);

    resolve(pendingPdfFiles);


  });
}

const convert = (filename) => {
  // const cmd = 'pwd';

  const source = path.join(dataRoot, filename + '.pdf');
  const target = path.join(dataRoot, filename + '.txt');
  const cmd = path.join(__dirname, 'pdftotext.exe ') + source + ' ' + target;

  return new Promise((resolve, reject) => {

    exec(cmd, (error, stdout, stderr) => {
      // sys.print('stdout: ' + stdout);
      // sys.print('stderr: ' + stderr);
      if (error !== null) {
        // console.log('exec error: ', error);
        // reject(error);
        resolve('Unable to write: ' + error);
      } else {
        resolve('Wrote: ' + filename + ' ' + stdout);
      }

    });
  });
}


fs.readdirAsync(dataRoot)
  .then(filterFiles)
  .map(convert, { concurrency: 3 })
  .then((list) => {
    debugger;
    console.log(list);
    console.log(list.length);
  })
