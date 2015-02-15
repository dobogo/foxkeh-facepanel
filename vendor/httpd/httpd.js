'use strict';

/* Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 */
/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
* An implementation of an HTTP server.
*/

/* global dump */
/* jshint multistr: true */

//'use strict';

/** True if debugging output is enabled, false otherwise. */
var DEBUG = false; // non-const *only* so tweakable in server tests
var DEBUG_LOG = false;

/** True if debugging output should be timestamped. */
var DEBUG_TIMESTAMP = false; // non-const so tweakable in server tests

var DUMP_REQUEST_HEADER = false;
var DUMP_REQUEST_BODY = false;
var DUMP_RESPONSE_HEADER = false;
var DUMP_RESPONSE_BODY = false;
var DUMP_MESSAGE_TIMESTAMP = false;

/**
* Asserts that the given condition holds.  If it doesn't, the given message is
* dumped, a stack trace is printed, and an exception is thrown to attempt to
* stop execution (which unfortunately must rely upon the exception not being
* accidentally swallowed by the code that uses it).
*/
function NS_ASSERT(cond, msg)
{
  if (DEBUG && !cond)
  {
    dumpn('###!!!');
    dumpn('###!!! ASSERTION' + (msg ? ': ' + msg : '!'));
    dumpn('###!!! Stack follows:');

    var stack = new Error().stack.split(/\n/);
    dumpn(stack.map(function(val) { return '###!!!   ' + val; }).join('\n'));

    throw 'Cr.NS_ERROR_ABORT';
  }
}

/** Constructs an HTTP error object. */
var HttpError = function HttpError(code, description)
{
  this.code = code;
  this.description = description;
};

HttpError.prototype =
{
  toString: function()
  {
    return this.code + ' ' + this.description;
  }
};

/**
* Errors thrown to trigger specific HTTP server responses.
*/
var HTTP_400 = new HttpError(400, 'Bad Request');
var HTTP_403 = new HttpError(403, 'Forbidden');
var HTTP_404 = new HttpError(404, 'Not Found');

var HTTP_500 = new HttpError(500, 'Internal Server Error');
var HTTP_501 = new HttpError(501, 'Not Implemented');

/** Creates a hash with fields corresponding to the values in arr. */
function array2obj(arr)
{
  var obj = {};
  for (var i = 0; i < arr.length; i++)
  {
    obj[arr[i]] = arr[i];
  }
  return obj;
}

/** Returns an array of the integers x through y, inclusive. */
function range(x, y)
{
  var arr = [];
  for (var i = x; i <= y; i++)
  {
    arr.push(i);
  }
  return arr;
}

/** An object (hash) whose fields are the numbers of all HTTP error codes. */
const HTTP_ERROR_CODES = array2obj(range(400, 417).concat(range(500, 505)));

/** Base for relative timestamps produced by dumpn(). */
var firstStamp = 0;

/** dump(str) with a trailing '\n' -- only outputs if DEBUG. */
function dumpn(str)
{
  if (DEBUG)
  {
    var prefix = 'HTTPD-INFO | ';
    if (DEBUG_TIMESTAMP)
    {
      if (firstStamp === 0)
      {
        firstStamp = Date.now();
      }

      var elapsed = Date.now() - firstStamp; // milliseconds
      var min = Math.floor(elapsed / 60000);
      var sec = (elapsed % 60000) / 1000;

      if (sec < 10)
      {
        prefix += min + ':0' + sec.toFixed(3) + ' | ';
      }
      else
      {
        prefix += min + ':' + sec.toFixed(3) + ' | ';
      }
    }

    dump(prefix + str + '\n');
  }
}

function dumpSysTime(str)
{
  if (DUMP_MESSAGE_TIMESTAMP) {
    var curTime = (+new Date());
    console.log('SysTm(' + curTime + '):' + str);
  }
}

function log(msg)
{
  if (DEBUG_LOG) {
    console.log('[HTTPD]:' + msg);
  }
}

/**
* Returns the RFC 822/1123 representation of a date.
*
* @param date : Number
*   the date, in milliseconds from midnight (00:00:00), January 1, 1970 GMT
* @returns string
*   the representation of the given date
*/
function toDateString(date)
{
  //
  // rfc1123-date = wkday ',' SP date1 SP time SP 'GMT'
  // date1        = 2DIGIT SP month SP 4DIGIT
  //                ; day month year (e.g., 02 Jun 1982)
  // time         = 2DIGIT ':' 2DIGIT ':' 2DIGIT
  //                ; 00:00:00 - 23:59:59
  // wkday        = 'Mon' | 'Tue' | 'Wed'
  //              | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  // month        = 'Jan' | 'Feb' | 'Mar' | 'Apr'
  //              | 'May' | 'Jun' | 'Jul' | 'Aug'
  //              | 'Sep' | 'Oct' | 'Nov' | 'Dec'
  //

  const wkdayStrings = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthStrings = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /**
  * Processes a date and returns the encoded UTC time as a string according to
  * the format specified in RFC 2616.
  *
  * @param date : Date
  *   the date to process
  * @returns string
  *   a string of the form 'HH:MM:SS', ranging from '00:00:00' to '23:59:59'
  */
  function toTime(date)
  {
    var hrs = date.getUTCHours();
    var rv  = (hrs < 10) ? '0' + hrs : hrs;

    var mins = date.getUTCMinutes();
    rv += ':';
    rv += (mins < 10) ? '0' + mins : mins;

    var secs = date.getUTCSeconds();
    rv += ':';
    rv += (secs < 10) ? '0' + secs : secs;

    return rv;
  }

  /**
  * Processes a date and returns the encoded UTC date as a string according to
  * the date1 format specified in RFC 2616.
  *
  * @param date : Date
  *   the date to process
  * @returns string
  *   a string of the form 'HH:MM:SS', ranging from '00:00:00' to '23:59:59'
  */
  function toDate1(date)
  {
    var day = date.getUTCDate();
    var month = date.getUTCMonth();
    var year = date.getUTCFullYear();

    var rv = (day < 10) ? '0' + day : day;
    rv += ' ' + monthStrings[month];
    rv += ' ' + year;

    return rv;
  }

  date = new Date(date);

  const fmtString = '%wkday%, %date1% %time% GMT';
  var rv = fmtString.replace('%wkday%', wkdayStrings[date.getUTCDay()]);
  rv = rv.replace('%time%', toTime(date));
  return rv.replace('%date1%', toDate1(date));
}

/**
* Determines whether the given character code is a CTL.
*
* @param code : uint
*   the character code
* @returns boolean
*   true if code is a CTL, false otherwise
*/
function isCTL(code)
{
  return (code >= 0 && code <= 31) || (code == 127);
}


// Response CONSTANTS

// token       = *<any CHAR except CTLs or separators>
// CHAR        = <any US-ASCII character (0-127)>
// CTL         = <any US-ASCII control character (0-31) and DEL (127)>
// separators  = '(' | ')' | '<' | '>' | '@'
//             | ',' | ';' | ':' | '\' | <'>
//             | '/' | '[' | ']' | '?' | '='
//             | '{' | '}' | SP  | HT
const IS_TOKEN_ARRAY =
  [0, 0, 0, 0, 0, 0, 0, 0, //   0
   0, 0, 0, 0, 0, 0, 0, 0, //   8
   0, 0, 0, 0, 0, 0, 0, 0, //  16
   0, 0, 0, 0, 0, 0, 0, 0, //  24

   0, 1, 0, 1, 1, 1, 1, 1, //  32
   0, 0, 1, 1, 0, 1, 1, 0, //  40
   1, 1, 1, 1, 1, 1, 1, 1, //  48
   1, 1, 0, 0, 0, 0, 0, 0, //  56

   0, 1, 1, 1, 1, 1, 1, 1, //  64
   1, 1, 1, 1, 1, 1, 1, 1, //  72
   1, 1, 1, 1, 1, 1, 1, 1, //  80
   1, 1, 1, 0, 0, 0, 1, 1, //  88

   1, 1, 1, 1, 1, 1, 1, 1, //  96
   1, 1, 1, 1, 1, 1, 1, 1, // 104
   1, 1, 1, 1, 1, 1, 1, 1, // 112
   1, 1, 1, 0, 1, 0, 1];   // 120


/**
* A container for utility functions used with HTTP headers.
*/
const headerUtils =
{
  /**
  * Normalizes fieldName (by converting it to lowercase) and ensures it is a
  * valid header field name (although not necessarily one specified in RFC
  * 2616).
  *
  * @throws NS_ERROR_INVALID_ARG
  *   if fieldName does not match the field-name production in RFC 2616
  * @returns string
  *   fieldName converted to lowercase if it is a valid header, for characters
  *   where case conversion is possible
  */
  normalizeFieldName: function(fieldName)
  {
    if (fieldName === '')
    {
      throw 'normalizeFieldName(): empty fieldName';
    }

    for (var i = 0, sz = fieldName.length; i < sz; i++)
    {
      if (!IS_TOKEN_ARRAY[fieldName.charCodeAt(i)])
      {
        throw 'normalizeFieldName(): ' + fieldName +
              ' is not a valid header field name!';
      }
    }

    return fieldName.toLowerCase();
  },

  /**
  * Ensures that fieldValue is a valid header field value (although not
  * necessarily as specified in RFC 2616 if the corresponding field name is
  * part of the HTTP protocol), normalizes the value if it is, and
  * returns the normalized value.
  *
  * @param fieldValue : string
  *   a value to be normalized as an HTTP header field value
  * @throws NS_ERROR_INVALID_ARG
  *   if fieldValue does not match the field-value production in RFC 2616
  * @returns string
  *   fieldValue as a normalized HTTP header field value
  */
  normalizeFieldValue: function(fieldValue)
  {
    // field-value    = *( field-content | LWS )
    // field-content  = <the OCTETs making up the field-value
    //                  and consisting of either *TEXT or combinations
    //                  of token, separators, and quoted-string>
    // TEXT           = <any OCTET except CTLs,
    //                  but including LWS>
    // LWS            = [CRLF] 1*( SP | HT )
    //
    // quoted-string  = ( <'> *(qdtext | quoted-pair ) <'> )
    // qdtext         = <any TEXT except <'>>
    // quoted-pair    = '\' CHAR
    // CHAR           = <any US-ASCII character (octets 0 - 127)>

    // Any LWS that occurs between field-content MAY be replaced with a single
    // SP before interpreting the field value or forwarding the message
    // downstream (section 4.2); we replace 1*LWS with a single SP
    var val = fieldValue.replace(/(?:(?:\r\n)?[ \t]+)+/g, ' ');

    // remove leading/trailing LWS (which has been converted to SP)
    val = val.replace(/^ +/, '').replace(/ +$/, '');

    // that should have taken care of all CTLs, so val should contain no CTLs
    dumpn('*** Normalized value: \'' + val + '\'');
    for (var i = 0, len = val.length; i < len; i++)
    {
      if (isCTL(val.charCodeAt(i)))
      {
        throw 'normalizedFieldValue(): *** Char ' + i +
              ' has charcode ' + val.charCodeAt(i);
      }
    }
    // XXX disallows quoted-pair where CHAR is a CTL -- will not invalidly
    //     normalize, however, so this can be construed as a tightening of the
    //     spec and not entirely as a bug
    return val;
  }
};

/**
* Instantiates a new HTTP server.
*/
function HttpServer()
{
  /** The port on which this server listens. */
  this._port = undefined;

  /** The host  **/
  this._host = undefined;

  /** The socket associated with this. */
  this._socket = null;

  /** The handler used to process requests to this server. */
  this._handler = new ServerHandler(this);

  /** Naming information for this server. */
  this._identity = new ServerIdentity();

  /**
  * Indicates when the server is to be shut down at the end of the request.
  */
  this._doQuit = false;

  log('[' + 'nsHttpServer' + '] ' + 'Finish Constructor');
}

