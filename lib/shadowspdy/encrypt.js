// Generated by CoffeeScript 1.7.1

/*
  Copyright (c) 2014 clowwindy
 
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
 
  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
 
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
 */

(function() {
  var EVP_BytesToKey, ShadowStream, bytes_to_key_results, crypto, getCipherLen, int32Max, method_supported, stream, tls, to_buffer, util,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  crypto = require("crypto");

  tls = require("tls");

  util = require("util");

  stream = require('stream');

  int32Max = Math.pow(2, 32);

  bytes_to_key_results = {};

  EVP_BytesToKey = function(password, key_len, iv_len) {
    var count, d, data, i, iv, key, m, md5, ms;
    password = to_buffer(password);
    if (bytes_to_key_results[password]) {
      return bytes_to_key_results[password];
    }
    m = [];
    i = 0;
    count = 0;
    while (count < key_len + iv_len) {
      md5 = crypto.createHash('md5');
      data = password;
      if (i > 0) {
        data = Buffer.concat([m[i - 1], password]);
      }
      md5.update(data);
      d = to_buffer(md5.digest());
      m.push(d);
      count += d.length;
      i += 1;
    }
    ms = Buffer.concat(m);
    key = ms.slice(0, key_len);
    iv = ms.slice(key_len, key_len + iv_len);
    bytes_to_key_results[password] = [key, iv];
    return [key, iv];
  };

  to_buffer = function(input) {
    if (input.copy != null) {
      return input;
    } else {
      return new Buffer(input, 'binary');
    }
  };

  method_supported = {
    'aes-128-cfb': [16, 16],
    'aes-192-cfb': [24, 16],
    'aes-256-cfb': [32, 16],
    'bf-cfb': [16, 8],
    'camellia-128-cfb': [16, 16],
    'camellia-192-cfb': [24, 16],
    'camellia-256-cfb': [32, 16],
    'cast5-cfb': [16, 8],
    'des-cfb': [8, 8],
    'idea-cfb': [16, 8],
    'rc2-cfb': [16, 8],
    'rc4': [16, 0],
    'seed-cfb': [16, 16]
  };

  getCipherLen = function(method) {
    var m;
    method = method.toLowerCase();
    m = method_supported[method];
    return m;
  };

  ShadowStream = (function(_super) {
    __extends(ShadowStream, _super);

    function ShadowStream(source, method, password) {
      var iv_, m, self, _ref;
      ShadowStream.__super__.constructor.call(this);
      if (!(method in method_supported)) {
        throw new Error("method " + method + " not supported");
      }
      method = method.toLowerCase();
      this._source = source;
      this._method = method;
      this._password = password;
      this._IVSent = false;
      this._IVBytesReceived = 0;
      m = getCipherLen(method);
      _ref = EVP_BytesToKey(password, m[0], m[1]), this._key = _ref[0], iv_ = _ref[1];
      this._sendIV = crypto.randomBytes(m[1]);
      this._cipher = crypto.createCipheriv(method, this._key, this._sendIV);
      this._receiveIV = new Buffer(m[1]);
      this._IVBytesToReceive = m[1];
      this.timeout = source.timeout;
      self = this;
      source.on('connect', function() {
        return self.emit('connect');
      });
      source.on('end', function() {
        return self.push(null);
      });
      source.on('readable', function() {
        return self.read(0);
      });
      source.on('error', function(err) {
        return self.emit('error', err);
      });
      source.on('timeout', function() {
        return self.emit('timeout');
      });
      source.on('close', function(hadError) {
        return self.emit('close', hadError);
      });
    }

    ShadowStream.prototype._read = function(bytes) {
      var chunk, cipher, decipherStart, plain;
      chunk = this._source.read();
      if (chunk === null) {
        return this.push('');
      }
      if (chunk.length === 0) {
        return this.push(chunk);
      }
      decipherStart = 0;
      if (this._IVBytesReceived < this._IVBytesToReceive) {
        decipherStart = chunk.copy(this._receiveIV, this._IVBytesReceived);
        this._IVBytesReceived += decipherStart;
      }
      if (this._IVBytesReceived < this._IVBytesToReceive) {
        return;
      }
      if (this._decipher == null) {
        this._decipher = crypto.createDecipheriv(this._method, this._key, this._receiveIV);
      }
      if (decipherStart > 0) {
        cipher = chunk.slice(decipherStart);
      } else {
        cipher = chunk;
      }
      if (cipher.length > 0) {
        plain = this._decipher.update(cipher);
        return this.push(plain);
      }
    };

    ShadowStream.prototype._write = function(chunk, encoding, callback) {
      var cipher, e;
      if (chunk instanceof String) {
        chunk = new Buffer(chunk, encoding);
      }
      try {
        cipher = this._cipher.update(chunk);
        if (!this._IVSent) {
          this._IVSent = true;
          cipher = Buffer.concat([this._sendIV, cipher]);
        }
        this._source.write(cipher);
      } catch (_error) {
        e = _error;
        return callback(e);
      }
      return callback();
    };

    ShadowStream.prototype.end = function(data) {
      if ((data != null) && data.length > 0) {
        data = this._cipher.update(data);
        if (!this._IVSent) {
          this._IVSent = true;
          data = Buffer.concat([this._sendIV, data]);
        }
        return this._source.end(cipher);
      } else {
        return this._source.end;
      }
    };

    ShadowStream.prototype.destroy = function() {
      return this._source.destroy();
    };

    ShadowStream.prototype.setTimeout = function(timeout) {
      return this._source.setTimeout(timeout);
    };

    return ShadowStream;

  })(stream.Duplex);

  exports.ShadowStream = ShadowStream;

}).call(this);
