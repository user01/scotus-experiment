


var Promise = require('bluebird');
var jsdom = require("jsdom");
var R = require('ramda');
var http = require('http');
var fs = Promise.promisifyAll(require("fs"), { suffix: "Async" });
var path = require('path');
var moment = require('moment');

const years = R.range(2000, 2016);
const root = "http://www.supremecourt.gov/oral_arguments/argument_transcript/";


const rowWork = (window, row) => {

  var tds = window.$("td", row);
  // console.log(tds);
  if (tds.length != 2) return false;
  // var content = tds[0].innerHTML;
  var link = window.$("a", tds[0]);
  // console.log(link);
  var code = link.text().trim();
  // var title = window.$("span", tds[0]).children[0].innerHTML;
  if (!code) return false;
  var title = window.$("span", tds[0]).text();
  // debugger;

  var pathToPDF = link.attr('href');
  var dateArgued = tds[1].innerHTML;
  var fullPath = root + pathToPDF;
  var fullFilename = 'data/' + dateArgued.replace(/\//g, '-') + '.' + code + title.replace(/\s+/g, '_') + '.pdf';
  console.log(code, title, dateArgued, pathToPDF, fullFilename);
  // console.log(year, code, title, dateArgued, pathToPDF, fullFilename);


  // return fs.statAsync(fullFilename).then((stat) => {
  //   console.log(fullFilename + ' already exists');
  // }).catch((err) => {
  //   // good case
  //   if (err.code == 'ENOENT') {

  //     var file = fs.createWriteStream(fullFilename);
  //     var request = http.get(pathToPDF, function(response) {
  //       response.pipe(file);
  //       console.log('Wrote ' + fullFilename);
  //     });

  //   } else {
  //     console.log('Some other error: ', err.code);
  //   }
  // });


  const date = moment(dateArgued, "MM/DD/YYYY").toISOString();

  return {
    code,
    title,
    date,
    pathToPDF,
    fullFilename
  }
}




const getFilesFromYear = (year) => {
  return new Promise(function(resolve, reject) {

    var path = root + year;
    jsdom.env(
      path,
      ["http://code.jquery.com/jquery.js"],
      function(err, window) {
        var rows = window.$("tr");
        // resolve(rows.length);
        var datas = [];
        for (var i = 0; i < rows.length; i++) {
          datas.push(rowWork(window, rows[i]));
        }
        // var cleanedData = R.filter(R.identity, datas);
        resolve(Promise.all(datas, { concurreny: 2 }));
      }
    );

  });
}


Promise.map(years, getFilesFromYear, { concurreny: 2 }).then((results) => {
  console.log(results);
});