HttpServer.prototype =
{
  // NSISERVERSOCKETLISTENER

  /**
  * Processes an incoming request coming in on the given socket and contained
  * in the given transport.
  *
  * @param socket : nsIServerSocket
  *   the socket through which the request was served
  * @param trans : nsISocketTransport
  *   the transport for the request/response
  * @see nsIServerSocketListener.onSocketAccepted
  */
  _onSocketAccepted: function()
  {
    var that = this;
    log('[' + '_onSocketAccepted' + '] ' +'Start');
    var onaccept = function onaccept(tcpsock)
    {
      log('[' + 'onconnect' + '] ' +'Start');
      var conn = new MyConnection(that, that._socket.localPort ||
                                  that._socket.port, tcpsock);
      log('[' + 'onconnect' + '] ' +'creating request reader ');
      var reader = new RequestReader(conn);
      log('[' + 'onconnect' + '] ' +'setting _onData(tcpsock)');
      reader._onData(tcpsock);
      log('[' + 'onconnect' + '] ' +'done');
    };

    that._socket.onconnect = onaccept;
    log('[' + '_onSocketAccepted' + '] ' +'End');
  },

  // NSIHTTPSERVER

  //
  // see nsIHttpServer.start
  //
  start: function(port)
  {
    this._start(port, 'localhost');
  },

  _start: function _start(port, host)
  {
    if (this._socket)
    {
      throw 'Cr.NS_ERROR_ALREADY_INITIALIZED';
    }

    this._port = port;
    this._doQuit = false;
    this._host = host;
    var options = { binaryType: 'arraybuffer' };

    try
    {
      var serversocket = navigator.mozTCPSocket.listen(port, options);

      log('[' + '_start' + '] ' +
          'call _identity._initialize with ' +
          'port = ' + port +
          ', host = ' + host +
          ', True');
      this._identity._initialize(port, host, true);
      log('[' + '_start' + '] ' +'set _socket = ' + serversocket);
      this._socket = serversocket;
      log('[' + '_start' + '] ' +'End');
    }
    catch (e)
    {
      dumpn('!!! could not start server on port ' + port + ': ' + e);
      throw '!!! could not start server on port ' + port + ': ' + e;
    }

    this._onSocketAccepted();
  },

  //
  // see nsIHttpServer.stop
  //
  stop: function HSstop(callback)
  {
    if (!callback)
    {
      throw 'Cr.NS_ERROR_NULL_POINTER';
    }
    if (!this._socket)
    {
      throw 'Cr.NS_ERROR_UNEXPECTED';
    }
    log('[' + 'HSstop' + '] ' +'Start:');
    this._stopCallback = typeof callback === 'function' ?
      callback : function() { callback.onStopped(); };
    this._socket.close();
    this._socket = null;

    // We can't have this identity any more, and the port on which we're running
    // this server now could be meaningless the next time around.
    log('[' + 'HSstop' + '] ' +'this._identity._teardown()');
    this._identity._teardown();
    this._doQuit = false;
    log('[' + 'HSstop' + '] ' +'done');
    // socket-close notification and pending request completion happen async
  },

  //param: 'string' or 'function'
  //       ->Set 'string' is 2nd arg for registerAppDirectory() or
  //         registerSdcardDirectory().
  //       ->Set 'function' is 2nd arg for registerPathHandler().
  get: function(path, param)
  {
    if (path == null && param == null)
    {
      log('get() parameter error');
      throw 'Cr.7777 NS_ERROR_INVALID_ARG';
    }

    if (typeof param == 'function')
    {
      log('get() registerPathHandler');
      this._handler.registerPathHandler(path, param);
    }
    else if (typeof param == 'string')
    {
      var result = param.indexOf('/sdcard');
      if (result === 0)
      {
        log('get() registerSdcardDirectory');
        this._handler.registerSdcardDirectory(path, param);
      }
      else
      {
        log('get() registerAppDirectory');
        this._handler.registerAppDirectory(path, param);
      }
    }
    else
    {
      log('get() set error data-type');
      throw 'Cr.7777 NS_ERROR_INVALID_ARG';
    }
  },
  
  //
  // see nsIHttpServer.registerAppDirectory
  //
  registerAppDirectory: function(path, directory)
  {
    this._handler.registerAppDirectory(path, directory);
  },

  //
  // see nsIHttpServer.registerSdcardDirectory
  //
  registerSdcardDirectory: function(path, directory)
  {
    this._handler.registerSdcardDirectory(path, directory);
  },

  //
  // see nsIHttpServer.registerPathHandler
  //
  registerPathHandler: function registerPathHandler(path, handler)
  {
    log('[' + 'registerPathHandler' + '] ' +
        'call _handler.registerPathHandler');
    this._handler.registerPathHandler(path, handler);
  },

  //
  // see nsIHttpServer.registerPrefixHandler
  //
  registerPrefixHandler: function(prefix, handler)
  {
    this._handler.registerPrefixHandler(prefix, handler);
  },

  //
  // see nsIHttpServer.serverIdentity
  //
  get identity()
  {
    return this._identity;
  },

  // PRIVATE IMPLEMENTATION

  /** Calls the server-stopped callback provided when stop() was called. */
  _notifyStopped: function()
  {
    NS_ASSERT(this._stopCallback !== null, 'double-notifying?');

    //
    // NB: We have to grab this now, null out the member, *then* call the
    //     callback here, or otherwise the callback could (indirectly) futz with
    //     this._stopCallback by starting and immediately stopping this, at
    //     which point we'd be nulling out a field we no longer have a right to
    //     modify.
    //
    var callback = this._stopCallback;
    if (typeof callback !== 'function') {
      log('_stopCallback not set callback');
      return;
    }
    this._stopCallback = null;
    try
    {
      callback();
    }
    catch (e)
    {
      // not throwing because this is specified as being usually (but not
      // always) asynchronous
      dump('!!! error running onStopped callback: ' + e + '\n');
    }
  },

  /**
  * Notifies this server that the given connection has been closed.
  *
  * @param connection : Connection
  *   the connection that was closed
  */
  _connectionClosed: function(connection)
  {
    // Fire a pending server-stopped notification if it's our responsibility.
    this._notifyStopped();
  },

  /**
  * Requests that the server be shut down when possible.
  */
  _requestQuit: function()
  {
    dumpn('>>> requesting a quit');
    this._doQuit = true;
  }
};

//
// RFC 2396 section 3.2.2:
//
// host        = hostname | IPv4address
// hostname    = *( domainlabel '.' ) toplabel [ '.' ]
// domainlabel = alphanum | alphanum *( alphanum | '-' ) alphanum
// toplabel    = alpha | alpha *( alphanum | '-' ) alphanum
// IPv4address = 1*digit '.' 1*digit '.' 1*digit '.' 1*digit
//

const HOST_REGEX =
new RegExp('^(?:' +
  // *( domainlabel '.' )
'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)*' +
  // toplabel
'[a-z](?:[a-z0-9-]*[a-z0-9])?' +
  '|' +
  // IPv4 address
'\\d+\\.\\d+\\.\\d+\\.\\d+' +
')$',
'i');


/**
* Represents the identity of a server.  An identity consists of a set of
* (scheme, host, port) tuples denoted as locations (allowing a single server to
* serve multiple sites or to be used behind both HTTP and HTTPS proxies for any
* host/port).  Any incoming request must be to one of these locations, or it
* will be rejected with an HTTP 400 error.  One location, denoted as the
* primary location, is the location assigned in contexts where a location
* cannot otherwise be endogenously derived, such as for HTTP/1.0 requests.
*
* A single identity may contain at most one location per unique host/port pair;
* other than that, no restrictions are placed upon what locations may
* constitute an identity.
*/
function ServerIdentity()
{
  /** The scheme of the primary location. */
  this._primaryScheme = 'http';

  /** The hostname of the primary location. */
  this._primaryHost = '127.0.0.1';

  /** The port number of the primary location. */
  this._primaryPort = -1;

  /**
  * The current port number for the corresponding server, stored so that a new
  * primary location can always be set if the current one is removed.
  */
  this._defaultPort = -1;

  /**
  * Maps hosts to maps of ports to schemes, e.g. the following would represent
  * https://example.com:789/ and http://example.org/:
  *
  *   {
  *     'xexample.com': { 789: 'https' },
  *     'xexample.org': { 80: 'http' }
  *   }
  *
  * Note the 'x' prefix on hostnames, which prevents collisions with special
  * JS names like 'prototype'.
  */
  this._locations = { 'xlocalhost': {} };
}
ServerIdentity.prototype =
{

  // NSIHTTPSERVERIDENTITY
  // see nsIHttpServerIdentity.add
  //
  add: function(scheme, host, port)
  {
    this._validate(scheme, host, port);

    var entry = this._locations['x' + host];
    if (!entry)
    {
      this._locations['x' + host] = entry = {};
    }

    entry[port] = scheme;
  },

  //
  // see nsIHttpServerIdentity.remove
  //
  remove: function(scheme, host, port)
  {
    this._validate(scheme, host, port);

    var entry = this._locations['x' + host];
    if (!entry)
    {
      return false;
    }

    var present = port in entry;
    delete entry[port];

    if (this._primaryScheme == scheme &&
      this._primaryHost == host &&
      this._primaryPort == port &&
    this._defaultPort !== -1)
    {
      // Always keep at least one identity in existence at any time, unless
      // we're in the process of shutting down (the last condition above).
      this._primaryPort = -1;
      this._initialize(this._defaultPort, host, false);
    }

    return present;
  },
  //
  // see nsIHttpServerIdentity.has
  //
  has: function(scheme, host, port)
  {
    this._validate(scheme, host, port);

    return 'x' + host in this._locations &&
    scheme === this._locations['x' + host][port];
  },

  //
  // see nsIHttpServerIdentity.has
  //
  getScheme: function getScheme(host, port)
  {
    log('[' + 'registerPathHandler' + '] ' +'Start');

    this._validate('http', host, port);

    log('[' + 'getScheme' + '] ' +'validating done');
    var entry = this._locations['x' + host];

    log('[' + 'getScheme' + '] ' + 'End entry is: ' +
          JSON.stringify(entry));

    if (!entry)
    {
      return '';
    }

    log('[' + 'getScheme' + '] ' +'End: getScheme');

    return entry[port] || '';
  },

  //
  // see nsIHttpServerIdentity.setPrimary
  //
  setPrimary: function(scheme, host, port)
  {
    this._validate(scheme, host, port);

    this.add(scheme, host, port);

    this._primaryScheme = scheme;
    this._primaryHost = host;
    this._primaryPort = port;
  },

  // PRIVATE IMPLEMENTATION

  /**
  * Initializes the primary name for the corresponding server, based on the
  * provided port number.
  */

  _initialize: function _initialize(port, host, addSecondaryDefault)
  {
    log('[' + '_initialize' + '] ' +'Start');

    this._host = host;

    if (this._primaryPort !== -1) {
      log('[' + '_initialize' + '] ' +'this._primaryPort !==-1');
      this.add('http', host, port);
    }
    else {
      log('[' + '_initialize' + '] ' +'else (primaryPort is not -1)');
      this.setPrimary('http', 'localhost', port);
    }

    log('[' + '_initialize' + '] ' +'setting _defaultPort..');
    this._defaultPort = port;
    // Only add this if we're being called at server startup
    if (addSecondaryDefault && host != '127.0.0.1') {
      log('[' + '_initialize' + '] ' +
          'addSecondaryDefault && host != 127.0.0.1');
      this.add('http', '127.0.0.1', port);
    }

    log('[' + '_initialize' + '] ' +'End');
  },

  /**
  * Called at server shutdown time, unsets the primary location only if it was
  * the default-assigned location and removes the default location from the
  * set of locations used.
  */

  _teardown: function()
  {
    if (this._host != '127.0.0.1')
    {
      log('[' + '_teardown' + '] ' +
          'this._host != 127.0.0.1 :' + this._host + ':' + this._defaultPort);
      // Not the default primary location, nothing special to do here
      this.remove('http', '127.0.0.1', this._defaultPort);
    }

    // This is a *very* tricky bit of reasoning here; make absolutely sure the
    // tests for this code pass before you commit changes to it.
    if (this._primaryScheme == 'http' &&
      this._primaryHost == this._host &&
    this._primaryPort == this._defaultPort)
    {
      log('[' + '_teardown' + '] ' +
          'this._primaryScheme, Host, Port:' + this._defaultPort);
      // Make sure we don't trigger the readding logic in .remove(), then remove
      // the default location.
      var port = this._defaultPort;
      this._defaultPort = -1;
      this.remove('http', this._host, port);

      // Ensure a server start triggers the setPrimary() path in ._initialize()
      this._primaryPort = -1;
    }
    else
    {
      log('[' + '_teardown' + '] ' +'else:' + this._defaultPort);
      // No reason not to remove directly as it's not our primary location
      this.remove('http', this._host, this._defaultPort);
    }
  },

  /**
  * Ensures scheme, host, and port are all valid with respect to RFC 2396.
  *
  * @throws NS_ERROR_ILLEGAL_VALUE
  *   if any argument doesn't match the corresponding production
  */
  _validate: function(scheme, host, port)
  {
    if (scheme !== 'http' && scheme !== 'https')
    {
      log('[' + '_validate' + '] ' +'scheme:' + scheme);
      dumpn('*** server only supports http/https schemes: \'' + scheme + '\'');
      throw 'Cr.NS_ERROR_ILLEGAL_VALUE';
    }
    if (!HOST_REGEX.test(host))
    {
      log('[' + '_validate' + '] ' +'!HOST_REGEX.test(host):' + host);
      dumpn('*** unexpected host: \'' + host + '\'');
      throw 'Cr.NS_ERROR_ILLEGAL_VALUE';
    }
    if (port < 0 || port > 65535)
    {
      log('[' + '_validate' + '] ' +'port:' + port);
      dumpn('*** unexpected port: \'' + port + '\'');
      throw 'Cr.NS_ERROR_ILLEGAL_VALUE';
    }
  }
};
function MyConnection(server, port, tcpsocket)
{
  this.server = server;
  this.port = port;
  this._tcpsocket = tcpsocket;
}

