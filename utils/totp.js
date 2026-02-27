// utils/totp.js

/* SHA1 implementation (Simplified for TOTP) */
function rstr2binb(str) {
  var bin = Array(str.length >> 2);
  for (var i = 0; i < bin.length; i++) bin[i] = 0;
  for (var i = 0; i < str.length * 8; i += 8)
    bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xFF) << (24 - i % 32);
  return bin;
}

function binb2rstr(bin) {
  var str = "";
  for (var i = 0; i < bin.length * 32; i += 8)
    str += String.fromCharCode((bin[i >> 5] >>> (24 - i % 32)) & 0xFF);
  return str;
}

function binb_sha1(x, len) {
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;
  var w = Array(80);
  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878, e = -1009589776;
  for (var i = 0; i < x.length; i += 16) {
    var olda = a, oldb = b, oldc = c, oldd = d, olde = e;
    for (var j = 0; j < 80; j++) {
      if (j < 16) w[j] = x[i + j];
      else w[j] = bit_rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      var t = safe_add(safe_add(bit_rol(a, 5), sha1_ft(j, b, c, d)), safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d; d = c; c = bit_rol(b, 30); b = a; a = t;
    }
    a = safe_add(a, olda); b = safe_add(b, oldb); c = safe_add(c, oldc); d = safe_add(d, oldd); e = safe_add(e, olde);
  }
  return [a, b, c, d, e];
}

function sha1_ft(t, b, c, d) {
  if (t < 20) return (b & c) | ((~b) & d);
  if (t < 40) return b ^ c ^ d;
  if (t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

function sha1_kt(t) {
  return (t < 20) ? 1518500249 : (t < 40) ? 1859775393 : (t < 60) ? -1894007588 : -899497514;
}

function safe_add(x, y) {
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

function bit_rol(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}

function rstr_hmac_sha1(key, data) {
  var bkey = rstr2binb(key);
  if (bkey.length > 16) bkey = binb_sha1(bkey, key.length * 8);
  var ipad = Array(16), opad = Array(16);
  for (var i = 0; i < 16; i++) {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }
  var hash = binb_sha1(ipad.concat(rstr2binb(data)), 512 + data.length * 8);
  return binb2rstr(binb_sha1(opad.concat(hash), 512 + 160));
}

/* Base32 Decode */
function base32tohex(base32) {
  var base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var bits = "";
  var hex = "";
  base32 = base32.replace(/=+$/, "").toUpperCase(); // Remove padding
  for (var i = 0; i < base32.length; i++) {
    var val = base32chars.indexOf(base32.charAt(i));
    if (val === -1) throw new Error("Invalid Base32 character");
    bits += ("00000" + val.toString(2)).slice(-5);
  }
  for (var i = 0; i < bits.length - 3; i += 4) {
    var chunk = bits.substr(i, 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/* TOTP Generation Logic */
function getCode(secret) {
  try {
    var key = base32tohex(secret);
    var epoch = Math.round(new Date().getTime() / 1000.0);
    var time = ("0000000000000000" + (Math.floor(epoch / 30)).toString(16)).slice(-16);

    // Convert hex key and time to raw string for HMAC
    var keyStr = "";
    for(var i=0; i<key.length; i+=2) keyStr += String.fromCharCode(parseInt(key.substr(i, 2), 16));

    var timeStr = "";
    for(var i=0; i<time.length; i+=2) timeStr += String.fromCharCode(parseInt(time.substr(i, 2), 16));

    var hmac = rstr_hmac_sha1(keyStr, timeStr);

    // Convert HMAC to hex
    var hex = "";
    for(var i=0; i<hmac.length; i++) {
        hex += ("0" + hmac.charCodeAt(i).toString(16)).slice(-2);
    }

    var offset = parseInt(hex.substring(hex.length - 1), 16);
    var otp = (parseInt(hex.substr(offset * 2, 8), 16) & 0x7fffffff) + "";
    otp = (otp).substr(otp.length - 6, 6);

    // Padding if less than 6 digits
    while(otp.length < 6) otp = "0" + otp;

    return otp;
  } catch (e) {
    console.error(e);
    return "ERROR";
  }
}

function getRemainingSeconds() {
  return 30 - (Math.round(new Date().getTime() / 1000.0) % 30);
}

module.exports = {
  getCode: getCode,
  getRemainingSeconds: getRemainingSeconds
}
