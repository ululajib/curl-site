const { curl } = require('../src/index.js')

curl('http://example.com/')
  .then((response) => {
    console.log(response);
  })