MyConnection.prototype =
{
  /** Closes this connection's input/output streams. */
  close: function()
  {
    dumpn('*** closing connection ' +
    ' on port ' + this._outgoingPort);

    this._closed = true;

    var server = this.server;
    server._connectionClosed(this);

    // If an error triggered a server shutdown, act on it now
    if (server._doQuit)
    {
      server.stop(
        function() { /* not like we can do anything better */ }
      );
    }
    this._tcpsocket.close();
  },

  /**
  * Initiates processing of this connection, using the data in the given
  * request.
  *
  * @param request : Request
  *   the request which should be processed
  */
  process: function(request)
  {
    NS_ASSERT(!this._closed && !this._processed);

    this._processed = true;

    this.request = request;
    this.server._handler.handleResponse(this);
  },

  /**
  * Initiates processing of this connection, generating a response with the
  * given HTTP error code.
  *
  * @param code : uint
  *   an HTTP code, so in the range [0, 1000)
  * @param request : Request
  *   incomplete data about the incoming request (since there were errors
  *   during its processing
  */
  processError: function(code, request)
  {
    NS_ASSERT(!this._closed && !this._processed);

    this._processed = true;
    this.request = request;
    this.server._handler.handleError(code, this);
  },

  /** Converts this to a string for debugging purposes. */
  toString: function()
  {
    return '<Connection(' +
      (this.request ? ', ' + this.request.path : '') +'): ' +
      (this._closed ? 'closed' : 'open') + '>';
  }
};



/** Request reader processing states; see RequestReader for details. */
const READER_IN_REQUEST_LINE = 0;
const READER_IN_HEADERS      = 1;
const READER_IN_BODY         = 2;
const READER_FINISHED        = 3;


/**
* Reads incoming request data asynchronously, does any necessary preprocessing,
* and forwards it to the request handler.  Processing occurs in three states:
*
*   READER_IN_REQUEST_LINE     Reading the request's status line
*   READER_IN_HEADERS          Reading headers in the request
*   READER_IN_BODY             Reading the body of the request
*   READER_FINISHED            Entire request has been read and processed
*
* During the first two stages, initial metadata about the request is gathered
* into a Request object.  Once the status line and headers have been processed,
* we start processing the body of the request into the Request.  Finally, when
* the entire body has been read, we create a Response and hand it off to the
* ServerHandler to be given to the appropriate request handler.
*
* @param connection : Connection
*   the connection for the request being read
*/
function RequestReader(connection)
{
  /** Connection metadata for this request. */
  this._connection = connection;

  /**
  * A container providing line-by-line access to the raw bytes that make up the
  * data which has been read from the connection but has not yet been acted
  * upon (by passing it to the request handler or by extracting request
  * metadata from it).
  */
  this._data = new LineData();

  /**
  * The amount of data remaining to be read from the body of this request.
  * After all headers in the request have been read this is the value in the
  * Content-Length header, but as the body is read its value decreases to zero.
  */
  this._contentLength = 0;

  /** The current state of parsing the incoming request. */
  this._state = READER_IN_REQUEST_LINE;

  /** Metadata constructed from the incoming request for the request handler */
  this._metadata = new Request(connection.port);

  /**
  * Used to preserve state if we run out of line data midway through a
  * multi-line header.  _lastHeaderName stores the name of the header, while
  * _lastHeaderValue stores the value we've seen so far for the header.
  *
  * These fields are always either both undefined or both strings.
  */
  this._lastHeaderName = this._lastHeaderValue = undefined;
}

