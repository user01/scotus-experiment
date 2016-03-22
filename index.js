


var jsdom = require("jsdom");
var R = require('ramda');
var http = require('http');
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');

var years = R.range(2000, 2016);
var root = "http://www.supremecourt.gov/oral_arguments/argument_transcript/";


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


  fs.stat(fullFilename, function(err, stat) {
    if (err == null) {
      console.log(fullFilename + ' already exists');
    } else if (err.code == 'ENOENT') {

      var file = fs.createWriteStream(fullFilename);
      var request = http.get(pathToPDF, function(response) {
        response.pipe(file);
        console.log('Wrote ' + fullFilename);
      });

    } else {
      console.log('Some other error: ', err.code);
    }
  });


  const date = moment(dateArgued, "MM/DD/YYYY");

  return {
    code,
    title,
    date,
    pathToPDF,
    fullFilename
  }
}







R.forEach((year) => {
  var path = root + year;

  jsdom.env(
    path,
    ["http://code.jquery.com/jquery.js"],
    function(err, window) {
      var rows = window.$("tr");
      var datas = [];
      for (var i = 0; i < rows.length; i++) {
        datas.push(rowWork(window, rows[i]));
      }
      var cleanedData = R.filter(R.identity,datas);
    }
  );
}, years);




