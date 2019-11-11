const exec = require('child_process').exec;
const querystring = require('querystring');
const fs = require('fs');
const cheerio = require('cheerio');
const url = require('url');

module.exports = {curl, array_clean, str_clean, save_log, append, serialize_post, jquery,base64_encode, base64_decode, strip_html, parse_url, list_file};

function curl(link, options) {
  if(!options) options = {};

  if(typeof options.redirect == 'undefined') options.redirect = true;
  else options.redirect = options.redirect;

  if(typeof link == 'string') options.url = link;
  else options.url = link;
  let url = options.url;
  let referer = (options.referer) ? `-e '${options.referer};auto' ` : `-e ';auto' `;
  let useragent = (options.useragent) ? `-A '${options.useragent}' ` : `-A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.100 Safari/537.36' `;
  let headers = (options.headers) ? obj_to_headers(options.headers) : '';
  let head_only = (options.head_only) ? '-I ' : '';
  let post = (options.post) ? `-d '${obj_to_post(options.post)}' ` : '';
  let include = '-i '; // (options.include) ? '-i ' : '';
  let cookie = (options.cookie) ? `-H 'Cookie: ${options.cookie}' ` : '';
  let location = (options.redirect) ? '-L ' : '';
  let method = (options.method) ? `-X ${options.method} ` : '';
  let ipv6 = (options.ipv6) ? `-6 ` : '';
  let command = `curl -g ${ipv6+useragent+head_only+include+headers+cookie+location+post+referer+method}'${url}'`;
  if(options.debug) console.log(command);
  return new Promise((resolve, reject) => {
    exec(command,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) {
        err = parseErr(err);
        if(err.error != 56) reject(err)
      }
      let output = '';
      try {
        output = parse_res(res, options.cookie, url);
      } catch (e) {
        reject(res);
      }
      resolve(output);
    })
  });
}

function parseErr(err) {
  let out = err.message.match(/curl:+.+/g);
  if(out) {
    try {
      let code = out[0].match(/curl:+\s\(\d+\)/g);
      code = code[0].match(/\d+/g);
      code = code[0];
      let message = out[0].replace(/curl:+\s\(\d+\)/g, '');
      return {error: code, message: message};
    } catch (e) {
      return {error: 1, message: out[0]};
    }
  }
  return err;
}

function parse_res(res, cookie_obj, req_url) {
  let location = res.match(/Location:\ +.+/g);
  if(location) req_url = location[location.length - 1].replace('Location: ', '');
  res = res.split('\r\n\r\n');
  let headers, body = [];
  res.forEach((item) => {
    if(/HTTP/.test(item.substring(0,4))) headers = item;
    else body.push(item);
  });
  body = str_clean(array_clean(body).join('\n'));

  let headers_obj = headers_to_object(headers);
  if(cookie_obj) {
    cookie_obj = append(cookie_to_object(cookie_obj), cookie_to_object(get_cookie(headers_obj)))
  } else cookie_obj = cookie_to_object(get_cookie(headers_obj));
  let cookie = obj_to_cookie(cookie_obj);
  return {headers, headers_obj, cookie, cookie_obj, body, req_url};
}

function obj_to_post(post) {
  if(typeof post == 'string') return post;
  let output = '';
  for (var key in post) {
    if (post.hasOwnProperty(key)) {
      output += `${urlEncode(key)}=${urlEncode(post[key])}&`;
    }
  }
  return output;
}
function obj_to_headers(headers) {
  let output = '';
  for (var key in headers) {
    if (headers.hasOwnProperty(key)) {
      output += `-H '${key.toLowerCase()}: ${headers[key]}' `;
    }
  }
  return output;
}

String.prototype.uppercase_first_letter = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

function get_cookie(headers) {
  let cookie = (headers['Set-Cookie']) ? headers['Set-Cookie'] : '';
  if (cookie) return cookie;
  if (headers['set-cookie']) return headers['set-cookie'];
  return '';
}

function cookie_to_object(str) {
  str = str.split(';');
  let output = {};
  str.forEach((item) => {
    let index = item.indexOf('=');
    let key = item.substr(0, index).trim();
    let value = item.substr(index+1).trim();
    if(key) output[key] = value;
  })
  return output;
}

function obj_to_cookie(cookie) {
  let output = '';
  for (var key in cookie) {
    if (cookie.hasOwnProperty(key)) {
      output += `${key}=${cookie[key]}; `;
    }
  }
  return output;
}

function headers_to_object(str) {
  str = str.split('\r\n');
  str = str.splice(1, str.length);
  let output = {};
  str.forEach((item) => {
    let index = item.indexOf(': ');
    let key = item.substr(0,index);
    let value = item.substr(index+2);
    if(typeof output[key] != 'undefined') {
      if(key.toLowerCase() == 'set-cookie') {
        output[key] = output[key] + '; ' + value ;
      } else {
        output[key] = output[key] + value ;
      }
    } else output[key] = value;
  })
  return output;
}

function append(obj, new_obj) {
  let output = {};
  for (let key in new_obj) {
    if (new_obj.hasOwnProperty(key)) {
      if(Array.isArray(new_obj[key])) {
        append(obj[key] , new_obj[key])
      } else if(typeof new_obj[key] == 'object') {
        if(obj[key]) {
          append(obj[key], new_obj[key]);
        } else {
          obj[key] = {};
          append(obj[key], new_obj[key]);
        }
      } else {
        obj[key] = new_obj[key];
      }
    }
  }
  return obj;
}

function save_log(data, file_name) {
  if(typeof data === 'object') data = JSON.stringify(data);
  fs.writeFileSync(`${file_name}`, data);
}

function array_clean(arr) {
  output = [];
  arr.forEach((item, index) => {
    if(item) output.push(item);
  });
  return output;
}

function str_clean(str) {
  return str.replace(/\s\s+/g, '');
}

function serialize_post(res) {
  let $ = cheerio.load(res.body);
  let posts = $('form').serializeArray();
  let post = {};
  posts.forEach((item) => {
    post[item.name] = item.value;
  });
  return post;
}

function urlEncode(str){
    str=escape(str);
    str=str.replace(new RegExp('\\+','g'),'%2B');
    return str.replace(new RegExp('%20','g'),'+');
}

function jquery(str) {
  return cheerio.load(str);
}

function base64_encode(str) {
  return new Buffer(str).toString('base64')
}

function base64_decode(str) {
  return new Buffer(str, 'base64').toString('ascii')
}

function strip_html(str) {
  return str.replace(/<(?:[^>=]|='[^']*'|="[^"]*"|=[^'"][^\s>]*)*>/g, "");
}

function parse_url(link) {
  return url.parse(link);
}

function list_file(dir) {
  return  fs.readdirSync(dir);
}