RequestReader.prototype =
{
  // NSIINPUTSTREAMCALLBACK

  /**
  * Called when more data from the incoming request is available.  This method
  * then reads the available data from input and deals with that data as
  * necessary, depending upon the syntax of already-downloaded data.
  *
  * @param input : nsIAsyncInputStream
  *   the stream of incoming data from the connection
  */
  _onInputStreamReady: function _onInputStreamReady()
  {
    log('[' + '_onInputStreamReady' + '] ' +'Start');
    var data = this._data;
    if (!data)
    {
      return;
    }
    log('[' + '_onInputStreamReady' + '] ' +
          'switch by state: ' + this._state);
    switch (this._state)
    {
      default:
        log('[' + '_onInputStreamReady' + '] ' +'invalid state');
        break;

      case READER_IN_REQUEST_LINE:
        if (!this._processRequestLine())
        {
          break;
        }
        if (!this._processHeaders())
        {
          break;
        }
        this._processBody();
        break;

      case READER_IN_HEADERS:
        if (!this._processHeaders())
        {
          break;
        }
        this._processBody();
        break;

      case READER_IN_BODY:
        this._processBody();
        break;
    }
    log('[' + '_onInputStreamReady' + '] ' +'done(switch by state)');
  },

  _onData: function _onData(tcpsock)
  {
    var that = this;

    tcpsock.ondata = function tcpsockondata(evt)
    {
      log('[' + '_onData' + '] ' +'received ' + evt.data.byteLength +
      ' bytes data');
      //log('[' + '_onData' + '] ' +'evt: ' + JSON.stringify(evt));

      that._data.appendBytes(new Uint8Array(evt.data));
      that._onInputStreamReady();
    };
  },

  // PRIVATE API

  /**
  * Processes unprocessed, downloaded data as a request line.
  *
  * @returns boolean
  *   true iff the request line has been fully processed
  */
  _processRequestLine: function _processRequestLine()
  {
    log('[' + '_processRequestLine' + '] ' +'Start');

    // Servers SHOULD ignore any empty line(s) received where a Request-Line
    // is expected (section 4.1).
    var data = this._data;
    var line = {};
    var readSuccess;

    log('[' + '_processRequestLine' + '] ' + 'reading lines...');

    while ((readSuccess = data.readLine(line)) && line.value === '')
    {
      dumpn('*** ignoring beginning blank line...');
      log('[' + '_processRequestLine' + '] ' + readSuccess);
    }
    log('[' + '_processRequestLine' + '] ' +'done');

    // if we don't have a full line, wait until we do:
    if (!readSuccess)
    {
      return false;
    }

    // we have the first non-blank line
    try
    {
      log('[' + '_processRequestLine' + '] ' + 'call parseRequestLine');
      this._parseRequestLine(line.value);
      log('[' + '_processRequestLine' + '] ' +
            'return from _parseRequestLine');
      this._state = READER_IN_HEADERS;
      dumpSysTime('Request, ' + this._metadata.path);
      return true;
    }
    catch (e)
    {
      log('[' + '_processRequestLine' + '] ' +'catch error' + e);
      this._handleError(e);
      return false;
    }
    log('[' + '_processRequestLine' + '] ' +'End');
  },


  /**
  * Processes stored data, assuming it is either at the beginning or in
  * the middle of processing request headers.
  *
  * @returns boolean
  *   true iff header data in the request has been fully processed
  */
  _processHeaders: function _processHeaders()
  {
    // XXX things to fix here:
    //
    // - need to support RFC 2047-encoded non-US-ASCII characters
    log('[' + '_processHeaders' + '] ' +'Start');
    try
    {
      log('[' + '_processHeaders' + '] ' +'Start: call _parseHeaders...');
      var done = this._parseHeaders();
      log('[' + '_processHeaders' + '] ' +'back from_parseHeaders');
      if (done)
      {
        log('[' + '_processHeaders' + '] ' +'parseHeaders done');
        var request = this._metadata;

        // XXX this is wrong for requests with transfer-encodings applied to
        //     them, particularly chunked (which by its nature can have no
        //     meaningful Content-Length header)!
        this._contentLength = request.hasHeader('Content-Length') ?
          parseInt(request.getHeader('Content-Length'), 10) : 0;
        dumpn('_processHeaders, Content-length=' + this._contentLength);

        this._state = READER_IN_BODY;
        log('[' + '_processHeaders' + '] ' +'done');
      }
      return done;
    }
    catch (e)
    {
      log('[' + '_processHeaders' + '] ' +'catch error' + e);
      this._handleError(e);
      return false;
    }
    log('[' + '_processHeaders' + '] ' +'End');
  },

  /**
  * Processes stored data, assuming it is either at the beginning or in
  * the middle of processing the request body.
  *
  * @returns boolean
  *   true iff the request body has been fully processed
  */
  _processBody: function _processBody()
  {
    log('[' + '_processBody' + '] ' +'Start');
    NS_ASSERT(this._state == READER_IN_BODY);

    // XXX handle chunked transfer-coding request bodies!

    try
    {
      log('[' + '_processBody' + '] ' +
            'this._contentLength: '+ this._contentLength);
      if (this._contentLength > 0)
      {
        var data = this._data.purge();
        var count = Math.min(data.length, this._contentLength);
        dumpn('*** loading data=' + data + ' len=' + data.length +
          ' excess=' + (data.length - count));
        log('[' + '_processBody' + '] ' +
              '_processBody: writting ' + count + ' bytes');
        log('[' + '_processBody' + '] ' +data);
        this._metadata._writeBody(data, count);
        this._contentLength -= count;
        log('[' + '_processBody' + '] ' +'_processBody: end writting');
      }

      dumpn('*** remaining body data len=' + this._contentLength);
      if (this._contentLength === 0)
      {
        this._validateRequest();
        this._state = READER_FINISHED;
        this._handleResponse();

        if (DUMP_REQUEST_HEADER)
        {
          this._metadata._dumpHeaders();
        }
        if (DUMP_REQUEST_BODY)
        {
          this._metadata._dumpBody();
        }
        return true;
      }

      return false;
    }
    catch (e)
    {
      this._handleError(e);
      return false;
    }
    log('[' + '_processBody' + '] ' +'End');
  },

  /**
  * Does various post-header checks on the data in this request.
  *
  * @throws : HttpError
  *   if the request was malformed in some way
  */
  _validateRequest: function _validateRequest()
  {
    log('[' + '_validateRequest' + '] ' +'Start');
    NS_ASSERT(this._state == READER_IN_BODY);

    dumpn('*** _validateRequest');
    var metadata = this._metadata;
    var headers = metadata._headers;
    var identity = this._connection.server.identity;
    if (metadata._httpVersion.atLeast(HttpVersion.HTTP_1_1))
    {
      log('[' + '_validateRequest' + '] ' +'In: if httpVersion check');

      if (!headers.hasHeader('Host'))
      {
        log('[' + '_validateRequest' + '] ' +
              'malformed HTTP/1.1 or grater');
        dumpn('*** malformed HTTP/1.1 or greater request with no Host header!');
        throw HTTP_400;
      }

      // If the Request-URI wasn't absolute, then we need to determine our host.
      // We have to determine what scheme was used to access us based on the
      // server identity data at this point, because the request just doesn't
      // contain enough data on its own to do this, sadly.
      if (!metadata._host)
      {
        log('[' + '_validateRequest' + '] ' +'no host info');
        var host, port;
        var hostPort = headers.getHeader('Host');
        var colon = hostPort.indexOf(':');
        log('[' + '_validateRequest' + '] ' +'colon: '+colon);
        if (colon < 0)
        {
          host = hostPort;
          port = '';
        }
        else
        {
          host = hostPort.substring(0, colon);
          port = hostPort.substring(colon + 1);
        }

        // NB: We allow an empty port here because, oddly, a colon may be
        //     present even without a port number, e.g. 'example.com:'; in this
        //     case the default port applies.
        if (!HOST_REGEX.test(host) || !/^\d*$/.test(port))
        {
          log('[' +  '_validateRequest' + '] ' +'port check failed');
          dumpn('*** malformed hostname (' + hostPort + ') in Host ' +
                'header, 400 time');
          throw HTTP_400;
        }

        // If we're not given a port, we're stuck, because we don't know what
        // scheme to use to look up the correct port here, in general.  Since
        // the HTTPS case requires a tunnel/proxy and thus requires that the
        // requested URI be absolute (and thus contain the necessary
        // information), let's assume HTTP will prevail and use that.
        port = +port || 80;
        log('[' + '_validateRequest' + '] ' +'getting scheme...');
        var scheme = identity.getScheme(host, port) ||
                     identity.getScheme('localhost', port);
        if (!scheme)
        {
          log('[' + '_validateRequest' + '] ' +'fail to detect scheme');
          dumpn('*** unrecognized hostname (' + hostPort + ') in Host ' +
                'header, 400 time');
          throw HTTP_400;
        }

        metadata._scheme = scheme;
        metadata._host = host;
        metadata._port = port;
      }
    }
    else
    {
      log('[' + '_validateRequest' + '] ' +'In: else');
      NS_ASSERT(metadata._host === undefined,
        'HTTP/1.0 doesn\'t allow absolute paths in the request line!');
      log('[' + '_validateRequest' + '] ' +'Start: metadata.***');
      metadata._scheme = identity.primaryScheme;
      metadata._host = identity.primaryHost;
      metadata._port = identity.primaryPort;
    }

    NS_ASSERT(identity.has(metadata._scheme, metadata._host, metadata._port),
    'must have a location we recognize by now!');
    log('[' + '_validateRequest' + '] ' +'End');
  },

  /**
  * Handles responses in case of error, either in the server or in the request.
  *
  * @param e
  *   the specific error encountered, which is an HttpError in the case where
  *   the request is in some way invalid or cannot be fulfilled; if this isn't
  *   an HttpError we're going to be paranoid and shut down, because that
  *   shouldn't happen, ever
  */
  _handleError: function rr_handleError(e)
  {
    log('[' + 'rr_handleError' + '] ' +'start');
    
    // Don't fall back into normal processing!
    this._state = READER_FINISHED;

    var server = this._connection.server;
    var code;
    if (e instanceof HttpError)
    {
      code = e.code;
    }
    else
    {
      dumpn('!!! UNEXPECTED ERROR: ' + e +
        (e.lineNumber ? ', line ' + e.lineNumber : ''));

      // no idea what happened -- be paranoid and shut down
      code = 500;
      server._requestQuit();
    }

    // make attempted reuse of data an error
    this._data = null;
    log('[' + 'rr_handleError' + '] ' +'call _connection processError');
    this._connection.processError(code, this._metadata);
  },

  /**
  * Now that we've read the request line and headers, we can actually hand off
  * the request to be handled.
  *
  * This method is called once per request, after the request line and all
  * headers and the body, if any, have been received.
  */
  _handleResponse: function _handleResponse()
  {
    log('[' + '_handleResponse' + '] ' +'Start');
    log('[' + '_handleResponse' + '] ' +'check state: ' +
        (this._state == READER_FINISHED));
    NS_ASSERT(this._state == READER_FINISHED);

    // We don't need the line-based data any more, so make attempted reuse an
    // error.
    this._data = null;
    log('[' + '_handleResponse' + '] ' +'calling _connection.process..');
    this._connection.process(this._metadata);
    log('[' + '_handleResponse' + '] ' +'End');
  },


  // PARSING

  /**
  * Parses the request line for the HTTP request associated with this.
  *
  * @param line : string
  *   the request line
  */
  _parseRequestLine: function _parseRequestLine(line)
  {
    log('[' + '_parseRequestLine' + '] ' +'Start');
    dumpn('*** _parseRequestLine(\'' + line + '\')');

    var metadata = this._metadata;

    // clients and servers SHOULD accept any amount of SP or HT characters
    // between fields, even though only a single SP is required (section 19.3)
    var request = line.split(/[ \t]+/);
    log('[' + '_parseRequestLine' + '] ' +'check request line...');
    if (!request || request.length != 3)
    {
      dumpn('*** No request in line');
      throw HTTP_400;
    }
    log('[' + '_parseRequestLine' + '] ' +'done');
    metadata._method = request[0];

    // get the HTTP version
    var ver = request[2];
    var match = ver.match(/^HTTP\/(\d+\.\d+)$/);
    log('[' + '_parseRequestLine' + '] ' +'check http version...');
    if (!match)
    {
      dumpn('*** No HTTP version in line');
      throw HTTP_400;
    }
    log('[' + '_parseRequestLine' + '] ' +'done');
    // determine HTTP version
    try
    {
      log('[' + '_parseRequestLine' + '] ' +'creating HttpVersion...');
      metadata._httpVersion = new HttpVersion(match[1]);
      log('[' + '_parseRequestLine' + '] ' +'done');
      if (!metadata._httpVersion.atLeast(HttpVersion.HTTP_1_0))
      {
        throw 'unsupported HTTP version';
      }
      log('[' + '_parseRequestLine' + '] ' +'ok. supported version');
    }
    catch (e)
    {
      // we support HTTP/1.0 and HTTP/1.1 only
      log('[' + '_parseRequestLine' + '] ' +'error: ' + e);
      throw HTTP_501;
    }


    var fullPath = request[1];

    var scheme, host, port;
    log('[' + '_parseRequestLine' + '] ' +'check path...');
    if (fullPath.charAt(0) != '/')
    {
      log('[' + '_parseRequestLine' + '] ' +'path does not start with /');
      log('[' + '_parseRequestLine' + '] ' +'check http version...');
      // No absolute paths in the request line in HTTP prior to 1.1
      if (!metadata._httpVersion.atLeast(HttpVersion.HTTP_1_1))
      {
        dumpn('*** Metadata version too low');
        throw HTTP_400;
      }
      log('[' + '_parseRequestLine' + '] ' +'done');
    }
    log('[' + '_parseRequestLine' + '] ' +'done(check path');

    var splitter = fullPath.indexOf('?');
    if (splitter < 0)
    {
      // _queryString already set in ctor
      metadata._path = fullPath;
    }
    else
    {
      metadata._path = fullPath.substring(0, splitter);
      metadata._queryString = fullPath.substring(splitter + 1);
    }
    log('[' + '_parseRequestLine' + '] ' +'metadata._path:', metadata._path);

    metadata._scheme = scheme;
    metadata._host = host;
    metadata._port = port;

  },

  /**
  * Parses all available HTTP headers in this until the header-ending CRLFCRLF,
  * adding them to the store of headers in the request.
  *
  * @throws
  *   HTTP_400 if the headers are malformed
  * @returns boolean
  *   true if all headers have now been processed, false otherwise
  */
  _parseHeaders: function _parseHeaders()
  {
    log('[' + '_parseHeaders' + '] ' +'Start');
    NS_ASSERT(this._state == READER_IN_HEADERS);

    dumpn('*** _parseHeaders');

    var data = this._data;

    var headers = this._metadata._headers;
    var lastName = this._lastHeaderName;
    var lastVal = this._lastHeaderValue;
    var line = {};
    while (true)
    {
      log('[' + '_parseHeaders' + '] ' +'lastName:'+lastName);
      log('[' + '_parseHeaders' + '] ' +'lastVal:'+lastVal);
      dumpn('*** Last name: \'' + lastName + '\'');
      dumpn('*** Last val: \'' + lastVal + '\'');
      NS_ASSERT(!((lastVal === undefined) ^ (lastName === undefined)),
        lastName === undefined ?
        'lastVal without lastName?  lastVal: \'' + lastVal + '\'' :
        'lastName without lastVal?  lastName: \'' + lastName + '\'');

      if (!data.readLine(line))
      {
        log('[' + '_parseHeaders' + '] ' +'In :!data.readLine');
        // save any data we have from the header we might still be processing
        this._lastHeaderName = lastName;
        this._lastHeaderValue = lastVal;
        return false;
      }

      var lineText = line.value;
      log('[' + '_parseHeaders' + '] ' +'Req:' + lineText);
      dumpn('*** Line text: \'' + lineText + '\'');
      var firstChar = lineText.charAt(0);
      
      // blank line means end of headers
      if (lineText === '')
      {
        log('[' + '_parseHeaders' + '] ' +'lineText is empty');
        // we're finished with the previous header
        if (lastName)
        {
          try
          {
            headers.setHeader(lastName, lastVal, true);
          }
          catch (e)
          {
            log('[' + '_parseHeaders' + '] ' +'error: ' + e);
            dumpn('*** setHeader threw on last header, e == ' + e);
            throw HTTP_400;
          }
        }
        else
        {
          // no headers in request -- valid for HTTP/1.0 requests
        }

        // either way, we're done processing headers
        this._state = READER_IN_BODY;
        return true;
      }
      else if (firstChar == ' ' || firstChar == '\t')
      {
        log('[' + '_parseHeaders' + '] ' +
            'firstChar is whitespace or TAB');

        // multi-line header if we've already seen a header line
        if (!lastName)
        {
          dumpn('We don\'t have a header to continue!');
          throw HTTP_400;
        }

        // append this line's text to the value; starts with SP/HT, so no need
        // for separating whitespace
        lastVal += lineText;
      }
      else
      {
        log('[' + '_parseHeaders' + '] ' +'else(not blank, not space)');
        log('[' + '_parseHeaders' + '] ' +'lastName:'+lastName);

        // we have a new header, so set the old one (if one existed)

        if (lastName)
        {
          headers.setHeader(lastName, lastVal, true);
        }

        var colon = lineText.indexOf(':'); // first colon must be splitter
        if (colon < 1)
        {
          log('[' + '_parseHeaders' + '] ' +'no colon found');
          dumpn('*** No colon or missing header field-name');
          throw HTTP_400;
        }

        // set header name, value (to be set in the next loop, usually)
        lastName = lineText.substring(0, colon);
        lastVal = lineText.substring(colon + 1);
        log('[' + '_parseHeaders' + '] ' +'2nd lastName:' + lastName);
        log('[' + '_parseHeaders' + '] ' +'2nd lastVal:' + lastVal);
      } // empty, continuation, start of header

      log('[' + '_parseHeaders' + '] ' +'continute');
    }
    log('[' + '_parseHeaders' + '] ' +'End');
  }
};


/** The character codes for CR and LF. */
const CR = 0x0D, LF = 0x0A;

/**
* Calculates the number of characters before the first CRLF pair in array, or
* -1 if the array contains no CRLF pair.
*
* @param array : Array
*   an array of numbers in the range [0, 256), each representing a single
*   character; the first CRLF is the lowest index i where
*   |array[i] == '\r'.charCodeAt(0)| and |array[i+1] == '\n'.charCodeAt(0)|,
*   if such an |i| exists, and -1 otherwise
* @param start : uint
*   start index from which to begin searching in array
* @returns int
*   the index of the first CRLF if any were present, -1 otherwise
*/
/** The character codes for CR and LF. */
function findCRLF(bytes, start)
{
  for (var i = start; i < bytes.length - 1; i++)
  {
    if (bytes[i] == CR && bytes[i + 1] == LF)
    {
      return i;
    }
  }

  return -1;
}

/**
* A container which provides line-by-line access to the arrays of bytes with
* which it is seeded.
*/
function LineData()
{
  /** An array of queued bytes from which to get line-based characters. */
  this._data = null;

  /** Start index from which to search for CRLF. */
  this._start = 0;
}
LineData.prototype =
{
  /**
  * Appends the bytes in the given array to the internal data cache maintained
  * by this.
  */
  appendBytes: function(bytes)
  {
    if (this._data) {
      var newBuffer = new Uint8Array(this._data.length + bytes.length);

      newBuffer.set(this._data, 0);
      newBuffer.set(bytes, this._data.length);
      this._data = newBuffer;
    }
    else {
      this._data = new Uint8Array(bytes);
    }
  },

  /**
  * Removes and returns a line of data, delimited by CRLF, from this.
  *
  * @param out
  *   an object whose 'value' property will be set to the first line of text
  *   present in this, sans CRLF, if this contains a full CRLF-delimited line
  *   of text; if this doesn't contain enough data, the value of the property
  *   is undefined
  * @returns boolean
  *   true if a full line of data could be read from the data in this, false
  *   otherwise
  */
  readLine: function readLine(out)
  {
    var data = this._data;
    var lineEnd = findCRLF(data, this._start);
    log('[' + 'readLine' + '] ' +'data length: ' + data.length);
    log('[' + 'readLine' + '] ' +'crlf position: ' + lineEnd);

    if (length < 0)
    {
      this._start = data.length;

      // But if our data ends in a CR, we have to back up one, because
      // the first byte in the next packet might be an LF and if we
      // start looking at data.length we won't find it.
      if (data.length > 0 && data[data.length - 1] === CR)
      {
        --this._start;
      }

      return false;
    }

    var line = String.fromCharCode.apply(null,
                                         data.subarray(this._start, lineEnd));

    this._start = lineEnd + 2;
    log('[' + 'readLine' + '] ' +'start:' + this._start);
    log('[' + 'readLine' + '] ' +'line: ' + line);

    out.value = line;
    return true;
  },

  /**
  * Removes the bytes currently within this and returns them in an array.
  *
  * @returns Array
  *   the bytes within this when this method is called
  */
  purge: function()
  {
    var data = this._data.subarray(this._start, this._data.length);

    log('[' + 'readLine' + '] ' +
        'purge(): data.length=' + data.length);
    this._data = null;
    this._start = 0;
    return data;
  }
};



