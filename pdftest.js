// var pdfText = require('pdf-text')

var pathToPdf = __dirname + "/data/2000-10-02.99-1038.Eastern_Associated_Coal_Corp._v._Mine_Workers.pdf"
var R = require('ramda');
var objectAssign = require('object-assign');

// pdfText(pathToPdf, (err, chunks) => {
//   //chunks is an array of strings 
//   //loosely corresponding to text objects within the pdf

//   //for a more concrete example, view the test file in this repo
//   console.log(err);
//   console.log(chunks);
// });




const fs = require('fs'),
  PDFParser = require("./node_modules/pdf3json/PDFParser");

const pdfParser = new PDFParser();
//R.pipe(R.prop('data'),R.prop('Pages'),R.map(R.prop('Texts')),R.flatten,R.map(R.prop('R')),R.flatten,R.map(R.prop('T')),R.map(decodeURIComponent),R.join(''))(pdfData)

pdfParser.on("pdfParser_dataError", errData => console.error('err', errData));
pdfParser.on("pdfParser_dataReady", pdfData => {

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

  console.log(text);
});

pdfParser.loadPDF(pathToPdf);