/**
* Converts the given string into a string which is safe for use in an HTML
* context.
*
* @param str : string
*   the string to make HTML-safe
* @returns string
*   an HTML-safe version of str
*/
function htmlEscape(str)
{
  // this is naive, but it'll work
  var s = '';
  for (var i = 0; i < str.length; i++)
  {
    s += '&#' + str.charCodeAt(i) + ';';
  }
  return s;
}

/**
* Creates a request-handling function for an nsIHttpRequestHandler object.
*/
function createHandlerFunc(handler)
{
  return function(metadata, response) { handler.handle(metadata, response); };
}

/**
* Converts an externally-provided path into an internal path for use in
* determining file mappings.
*
* @param path
*   the path to convert
* @param encoded
*   true if the given path should be passed through decodeURI prior to
*   conversion
* @throws URIError
*   if path is incorrectly encoded
*/
function toInternalPath(path, encoded)
{
  if (encoded)
  {
    path = decodeURI(path);
  }

  var comps = path.split('/');
  for (var i = 0, sz = comps.length; i < sz; i++)
  {
    var comp = comps[i];
    log('toInternalPath comps[' + i + ']:' + comp);
  }
  return comps.join('/');
}

function getContentType(fileExtention) {
  var toLowerExtention = fileExtention.toLowerCase();
  var map = {
    '3gp'  : 'video/3gpp',
    '3g2'  : 'video/3gpp2',
    'css'  : 'text/css',
    'gif'  : 'image/gif',
    'htm'  : 'text/html',
    'html' : 'text/html',
    'jpeg' : 'image/jpeg',
    'jpg'  : 'image/jpeg',
    'js'   : 'text/javascript',
    'mp4'  : 'video/mp4',
    'ogg'  : 'video/ogg',
    'ogv'  : 'video/ogg',
    'png'  : 'image/png',
    'webm' : 'video/webm',
    'txt'  : 'text/plain',
    'bmp'  : 'image/bmp'
  };
  var type = map[toLowerExtention];
  if (type === undefined) {
    type = 'application/octet-stream';
  }
  return type;
}

function RangedFile(file, ranged, size, start, end)
{
  this.file = file;
  this.ranged = ranged;
  this.size = size;
  this.start = start;
  this.end = end;
  log('RangedFile ranged:' + ranged +
                ' size:' + size +
                ' start:' + start+
                ' end:' + end);
}

function sliceFile(rangeHeader, file)
{

  var fsize = file.size;
  var start = 0;
  var end = file.size - 1;

  var mat = rangeHeader.match(/^bytes=(\d+)?-(\d+)?$/);
  if (mat)
  {
    // bytes=[start]-[end]
    start = (mat[1] !== undefined) ? parseInt(mat[1]) : undefined;
    end   = (mat[2] !== undefined) ? parseInt(mat[2]) : undefined;
    log('sliceFile fsize:' + fsize);
    log('sliceFile start:' + start);
    log('sliceFile end  :' + end);
    if (start === undefined && end === undefined)
    {
      // bytes=-
      start = 0;
      end = fsize - 1;
    }
    else if (start === undefined)
    {
      // bytes=-[end]
      
      // No start given, so the end is really the count of bytes from the
      // end of the file.
      start = Math.max(0, fsize - end - 1);
      end = fsize - 1;
    }
    else if (end === undefined || end >= fsize)
    {
      // bytes=[start]-
      
      // start and end are inclusive
      end = fsize - 1;

    }

    log ('sliceFile start:' + start + ' end:' + end);
    if (start !== 0 || end != fsize - 1)
    {
      file = file.slice(start, end + 1);
    }
  }

  var ranged = (rangeHeader !== '' || mat != null);

  return new RangedFile(file, ranged, fsize, start, end);
}

function writeFileResponseFactory(path, dir, readFile)
{

  function writeResponse(req, res, oncomplete)
  {

    var reqPath = req.path;
    var localPath = dir + reqPath.substr(path.length, reqPath.length - 1);

    if (localPath.slice(-1) == '/')
    {
      localPath += 'index.html';
    }
    res.writeFileResponse(localPath, readFile, req, oncomplete);
  }

  log('[' + 'readLine' + '] ' +'End');
  return writeResponse;
}


/**
* An object which handles requests for a server, executing default and
* overridden behaviors as instructed by the code which uses and manipulates it.
* Default behavior includes the paths / and /trace (diagnostics), with some
* support for HTTP error pages for various codes and fallback to HTTP 500 if
* those codes fail for any reason.
*
* @param server : nsHttpServer
*   the server in which this handler is being used
*/
function ServerHandler(server)
{
  // FIELDS

  /**
  * The nsHttpServer instance associated with this handler.
  */
  this._server = server;

  /**
  * Custom request handlers for the server in which this resides.  Path-handler
  * pairs are stored as property-value pairs in this property.
  *
  */
  this._overridePaths = {};

  /**
  * Custom request handlers for the path prefixes on the server in which this
  * resides.  Path-handler pairs are stored as property-value pairs in this
  * property.
  *
  */
  this._overridePrefixes = {};

  /**
  * Custom request handlers for the error handlers in the server in which this
  * resides.  Path-handler pairs are stored as property-value pairs in this
  * property.
  *
  * @see ServerHandler.prototype._defaultErrors
  */
  this._overrideErrors = {};

}
ServerHandler.prototype =
{
  // PUBLIC API

  /**
  * Handles a request to this server, responding to the request appropriately
  * and initiating server shutdown if necessary.
  *
  * This method never throws an exception.
  *
  * @param connection : Connection
  *   the connection for this request
  */
  handleResponse: function SHhandleResponse(connection)
  {
    log('[' + 'handleResponse' + '] ' +'Start');
    var request = connection.request;
    log('[' + 'handleResponse' + '] ' +
        'request:'+JSON.stringify(request));
    var response = new Response(connection);
    log('[' + 'handleResponse' + '] ' +'response'+response);
    var path = request.path;
    dumpn('*** path == ' + path);

   log('[' + 'handleResponse' + '] ' +'try...');

    try
    {
      try
      {
        if (path in this._overridePaths)
        {
          // explicit paths first, then files based on existing directory
          // mappings, then (if the file doesn't exist) built-in server
          // default paths
          dumpn('calling override for ' + path);
          log('[' + 'handleResponse' + '] ' +'path found in _overrides');
          var respHandler = this;
          this._overridePaths[path](request, response,
            function(e) {
              log('[' + 'handleResponse' + '] ' +
              '_overridePaths complete start');
              if (e instanceof HttpError) {
                response = new Response(connection);
                if (e.customErrorHandling)
                {
                  e.customErrorHandling(response);
                }
                var eCode = e.code;
                respHandler._handleError(eCode, request, response);
                dumpSysTime(
                  'Error Response(' + eCode +'),');
              }
              else {
                response.complete();
                dumpSysTime('Response, ' + request.path);
              }
            }
          );
        }
        else
        {
          log('[' + 'handleResponse' + '] ' +
              'else(path not found in _overrides)');

          var longestPrefix = '';
          for (var prefix in this._overridePrefixes)
          {
            if (prefix.length > longestPrefix.length &&
              path.substr(0, prefix.length) == prefix)
              {
                longestPrefix = prefix;
              }
          }

          if (longestPrefix.length > 0)
          {
            var handler = this;

            log('[' + 'handleResponse' + '] ' +
                  'longestPrefix =' + longestPrefix);
            dumpn('calling prefix override for ' + longestPrefix);
            this._overridePrefixes[longestPrefix](request,
                                                  response,
                                                  function(e){
              if (e instanceof HttpError)
              {
                response = new Response(connection);

                if (e.customErrorHandling)
                {
                  e.customErrorHandling(response);
                }
                var eCode = e.code;
                handler._handleError(eCode, request, response);
                dumpSysTime('Error Response(' + eCode +
                            '),' + request.path);
              }
              else
              {
                response.complete();
                dumpSysTime('Response, ' + request.path);
              }
            });
          }
          else
          {
            log('[' + 'handleResponse' + '] ' +
                'non match prefix => 403');
            throw HTTP_403;
          }
        }
      }
      catch (e)
      {
        if (!(e instanceof HttpError))
        {
          log('[' + 'handleResponse' + '] ' +
              'unexpected error(not http):' + e);
          dumpn('*** unexpected error: e == ' + e);
          throw HTTP_500;
        }
        if (e.code !== 404)
        {
          log('[' + 'handleResponse' + '] ' +'404');
          throw e;
        }

        throw HTTP_404;
      }
    }
    catch (e)
    {
      var errorCode = 'internal';

      try
      {
        if (!(e instanceof HttpError))
        {
          throw e;
        }

        errorCode = e.code;
        dumpn('*** errorCode == ' + errorCode);

        response = new Response(connection);
        if (e.customErrorHandling)
        {
          e.customErrorHandling(response);
        }
        this._handleError(errorCode, request, response);
        return;
      }
      catch (e2)
      {
        dumpn('*** error handling ' + errorCode + ' error: ' +
        'e2 == ' + e2 + ', shutting down server');

      connection.server._requestQuit();
      response.abort(e2);
      return;
      }
    }
    log('[' + 'handleResponse' + '] ' +'End: handleResponse');
  },

  //
  // see nsIHttpServer.registerPathHandler
  //
  registerPathHandler: function registerPathHandler(path, handler)
  {
    // XXX true path validation!
    if (path.charAt(0) != '/')
    {
      throw 'Cr.8888 NS_ERROR_INVALID_ARG';
    }

    log('[' + 'registerPathHandler' + '] ' +'call _handlerToField');
    this._handlerToField(handler, this._overridePaths, path);
  },

  //
  // see nsIHttpServer.registerPrefixHandler
  //
  registerPrefixHandler: function(path, handler)
  {
    // XXX true path validation!
    if (path.charAt(0) != '/' || path.charAt(path.length - 1) != '/')
    {
      throw 'Cr.9999 NS_ERROR_INVALID_ARG need a slash at the end of the path';
    }

    this._handlerToField(handler, this._overridePrefixes, path);
  },

  //
  // see nsIHttpServer.registerAppDirectory
  //
  registerAppDirectory: function(path, dir)
  {
    dir = (dir[dir.length - 1] == '/') ? dir : dir + '/';

    var readFile =  function(fpath, successCb, errorCb)
    {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', fpath, true);
      xhr.responseType = 'blob';

      xhr.onreadystatechange = function()
      {
        if (xhr.readyState == 4)
        {
          if (xhr.status == 200)
          {
            log('registerAppDirectory readFile successCb');
            
            var installDateTime;
            var request = window.navigator.mozApps.getSelf();
            request.onsuccess = function()
            {
              if (request.result)
              {
                installDateTime = request.result.installTime;
                successCb(xhr.response, installDateTime);
              }
              else
              {
                errorCb(HTTP_404);
              }
            };
            request.onerror = function()
            {
              errorCb(HTTP_404);
            };
            
          }
          else
          {
            errorCb(HTTP_404);
          }
        }
      };
      try
      {
        xhr.send(null);
      }
      catch (e)
      {
        log('[' + 'registerAppDirectory' + '] ' +
            'Could not access the file:' + fpath);
        errorCb(HTTP_404);
      }
    };
    this.registerPrefixHandler(path,
                               writeFileResponseFactory(path, dir, readFile));
  },

  //
  // see nsIHttpServer.registerSdcardDirectory
  //
  registerSdcardDirectory: function registerSdCardDirecotry(path, dir)
  {
    dir = (dir[dir.length - 1] == '/') ? dir : dir + '/';

    var readFile = function(fpath, successCb, errorCb)
    {
      var storage = window.navigator.getDeviceStorage('sdcard');

      if (!storage)
      {
        log('[' + 'registerSdcardDirectory' + '] ' +'No storage available!');
        errorCb(HTTP_500);
        return;
      }

      var obj = storage.get(fpath);
      obj.onsuccess = function()
      {
        var file = obj.result;
        log('Get the file name: ' + file.name);
        log('Get the file lastModifiedDate: ' + file.lastModifiedDate);
        var dateTime = file.lastModifiedDate.getTime();
        log('Get the file lastModifiedDate getTime: ' +
             file.lastModifiedDate);
        successCb(file, dateTime);
      };
      obj.onerror = function objectOnerror(e)
      {
        log('[' + 'registerSdcardDirectory' + '] ' +
            'Could not access the file:' + fpath);
        log('[' + 'registerSdcardDirectory' + '] ' +
            'Error description:' + e.target.error.name);
        errorCb(HTTP_404);
      };
    };
    this.registerPrefixHandler(path,
                               writeFileResponseFactory(path, dir, readFile));
  },

  // PRIVATE API

  /**
  * Sets or remove (if handler is null) a handler in an object with a key.
  *
  * @param handler
  *   a handler, either function or an nsIHttpRequestHandler
  * @param dict
  *   The object to attach the handler to.
  * @param key
  *   The field name of the handler.
  */
  _handlerToField: function _handlerToField(handler, dict, key)
  {
    // for convenience, handler can be a function if this is run from xpcshell
    if (typeof(handler) == 'function')
    {
      dict[key] = handler;
      log('[' + '_handlerToField' + '] ' + key +
          '=> a handler <' + handler.name +'>');
    }
    else if (handler)
    {
      dict[key] = createHandlerFunc(handler);
      log('[' + '_handlerToField' + '] ' + key +
          '=> createHanlder: handler<' + handler.name + '>');
    }
    else
    {
      delete dict[key];
      log('[' + '_handlerToField' + '] ' + 'delete for key: ' + key);
    }
  },

  /**
  * Writes the error page for the given HTTP error code over the given
  * connection.
  *
  * @param errorCode : uint
  *   the HTTP error code to be used
  * @param connection : Connection
  *   the connection on which the error occurred
  */
  handleError: function(errorCode, connection)
  {
    var response = new Response(connection);

    dumpn('*** error in request: ' + errorCode);

    this._handleError(errorCode, new Request(connection.port), response);
  },

  /**
  * Handles a request which generates the given error code, using the
  * user-defined error handler if one has been set, gracefully falling back to
  * the x00 status code if the code has no handler, and failing to status code
  * 500 if all else fails.
  *
  * @param errorCode : uint
  *   the HTTP error which is to be returned
  * @param metadata : Request
  *   metadata for the request, which will often be incomplete since this is an
  *   error
  * @param response : Response
  *   an uninitialized Response should be initialized when this method
  *   completes with information which represents the desired error code in the
  *   ideal case or a fallback code in abnormal circumstances (i.e., 500 is a
  *   fallback for 505, per HTTP specs)
  */
  _handleError: function(errorCode, metadata, response)
  {
    if (!metadata)
    {
      throw 'Cr.NS_ERROR_NULL_POINTER';
    }

    var errorX00 = errorCode - (errorCode % 100);

    try
    {
      if (!(errorCode in HTTP_ERROR_CODES))
      {
        dumpn('*** WARNING: requested invalid error: ' + errorCode);
      }

      // RFC 2616 says that we should try to handle an error by its class if we
      // can't otherwise handle it -- if that fails, we revert to handling it as
      // a 500 internal server error, and if that fails we throw and shut down
      // the server

      // actually handle the error
      try
      {
        if (errorCode in this._overrideErrors)
        {
          this._overrideErrors[errorCode](metadata, response);
        }
        else
        {
          this._defaultErrors[errorCode](metadata, response);
        }
      }
      catch (e)
      {
        // don't retry the handler that threw
        if (errorX00 == errorCode)
        {
          throw HTTP_500;
        }

        dumpn('*** error in handling for error code ' + errorCode + ', ' +
        'falling back to ' + errorX00 + '...');
        response = new Response(response._connection);
        if (errorX00 in this._overrideErrors)
        {
          this._overrideErrors[errorX00](metadata, response);
        }
        else if (errorX00 in this._defaultErrors)
        {
          this._defaultErrors[errorX00](metadata, response);
        }
        else
        {
          throw HTTP_500;
        }
      }
    }
    catch (e)
    {
      // we've tried everything possible for a meaningful error -- now try 500
      dumpn('*** error in handling for error code ' + errorX00 + ', falling ' +
      'back to 500...');

      try
      {
        response = new Response(response._connection);
        if (500 in this._overrideErrors)
        {
          this._overrideErrors[500](metadata, response);
        }
        else
        {
          this._defaultErrors[500](metadata, response);
        }
      }
      catch (e2)
      {
        dumpn('*** multiple errors in default error handlers!');
        dumpn('*** e == ' + e + ', e2 == ' + e2);
        response.abort(e2);
        return;
      }
    }

    response.complete();
  },

  // FIELDS

  /**
  * This object contains the default handlers for the various HTTP error codes.
  */
  _defaultErrors:
  {
    400: function(metadata, response)
    {
      // none of the data in metadata is reliable, so hard-code everything here
      response.setStatusLine('1.1', 400, 'Bad Request');
      response.setHeader('Content-Type', 'text/plain', false);

      var body = 'Bad request\n';
      response.bodyOutputStream.write(body, body.length);
    },
    403: function(metadata, response)
    {
      response.setStatusLine(metadata.httpVersion, 403, 'Forbidden');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head><title>403 Forbidden</title></head>\
        <body>\
        <h1>403 Forbidden</h1>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    },
    404: function(metadata, response)
    {
      response.setStatusLine(metadata.httpVersion, 404, 'Not Found');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head><title>404 Not Found</title></head>\
        <body>\
        <h1>404 Not Found</h1>\
        <p>\
        <span style="font-family: monospace;">' +
        htmlEscape(metadata.path) +
        '</span> was not found.\
        </p>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    },
    416: function(metadata, response)
    {
      response.setStatusLine(metadata.httpVersion,
        416,
      'Requested Range Not Satisfiable');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head>\
        <title>416 Requested Range Not Satisfiable</title></head>\
        <body>\
        <h1>416 Requested Range Not Satisfiable</h1>\
        <p>The byte range was not valid for the\
        requested resource.\
        </p>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    },
    500: function(metadata, response)
    {
      response.setStatusLine(metadata.httpVersion,
        500,
      'Internal Server Error');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head><title>500 Internal Server Error</title></head>\
        <body>\
        <h1>500 Internal Server Error</h1>\
        <p>Something\'s broken in this server and\
        needs to be fixed.</p>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    },
    501: function(metadata, response)
    {
      response.setStatusLine(metadata.httpVersion, 501, 'Not Implemented');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head><title>501 Not Implemented</title></head>\
        <body>\
        <h1>501 Not Implemented</h1>\
        <p>This server is not (yet) Apache.</p>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    },
    505: function(metadata, response)
    {
      response.setStatusLine('1.1', 505, 'HTTP Version Not Supported');
      response.setHeader('Content-Type', 'text/html', false);

      var body = '<html>\
        <head><title>505 HTTP Version Not Supported</title></head>\
        <body>\
        <h1>505 HTTP Version Not Supported</h1>\
        <p>This server only supports HTTP/1.0 and HTTP/1.1\
        connections.</p>\
        </body>\
        </html>';
      response.bodyOutputStream.write(body, body.length);
    }
  }
};

/**
* Represents a response to an HTTP request, encapsulating all details of that
* response.  This includes all headers, the HTTP version, status code and
* explanation, and the entity itself.
*
* @param connection : Connection
*   the connection over which this response is to be written
*/
function Response(connection)
{
  /** The connection over which this response will be written. */
  this._connection = connection;

  /**
  * The HTTP version of this response; defaults to 1.1 if not set by the
  * handler.
  */
  this._httpVersion = HttpVersion.HTTP_1_1;

  /**
  * The HTTP code of this response; defaults to 200.
  */
  this._httpCode = 200;

  /**
  * The description of the HTTP code in this response; defaults to 'OK'.
  */
  this._httpDescription = 'OK';

  /**
  * An nsIHttpHeaders object in which the headers in this response should be
  * stored.  This property is null after the status line and headers have been
  * written to the network, and it may be modified up until it is cleared.
  */
  this._headers = new HttpHeaders();

  /**
  * Set to true when this response is ended (completely constructed if possible
  * and the connection closed); further actions on this will then fail.
  */
  this._ended = false;

  /**
  * A stream used to hold data written to the body of this response.
  */
  this._bodyOutputStream = null;

  /**
  * A stream containing all data that has been written to the body of this
  * response so far.  (Async handlers make the data contained in this
  * unreliable as a way of determining content length in general, but auxiliary
  * saved information can sometimes be used to guarantee reliability.)
  */
  this._bodyInputStream = null;
}

function isUpdateModifiedSince(fileModDateTime, modifiedSinceHeaderVal)
{
  log('isUpdateModifiedSince fileModDateTime:' + fileModDateTime);
  
  var reqModSinceDateTime = (new Date(modifiedSinceHeaderVal)).getTime();
  log('isUpdateModifiedSince req reqModSinceDateTime:' + reqModSinceDateTime);
  if (reqModSinceDateTime != fileModDateTime)
  {
    log('isUpdateModifiedSince return true');
    return true;
  }
  else
  {
    log('isUpdateModifiedSince return false');
    return false;
  }
}

Response.prototype =
{
  // PUBLIC CONSTRUCTION API

  writeFileResponse: function(localPath, readFile, req, oncomplete)
  {
    log('[writeFileResponse] ' +'Start localPath:' + localPath);
    
    var self = this;
    var fileExt = localPath.split('.').pop();

    self.setHeader('Content-Type', getContentType(fileExt), false);

    readFile(localPath,
      function(fileObj, modDateTime)
      {
        log('writeFileResponse modDateTime:' + modDateTime);
//req:If-Modified-Since
        if (req.hasHeader('If-Modified-Since'))
        {
          log('If-Modified-Since');
          var modifiedVal;
          modifiedVal = req.getHeader('If-Modified-Since');
          if(!isUpdateModifiedSince(modDateTime, modifiedVal))
          {
              log('If-Modified-Since Response Res had not updated');
              self.setStatusLine(req.httpVersion, 304, 'Not Modified');
              self.setHeader('Content-Type', 'text/plain', false);
              oncomplete();
              return;
          }
          else
          {
             log('If-Modified-Since Response Res had updated');
          }
        }
//res:Last-Modified
        self.setHeader('Last-Modified', toDateString(modDateTime), false);
//req:If-None-Match
        if (req.hasHeader('If-None-Match'))
        {
          var reqEtag;
          reqEtag = req.getHeader('If-None-Match');
          log('If-None-Match reqEtag:' + reqEtag);
          if(reqEtag === String(modDateTime))
          {
              log('If-None-Match Response Res had not updated');
              self.setStatusLine(req.httpVersion, 304, 'Not Modified');
              self.setHeader('Content-Type', 'text/plain', false);
              oncomplete();
              return;
          }
          else
          {
             log('If-None-Match Response Res had updated');
          }
        }
//res:ETag
        self.setHeader('ETag', String(modDateTime), false);
//req:Range
        var rangeHeader;
        if (req.hasHeader('Range'))
        {
          rangeHeader = req.getHeader('Range');
        }
        else
        {
          rangeHeader = '';
        }
        var f = sliceFile(rangeHeader, fileObj);

        var MAXSIZE = 1 * Math.pow(2, 20);
        if (MAXSIZE < f.size)
        {
          log('file size over 1MB!!');
          if (f.ranged)
          {
            self.setStatusLine(req.httpVersion, 206, 'Partial Content');
            var contentRange =
              'bytes ' + f.start + '-' + f.end + '/' + f.size;
            log('[' + 'writeFileResponse' + '] ' +
              'content-range=' + contentRange);
            self.setHeader('Content-Range', contentRange);
          }
          self.setHeader('Accept-Ranges', 'bytes', false);
          self.write(f);
          oncomplete();
        }
        else
        {
          var reader = new FileReader();
          reader.onload = function onload(e)
          {
            if (f.ranged)
            {
              self.setStatusLine(req.httpVersion, 206, 'Partial Content');
              var contentRange =
                'bytes ' + f.start + '-' + f.end + '/' + f.size;
              log('[' + 'writeFileResponse' + '] ' +
                'content-range=' + contentRange);
              self.setHeader('Content-Range', contentRange);
            }
            self.setHeader('Accept-Ranges', 'bytes', false);
            self.write(reader.result);
            if (f != null)
            {
             f.file = null;
              f = null;
            }
            reader = null;
            oncomplete();
          };
          reader.onerror = function(e)
          {
            if (f != null)
            {
              f.file = null;
              f = null;
            }
            reader = null;
            oncomplete(HTTP_404);
          };
          reader.onabort = function(e)
          {
            if (f != null)
            {
              f.file = null;
              f = null;
            }
            reader = null;
            oncomplete(HTTP_404);
          };
          reader.readAsArrayBuffer(f.file);
        }
      },
      function(e)
      {
        oncomplete(e);
      }
    );
  },
  
  // http://doxygen.db48x.net/mozilla-full/html/df/dc6/interfacensIHttpResponse.html
  
  get bodyOutputStream()
  {
    if (!this._bodyOutputStream)
    {
      this._bodyInputStream =
      this._bodyOutputStream = new StreamWrapper();
    }
    return this._bodyOutputStream;
  },

  write: function(data)
  {
    if (this._end)
    {
      throw 'write(): condition not satisfied';
    }

    // data is 'string' or 'uint8Array'.
    this.bodyOutputStream.write(data);
  },

  setStatusLine: function(httpVersion, code, description)
  {
    if (!this._headers || this._end)
    {
      throw 'setStatusLine(): condition not satisfied';
    }

    this._ensureAlive();

    if (!(code >= 0 && code < 1000))
    {
      throw 'setStatusLine(): invalid code';
    }

    var httpVer;
    
    // avoid version construction for the most common cases
    if (!httpVersion || httpVersion == '1.1')
    {
      httpVer = HttpVersion.HTTP_1_1;
    }
    else if (httpVersion == '1.0')
    {
      httpVer = HttpVersion.HTTP_1_0;
    }
    else
    {
      httpVer = new HttpVersion(httpVersion);
    }

    // Reason-Phrase = *<TEXT, excluding CR, LF>
    // TEXT          = <any OCTET except CTLs, but including LWS>
    //
    // XXX this ends up disallowing octets which aren't Unicode, I think -- not
    //     much to do if description is IDL'd as string
    if (!description)
    {
      description = '';
    }
    for (var i = 0; i < description.length; i++)
    {
      if (isCTL(description.charCodeAt(i)) && description.charAt(i) != '\t')
      {
        throw 'setStatusLint(): description include ctrl chars';
      }
    }

    // set the values only after validation to preserve atomicity
    this._httpDescription = description;
    this._httpCode = code;
    this._httpVersion = httpVer;
  },

  setHeader: function setHeader(name, value, merge)
  {
    if (!this._headers || this._end)
    {
      log('[' + 'setHeader' + '] ' +'condition not satisfied');
      throw 'setHeader(): condition not satisfied';
    }
    this._ensureAlive();
    this._headers.setHeader(name, value, merge);
    log('[' + 'setHeader' + '] ' +name + '=>' + value);
  },

  // POST-CONSTRUCTION API (not exposed externally)

  /**
  * The HTTP version number of this, as a string (e.g. '1.1').
  */
  get httpVersion()
  {
    this._ensureAlive();
    return this._httpVersion.toString();
  },

  /**
  * The HTTP status code of this response, as a string of three characters per
  * RFC 2616.
  */
  get httpCode()
  {
    this._ensureAlive();

    var codeString = (this._httpCode < 10 ? '0' : '') +
      (this._httpCode < 100 ? '0' : '') +
      this._httpCode;
    return codeString;
  },

  /**
  * The description of the HTTP status code of this response, or '' if none is
  * set.
  */
  get httpDescription()
  {
    this._ensureAlive();

    return this._httpDescription;
  },

  /**
  * The headers in this response, as an nsHttpHeaders object.
  */
  get headers()
  {
    this._ensureAlive();

    return this._headers;
  },

  getHeader: function(name)
  {
    this._ensureAlive();

    return this._headers.getHeader(name);
  },

  /**
  * If necessary, kicks off the remaining request processing needed to be done
  * after a request handler performs its initial work upon this response.
  */
  complete: function complete()
  {
    log('[' + 'complete' + '] ' +'Start');

    dumpn('*** complete()');

    log('[' + 'complete' + '] ' +'calling _startAsyncProcessor');

    this._startAsyncProcessor();
    log('[' + 'complete' + '] ' +'done');
    log('[' + 'complete' + '] ' +'End');
  },

  /**
  * Abruptly ends processing of this response, usually due to an error in an
  * incoming request but potentially due to a bad error handler.  Since we
  * cannot handle the error in the usual way (giving an HTTP error page in
  * response) because data may already have been sent (or because the response
  * might be expected to have been generated asynchronously or completely from
  * scratch by the handler), we stop processing this response and abruptly
  * close the connection.
  *
  * @param e : Error
  *   the exception which precipitated this abort, or null if no such exception
  *   was generated
  */
  abort: function(e)
  {
    dumpn('*** abort(<' + e + '>)');

    this.end();

  },

  /**
  * Closes this response's network connection, marks the response as finished,
  * and notifies the server handler that the request is done being processed.
  */
  end: function()
  {
    NS_ASSERT(!this._ended, 'ending this response twice?!?!');

    this._connection.close();
    if (this._bodyOutputStream)
    {
      this._bodyOutputStream.close();
    }
    this._ended = true;
  },

  // PRIVATE IMPLEMENTATION

  /**
  * Sends the status line and headers of this response if they haven't been
  * sent and initiates the process of copying data written to this response's
  * body to the network.
  */
  _startAsyncProcessor: function _startAsyncProcessor()
  {
    dumpn('*** _startAsyncProcessor()');

    // Send headers if they haven't been sent already and should be sent, then
    // asynchronously continue to send the body.
    if (this._headers)
    {
      log('[' + '_startAsyncProcessor' + '] ' +'call  _sendHeaders');
      this._sendHeaders();
      log('[' + '_startAsyncProcessor' + '] ' +'done.');
      return;
    }

    this._headers = null;
  },


  _send: function(data) // ret: call end by this
  {
    var tcpsock = this._connection._tcpsocket;
    var type = typeof(data);
    if (type == 'object')
    {
      if (data.constructor)
      {
        type = data.constructor.name;
      }
    }
    // argument of send() is ArrayBuffer
    if (type === 'string')
    {
      log('_sending string ' + data.length + ' chars');
      var abuff = new ArrayBuffer(data.length);
      var view = new Uint8Array(abuff);

      for (var i = 0; i < view.length; i++)
      {
        view[i] = data.charCodeAt(i);
      }
      this._sendData(tcpsock, abuff);
      return false;
    }
    else if (type === 'RangedFile')
    {
      log('_sending RangedFile');
      this._sendFile(tcpsock, data);
      return true;
    }
    else
    {
      log('_sending ' + type);
      this._sendData(tcpsock, data);
      return false;
    }
  },
  
  _sendData: function(sock, data)
  {
    log('_sendData sock.readyState:' + sock.readyState);
    if (sock.readyState === 'open')
    {
      sock.send(data);
      return true;
    }
    else
    {
      return false;
    }
  },

  _sendFile: function _sendFile(sock, rangedFile)
  {

    const UNIT_SIZE = Math.pow(2, 16);
    log('_sendFile sock.readyState:' + sock.readyState);
    if (sock.readyState !== 'open')
    {
      if (rangedFile != null)
      {
          rangedFile.file = null;
          rangedFile = null;
      }
      return;
    }
    var spos = 0;
    var size = rangedFile.end + 1;
    var self = this;
    var times = Math.ceil(size / UNIT_SIZE);
    log('_sendFile times:' + times);
    var count = 0;
    var reader = new FileReader();
    log ('_sendFile (type)' + rangedFile.constructor.name);
    log ('_sendFile block size = ' +  UNIT_SIZE);
    var pieceofFile = null;
    var timeoutId = null;
    var sendUnit = function()
    {
      log('sendUnit spos:' + spos + ' size:' + size);
      if (spos >= size)
      {
        log('sendUnit no more data');
        self.end();
        releaseRangedFile();
        abortFileReader();
        sock.ondrain = null;
        pieceofFile = null;
        cancelTimeoutClose();
        return;
      }
      cancelTimeoutClose();
      var end = Math.min(spos + UNIT_SIZE, size);
      log('sendUnit ' +
        (count++) + '/' + times +
        ' range = ' + spos + '-' + end + ' total = ' + size);
      if (rangedFile == null || reader == null)
      {
        log('sendUnit null check end');
        return;
      }
      pieceofFile = rangedFile.file.slice(spos, end);
      reader.onload = function onload(e)
      {
        log('sendUnit reader onload');
        spos = end;
        var sendret = self._sendData(sock, reader.result);
        log('sendUnit _sendData sendret:' + sendret);
        if (sendret === false)
        {
          releaseRangedFile();
          abortFileReader();
        }
        if (spos >= size)
        {
          log('sendUnit no more data');
          self.end();
          releaseRangedFile();
          abortFileReader();
          sock.ondrain = null;
          pieceofFile = null;
          cancelTimeoutClose();
          return;
        }
        timeoutId = setTimeout(timeoutClose, 30000);
        pieceofFile = null;
      };
      reader.onabort = function onabort(e)
      {
        log('reader onabort');
        self.end();
        releaseRangedFile();
        reader = null;
        pieceofFile = null;
        cancelTimeoutClose();
      };
      reader.readAsArrayBuffer(pieceofFile);
    };

    sock.onclose  = function(evt)
    {
      log('sock onclose');
      self.end();
      releaseRangedFile();
      abortFileReader();
      pieceofFile = null;
      cancelTimeoutClose();
    };
    sock.onerror  = function(evt)
    {
      log('sock onerror');
      self.end();
      releaseRangedFile();
      abortFileReader();
      pieceofFile = null;
      cancelTimeoutClose();
    };
    var timeoutClose = function()
    {
      log('timeoutClose');
      self.end();
      releaseRangedFile();
      abortFileReader();
      sock.ondrain = null;
      pieceofFile = null;
      timeoutId = null;
    };
    
    var cancelTimeoutClose = function()
    {
      log('cancelTimeoutClose timeoutId:' + timeoutId);
      if (timeoutId != null) {
         clearTimeout(timeoutId);
         timeoutId = null;
      }
    };
    
    var releaseRangedFile = function()
    {
      log('releaseRangedFile');
      if (rangedFile != null)
      {
        rangedFile.file = null;
        rangedFile = null;
      }
    };

    var abortFileReader = function()
    {
      log('abortFileReader');
      if (reader != null &&
          reader.readyState == FileReader.LOADING)
      {
        log('abortFileReader reader.abort()');
        reader.abort();
      }
      reader = null;
      
    };
    sock.ondrain = sendUnit;
    sendUnit();

    log('_sendFile end');
  },

  /**
  * Signals that all modifications to the response status line and headers are
  * complete and then sends that data over the network to the client.  Once
  * this method completes, a different response to the request that resulted
  * in this response cannot be sent -- the only possible action in case of
  * error is to abort the response and close the connection.
  */
  _sendHeaders: function _sendHeaders()
  {
    log('[' + '_sendHeaders' + '] ' +'start');

    dumpn('*** _sendHeaders()');

    NS_ASSERT(this._headers);

    // request-line
    var statusLine = 'HTTP/' + this.httpVersion + ' ' +
      this.httpCode + ' ' +
      this.httpDescription ;

    // header post-processing
    var headers = this._headers;

    headers.setHeader('Server', 'httpd.js', false);
    if (!headers.hasHeader('Date'))
    {
      headers.setHeader('Date', toDateString(Date.now()), false);
    }

    var size = 0;
    if (this._bodyInputStream != null)
    {
      log('[' + '_sendHeaders' + '] ' +'body size ' +
          this._bodyInputStream.size + ' data: ');
      log('[' + '_sendHeaders' + '] ' +this._bodyInputStream.data);

      size = this._bodyInputStream.size;
    }

    headers.setHeader('Content-Length', '' + size, false);

    // construct and send response
    dumpn('*** header post-processing completed, sending response head...');
    // request-line
    var preambleData = [statusLine];
    // headers
    for (var fieldName in headers._headers)
    {
      preambleData.push(fieldName + ': ' + headers._headers[fieldName]);
    }
    // end request-line/headers
    preambleData.push('\r\n');

    // send headers
    this._send(preambleData.join('\r\n'));
    log('[' + '_sendHeaders' + '] ' +'header: ' +
        preambleData.join(', '));
    // send body (if exists)
    this._sendBody();

    // dump response
    if (DUMP_RESPONSE_HEADER)
    {
      this._dumpHeaders();
    }
    if (DUMP_RESPONSE_BODY)
    {
      this._dumpBody();
    }
    // Forbid setting any more headers or modifying the request line.
    this._headers = null;
  },

  /**
  * Asynchronously writes the body of the response to the network.
  */
  _sendBody: function _sendBody()
  {
    dumpn('*** _sendBody');
    log('[' + '_sendBody' + '] ' +'Start: sendBody');

    // If no body data was written, we're done
    if (!this._bodyInputStream)
    {
      dumpn('*** empty body, response finished');
      this.end();
      return;
    }

    var socketClosedByFunc = false;
    if (this._bodyInputStream.size > 0)
    {
      if (this._bodyInputStream.data)
      {
        log(' has data(array buffer)');
        socketClosedByFunc = this._send(this._bodyInputStream.data);
      }
      else
      {
        log('file:' + JSON.stringify(this._bodyInputStream.file));
        socketClosedByFunc = this._send(this._bodyInputStream.file);
      }
    }
    if (!socketClosedByFunc)
    {
      log('sendbody: closing socket');
      this.end();
    }
    else{
      log('sendbody: socket kept');
    }

    log('[' + '_sendBody' + '] ' +'End: sendBody');

  },

  /** Ensures that this hasn't been ended. */
  _ensureAlive: function()
  {
    NS_ASSERT(!this._ended, 'not handling response lifetime correctly');
  },

  _dumpHeaders: function()
  {
    var dumpStr = '<response_headers>\n';
    var headers = this._headers;

    for (var fieldName in headers._headers)
    {
      dumpStr += fieldName + ': ' + headers._headers[fieldName] + '\n';
    }

    dumpStr += '\n</response_headers>';
    console.log('[' + '_ensureAlive' + '] ' +dumpStr);
  },

  _dumpBody: function()
  {
    var dumpStr = '<response_body>\n';
    var getBinaryString = function(uint8array)
    {
      var arr = [];
      var str = '';
      var i;
      for (i = 0; i < uint8array.length; i++)
      {
        var s = '0' + uint8array[i].toString(16);

        arr.push(s.substring(s.length - 2));
      }

      for (i = 0; i < ((arr.length + 15) / 16); i++)
      {
        str += arr.slice(i * 16, i * 16 + 16).join(' ') + '\n';
      }

      return str;
    };

    dumpStr += getBinaryString(this._bodyInputStream.data);
    dumpStr += '\n</response_body>';
    console.log('[' + '_ensureAlive' + '] ' +dumpStr);
  }
};

/**
* Constructs an object representing an HTTP version (see section 3.1).
*
* @param versionString
*   a string of the form '#.#', where # is an non-negative decimal integer with
*   or without leading zeros
* @throws
*   if versionString does not specify a valid HTTP version number
*/
function HttpVersion(versionString)
{
  var matches = /^(\d+)\.(\d+)$/.exec(versionString);
  if (!matches)
  {
    throw 'Not a valid HTTP version!';
  }

  /** The major version number of this, as a number. */
  this.major = parseInt(matches[1], 10);

  /** The minor version number of this, as a number. */
  this.minor = parseInt(matches[2], 10);

  if (isNaN(this.major) || isNaN(this.minor) ||
  this.major < 0    || this.minor < 0)
  {
    throw 'Not a valid HTTP version!';
  }
}
HttpVersion.prototype =
{
  /**
  * Returns the standard string representation of the HTTP version represented
  * by this (e.g., '1.1').
  */
  toString: function ()
  {
    return this.major + '.' + this.minor;
  },

  /**
  * Returns true if this represents the same HTTP version as otherVersion,
  * false otherwise.
  *
  * @param otherVersion : nsHttpVersion
  *   the version to compare against this
  */
  equals: function (otherVersion)
  {
    return this.major == otherVersion.major &&
    this.minor == otherVersion.minor;
  },

  /** True if this >= otherVersion, false otherwise. */
  atLeast: function(otherVersion)
  {
    return this.major > otherVersion.major ||
    (this.major == otherVersion.major &&
    this.minor >= otherVersion.minor);
  }
};

HttpVersion.HTTP_1_0 = new HttpVersion('1.0');
HttpVersion.HTTP_1_1 = new HttpVersion('1.1');


/**
* An object which stores HTTP headers for a request or response.
*
* Note that since headers are case-insensitive, this object converts headers to
* lowercase before storing them.  This allows the getHeader and hasHeader
* methods to work correctly for any case of a header, but it means that the
* values returned by .enumerator may not be equal case-sensitively to the
* values passed to setHeader when adding headers to this.
*/
function HttpHeaders()
{
  /**
  * A hash of headers, with header field names as the keys and header field
  * values as the values.  Header field names are case-insensitive, but upon
  * insertion here they are converted to lowercase.  Header field values are
  * normalized upon insertion to contain no leading or trailing whitespace.
  *
  * Note also that per RFC 2616, section 4.2, two headers with the same name in
  * a message may be treated as one header with the same field name and a field
  * value consisting of the separate field values joined together with a ',' in
  * their original order.  This hash stores multiple headers with the same name
  * in this manner.
  */
  this._headers = {};
}
HttpHeaders.prototype =
{
  /**
  * Sets the header represented by name and value in this.
  *
  * @param name : string
  *   the header name
  * @param value : string
  *   the header value
  * @throws NS_ERROR_INVALID_ARG
  *   if name or value is not a valid header component
  */
  setHeader: function setHeader(fieldName, fieldValue, merge)
  {
    log('[' + 'setHeader' + '] ' +'Start');

    var name = headerUtils.normalizeFieldName(fieldName);
    var value = headerUtils.normalizeFieldValue(fieldValue);
    log('[' + 'setHeader' + '] ' +' ('+ name + ' => ' + value + ')');

    // The following three headers are stored as arrays because their real-world
    // syntax prevents joining individual headers into a single header using
    // ','.  See also <http://hg.mozilla.org/mozilla-central/diff/
    //       9b2a99adc05e/netwerk/protocol/http/src/nsHttpHeaderArray.cpp#l77>
    if (merge && name in this._headers)
    {
      if (name === 'www-authenticate' ||
        name === 'proxy-authenticate' ||
        name === 'set-cookie')
      {
        this._headers[name].push(value);
      }
      else
      {
        this._headers[name][0] += ',' + value;
        NS_ASSERT(this._headers[name].length === 1,
        'how\'d a non-special header have multiple values?');
      }
    }
    else
    {
      this._headers[name] = [value];
    }
    log('[' + 'setHeader' + '] ' +'End');

  },

  /**
  * Returns the value for the header specified by this.
  *
  * @throws NS_ERROR_INVALID_ARG
  *   if fieldName does not constitute a valid header field name
  * @throws NS_ERROR_NOT_AVAILABLE
  *   if the given header does not exist in this
  * @returns string
  *   the field value for the given header, possibly with non-semantic changes
  *   (i.e., leading/trailing whitespace stripped, whitespace runs replaced
  *   with spaces, etc.) at the option of the implementation; multiple
  *   instances of the header will be combined with a comma, except for
  *   the three headers noted in the description of getHeaderValues
  */
  getHeader: function(fieldName)
  {
    return this.getHeaderValues(fieldName).join('\n');
  },

  /**
  * Returns the value for the header specified by fieldName as an array.
  *
  * @throws NS_ERROR_INVALID_ARG
  *   if fieldName does not constitute a valid header field name
  * @throws NS_ERROR_NOT_AVAILABLE
  *   if the given header does not exist in this
  * @returns [string]
  *   an array of all the header values in this for the given
  *   header name.  Header values will generally be collapsed
  *   into a single header by joining all header values together
  *   with commas, but certain headers (Proxy-Authenticate,
  *   WWW-Authenticate, and Set-Cookie) violate the HTTP spec
  *   and cannot be collapsed in this manner.  For these headers
  *   only, the returned array may contain multiple elements if
  *   that header has been added more than once.
  */
  getHeaderValues: function(fieldName)
  {
    var name = headerUtils.normalizeFieldName(fieldName);

    if (name in this._headers)
    {
      return this._headers[name];
    }
    else
    {
      throw 'fff Cr.NS_ERROR_NOT_AVAILABLE';
    }
  },

  /**
  * Returns true if a header with the given field name exists in this, false
  * otherwise.
  *
  * @param fieldName : string
  *   the field name whose existence is to be determined in this
  * @throws NS_ERROR_INVALID_ARG
  *   if fieldName does not constitute a valid header field name
  * @returns boolean
  *   true if the header's present, false otherwise
  */
  hasHeader: function(fieldName)
  {
    var name = headerUtils.normalizeFieldName(fieldName);
    return (name in this._headers);
  },
};

/**
* A representation of the data in an HTTP request.
*
* @param port : uint
*   the port on which the server receiving this request runs
*/
function Request(port)
{
  /** Method of this request, e.g. GET or POST. */
  this._method = '';

  /** Path of the requested resource; empty paths are converted to '/'. */
  this._path = '';

  /** Query string, if any, associated with this request (not including '?'). */
  this._queryString = '';

  /** Scheme of requested resource, usually http, always lowercase. */
  this._scheme = 'http';

  /** Hostname on which the requested resource resides. */
  this._host = undefined;

  /** Port number over which the request was received. */
  this._port = port;

  var streamWrapper = new StreamWrapper();

  /** Stream from which data in this request's body may be read. */
  this._bodyInputStream = streamWrapper;

  /** Stream to which data in this request's body is written. */
  this._bodyOutputStream = streamWrapper;

  /**
  * The headers in this request.
  */
  this._headers = new HttpHeaders();

  /**
  * For the addition of ad-hoc properties and new functionality without having
  * to change nsIHttpRequest every time; currently lazily created, as its only
  * use is in directory listings.
  */
  this._bag = null;
}
Request.prototype =
{
  // http://doxygen.db48x.net/mozilla/html/interfacensIHttpRequest.html
  
  // SERVER METADATA
  get scheme()
  {
    return this._scheme;
  },
  get host()
  {
    return this._host;
  },
  get port()
  {
    return this._port;
  },

  // REQUEST LINE
  get method()
  {
    return this._method;
  },
  get httpVersion()
  {
    return this._httpVersion.toString();
  },
  get path()
  {
    return this._path;
  },
  get queryString()
  {
    return this._queryString;
  },
  // HEADERS
  getHeader: function(name)
  {
    return this._headers.getHeader(name);
  },
  hasHeader: function(name)
  {
    return this._headers.hasHeader(name);
  },
  get bodyInputStream()
  {
    return this._bodyInputStream;
  },
  get bodyBuffer()
  {
    return this._bodyInputStream.data;
  },
  
  // PRIVATE IMPLEMENTATION

  _writeBody: function(data, count)
  {
    this._bodyOutputStream.write(data, count);
  },
  _dumpHeaders: function()
  {
    var dumpStr = '<request_headers>\n';
    var headers = this._headers;

    for (var fieldName in headers._headers)
    {
      dumpStr += fieldName + ': ' + headers._headers[fieldName] + '\n';
    }

    dumpStr += '\n</request_headers>';
    console.log(dumpStr);
  },
  _dumpBody: function()
  {
    var dumpStr = '<request_body>\n';
    var getBinaryString = function(uint8array)
    {
      var arr = [];
      var str = '';
      var i;
      for (i = 0; i < uint8array.length; i++)
      {
        var s = '0' + uint8array[i].toString(16);

        arr.push(s.substring(s.length - 2));
      }

      for (i = 0; i < ((arr.length + 15) / 16); i++)
      {
        str += arr.slice(i * 16, i * 16 + 16).join(' ') + '\n';
      }

      return str;
    };

    dumpStr += getBinaryString(this._bodyInputStream.data);
    dumpStr += '\n</request_body>';
    console.log(dumpStr);
  }
};

function StreamWrapper()
{
  this._data = null;
  this._file = null;
}
StreamWrapper.prototype =
{
  /*
  * get data as Uint8Array
  */
  get data()
  {
    return this._data;
  },

  get size()
  {
    if (this._data)
    {
      return this._data.byteLength;
    }
    else if (this._file)
    {
      return this._file.size;
    }
    else
    {
      return 0;
    }
  },

  set file(f)
  {
    if (f.constructor.name !== 'RangedFile')
    {
      log('not a ranged file !!!!');
    }
    this._file = f;
  },

  get file()
  {
    return this._file;
  },

  write: function(inputData, length)
  {
    var dataType = Object.prototype.toString.call(inputData).slice(8, -1);
    var offset;
    var view;
    if (dataType == 'String')
    {
      log('write String');
      var utf8Octets = unescape(encodeURIComponent(inputData));

      if (!length)
      {
        length = utf8Octets.length;
      }

      offset = this._realloc(length);
      view = new Uint8Array(this._data);

      for (var i = 0; i < length; i++)
      {
        view[offset + i] = utf8Octets.charCodeAt(i);
      }
    }
    else if (dataType == 'Uint8Array' || dataType == 'ArrayBuffer')
    {
      log('write array/arraybuffer');
      var data = (dataType == 'Uint8Array') ?
                  inputData : new Uint8Array(inputData);

      if (!length)
      {
        length = data.length;
      }

      offset = this._realloc(length);
      view = new Uint8Array(this._data);
      view.set(data.subarray(0, length), offset);
    }
    else
    {
      log('write ranged file?:' + JSON.stringify(inputData));
      this._data = null;
      this.file = inputData;
    }
  },

  close: function()
  {
  },

  _realloc: function(length)
  {
    var offset = 0;

    if (this._data)
    {
      offset = this._data.byteLength;
      var newBuffer = new ArrayBuffer(offset + length);
      var oldView = new Uint8Array(this._data);
      var newView = new Uint8Array(newBuffer);
      newView.set(oldView, 0);
      this._data = newBuffer;
    }
    else
    {
      this._data = new ArrayBuffer(length);
    }
    return offset;
  }
};
