'use strict';
var fs = require('fs'),
    util = require('util'),
    net = require('net'),
    eachline = require('eachline'),
    EventEmitter = require('events').EventEmitter,
    glob = require('glob'),
    cwd = process.cwd();

function argsToArray(args) { var out = []; for (var i = 0, l = args.length; i < l; i++) { out.push(args[i]); } return out; }
function ServiceNotFoundError(s) { this.name = 'ServiceNotFoundError'; this.service = s; this.message = (s?'Service "'+s+'" not found':'Service not found'); }
util.inherits(ServiceNotFoundError, Error);
function reparsePath(p) {
  if (! /(\.\/|\/\/)/.test(p)) { return p; }
  var a = p.split(/\//), a2 = [], out = '';
  for (var i = 0, l = a.length; i < l; i++) {
    if ((a[i] == '.') || (a[i] == '')) { continue; }
    else if (a[i] == '..') { a2.pop(); }
    else { a2.push(a[i]); }
  }
  if (a2.length == 0) { return '/'; }
  a = a2.join('/');
  if (! /^\//.test(a)) { a = '/'+a; }
  return a;
}

function serviceEmitter(con) {
  EventEmitter.call(this);
  this.eventIDs = 0;
  this.eventHandlers = {};
  this.handled = {};
  this.elCount = {};
  this.elFired = {};
  this.boundMap = {};
  this.socket = (con?con:undefined);
}
util.inherits(serviceEmitter, EventEmitter);
serviceEmitter.prototype.reparsePath = reparsePath;
serviceEmitter.ids = 0;
serviceEmitter.uidf = serviceEmitter.prototype._uidf = function () { return (Math.floor(Math.random()*15728640)+1048576).toString(16); };
var noProcess = false;
if (!process.send) { noProcess = true; }
serviceEmitter.processListener = function (m) {
  if (m.type == 'go') { this.emit('init'); }
  else if (m.type == 'stop') { console.log('exiting...'); this.emit('exit'); setTimeout(function () { process.exit(); }, 1000); }
};
serviceEmitter.prototype.init = function (sn, o) {
  this.boundPL = serviceEmitter.processListener.bind(this);
  var keep;
  if ((typeof o === 'boolean') || (o instanceof Boolean)) { keep = !!o; }
  else { keep = !!o.keep; }
  var thisvar = this;
  this.connections = { _count: 0 };
  var sockClosed = function () {
    if (this.ceFired) { return; }
    this.ceFired = true;
    this.emit('disconnected');
    if (thisvar.connections[this.id]) {
      delete thisvar.connections[this.id];
      thisvar.connections._count--;
    }
    if ((thisvar.connections._count == 0) && (!keep)) { thisvar.exit(); }
  };
  this.type = sn;
  this.server = net.createServer((function (c) {
    var k = new serviceEmitter(c);
    eachline(c, serviceEmitter.dataHandler.bind(k, this));
    k.ceFired = false;
    c.on('end', sockClosed.bind(k));
    c.on('close', sockClosed.bind(k));
    c.on('error', sockClosed.bind(k));
    c._write_ = c.write;
    c.write = function () { if (k.ceFired) { return; } return this._write_.apply(this, arguments); };
    k.type = sn;
    k.fromServer = true;
    k.server = thisvar;
    thisvar.connections._count++;
    k.on('disconnected', function () { var id = this.id, cons = this.server.connections; if (!cons[id]) { return; } delete cons[id]; thisvar.connections._count--; });
    c.write(JSON.stringify({ type: 'init', data: {} })+'\n', 'utf8', function () { /*console.log('sent init');*/ });
  }).bind(this));
  this.server.listen(0, function () { if (noProcess) { return; } process.send({ type: 'port', port: thisvar.port }); });
  this.port = this.server.address().port;
  if (!noProcess) { process.on('message', this.boundPL); }
};
function replyFunc(id, m) { this.socket.write(JSON.stringify({ type: 'reply', id: id, data: m===undefined?false:m })+'\n', 'utf8', function (e) { }); }
serviceEmitter.dataHandler = function (serv, data) {
  if (data.length == 0) { return; }
  var d;
  try { d = JSON.parse(data); } catch (e) { console.log(e); return; } // FIXME
  if (d.type == 'msg') {
    this.expectsReply = !!d.replyExpected;
    this.handled[d.event] = false;
    this.elFired[d.event] = 0;
    this.emit(d.event, d.data, replyFunc.bind(this,d.id));
  } else if (d.type == 'reply') {
    if (this.eventHandlers['__reply_'+d.id]) { this.eventHandlers['__reply_'+d.id](d.data); }
  } else if (d.type == 'stop') {
    if (serv) { return; }
    this.emit('stop');
    this.disconnect();
  } else if (d.type == 'init') {
    if (!serv) {
      this.socket.write(JSON.stringify({ type: 'init', id: this.id })+'\n', 'utf8', function () { });
    } else {
      this.id = d.id;
      if (serv.connections[d.id]) { this.socket.write(JSON.stringify({ type: 'init_nck' })+'\n', 'utf8', function () { }); return; }
      serv.connections[d.id] = this;
      this.socket.write(JSON.stringify({ type: 'init_ack' })+'\n', 'utf8', function () { });
      serv.emit('connection', this);
    }
  }
  else if (d.type == 'init_ack') { if (!serv) { this.ready = true; this.emit('ready'); } }
  else if (d.type == 'init_nck') { if (!serv) { this.emit('nck'); } }
};
serviceEmitter.prototype.connectToP = function (sn, p) { this.connectTo({ name: sn, port: p }); };
serviceEmitter.prototype.connectTo = function (sn, h, e) {
  var s = sn, p;
  if (!this.id) { return; } // FIXME
  this.isP = false;
  if (sn.port) { s = sn.name; p = sn.port; this.isP = true; }
  else {
    p = process.cwd()+'/services/ports/'+s+'.port';
    if (!fs.existsSync(p)) { console.log('cwd failed'); }
    console.log(p);
    try { p = parseInt(fs.readFileSync(p, 'utf8').toString()); }
    catch (e) { p = undefined; }
  }
  this._port = p;
  var temp = {};
  if (this.api) { delete this.api; }
  for (var i = 0, keys = Object.keys(this._events), l = keys.length; i < l; i++) {
    switch (keys[i]) {
      case 'ready': case 'error': case 'disconnect': case 'reconnect': case 'reconnected': temp[keys[i]] = this._events[keys[i]]; break;
      default: break;
    }
  }
  this._events = temp;
  if (h) { this.once('ready', h); }
  if (e) { this.on('error', e); }
  this.type = s;
  if (!this.socket) {
    this.hid = serviceEmitter.ids++;
    this._pmservhdlr = (function (m) {
        switch (m.type) {
          case 'service': this._handleService(m); break;
          default: break;
        }
    }).bind(this);
    if (!this._port) { if (!noProcess) { process.on('message', this._pmservhdlr); process.send({ type: 'service event', id: this.hid, service: this.type, name: 'start' }); } }
    else { this._handleService({ name: 'port', id: this.hid, port: this._port }); }
    return true;
  }
  return false;
};
serviceEmitter.prototype.setIdentifier = function (id) { this.id = id; };
serviceEmitter.prototype._handleService = function (m) {
  if (this.hid != m.id) { return; }
  if ((this._pmservhdlr) && (!noProcess)) { process.removeListener('message', this._pmservhdlr); }
  delete this._pmservhdlr;
  var thisvar = this;
  switch (m.name) {
    case 'port':
      this.socket = net.connect({ host: 'localhost', port: m.port }, function () {
        thisvar.isConnected = true;
        if (this._reconnected) { this.emit('reconnected'); this._reconnected = false; }
      })
      // FIXME handle connection closure better (retry to connect 3 times before firing a 'disconnected' event)
      .on('close', function () {
        if (!thisvar.isConnected) { return; }
        thisvar.isConnected = false;
        thisvar.emit('disconnected');
        // Automatically reconnect when .connectTo() was used
        delete thisvar.socket;
        if (!thisvar.isP) { setTimeout(function () { thisvar._reconnected = true; thisvar.connectTo(thisvar.type); }, 5000); }
        // Otherwise, tell the user to reconnect manually
        else { thisvar.emit('reconnect'); }
      })
      .on('error', function (e) {
        if (!thisvar.isConnected) { return; }
        thisvar.isConnected = false;
        thisvar.emit('error', e);
      });
      this.socket._write_ = this.socket.write;
      this.socket.write = function () { if (!thisvar.isConnected) { return; } return this._write_.apply(this, arguments); };
      eachline(this.socket, serviceEmitter.dataHandler.bind(this, undefined));
      break;
    case 'none': this.emit('error', new ServiceNotFoundError(m.service)); break;
    case 'error': if (m.e == 'NoService') { this.emit('error', new ServiceNotFoundError(m.service)); } break;
    default: break;
  }
};
// { id: eventID, event: 'event name', data: {}, replyexpected: true/false }
// m = { event: 'event name', data: {}, callback: function () {}, replyExpected: true/false }
serviceEmitter.prototype.send = function (m) {
  var hid = serviceEmitter.ids++;
  if ((m.replyExpected) && (!m.callback)) { m.replyExpected = false; }
  if (m.callback) { this.eventHandlers['__reply_'+hid] = m.callback.bind(this); }
  var p = JSON.stringify({ type: 'msg', event: m.event, id: hid, data: m.data, replyExpected: !!m.replyExpected })+'\n';
  this.socket.write(p, 'utf8', function () { /*console.log('sent');*/ });
};
serviceEmitter.prototype.disconnect = function () { if (!this.isConnected) { return; } this.isConnected = false; this.socket.end(); };
serviceEmitter.prototype.destroy = function () { if (!noProcess) { return; } process.removeListener('message', this.boundPL); };
serviceEmitter.prototype.isHandled = function (n) { return (!!this.handled[n]); };
serviceEmitter.prototype.handle = function (n) { this.handled[n] = true; };
serviceEmitter.prototype.exit = function () {
  this.server.close();
  if (noProcess) { return; }
  process.send({ type: 'stop' });
};
function findApi(n) {
  var err, p, found;
  n = n.replace(/(\.\.|\\|\/)/g, '');
  try { p = require.resolve(cwd+'/services/api/'+n+'.js'); found = true; } catch (err) { found = false; }
  if (found) { return p; }
  try { p = require.resolve(__dirname+'/../../services/api/'+n+'.js'); found = true; } catch (err) { found = false; }
  if (found) { return p; }
  var statCache = {}, exts = glob.sync(cwd+'/extensions/*', { stat: true, statCache: statCache });
  for (var i = 0, l = exts.length; i < l; i++) {
    if (!statCache[exts[i]].isDirectory()) { continue; }
    try { p = require.resolve(exts[i]+'/services/api/'+n+'.js'); found = true; } catch (err) { found = false; }
    if (found) { return p; }
  }
  return '';
}
function findApiExt(n,e) {
  var err, p, found;
  n = n.replace(/(\.\.|\\|\/)/g, '');
  try { p = require.resolve(cwd+'/services/api/'+n+'-'+e+'.js'); found = true; }
  catch (err) { try { p = require.resolve(cwd+'/services/api/_'+e+'.js'); } catch (err) { found = false; } }
  if (found) { return p; }
  try { p = require.resolve(__dirname+'/../../services/api/'+n+'-'+e+'.js'); found = true; }
  catch (err) { try { p = require.resolve(__dirname+'/../../services/api/_'+e+'.js'); } catch (err) { found = false; } }
  if (found) { return p; }
  var statCache = {}, exts = glob.sync(cwd+'/extensions/*', { stat: true, statCache: statCache });
  for (var i = 0, l = exts.length; i < l; i++) {
    if (!statCache[exts[i]].isDirectory()) { continue; }
    try { p = require.resolve(exts[i]+'/services/api/'+n+'-'+e+'.js'); found = true; }
    catch (err) { try { p = require.resolve(exts[i]+'/services/api/_'+e+'.js'); found = true; } catch (err) { found = false; } }
    if (found) { return p; }
  }
  return undefined;
}
serviceEmitter.prototype.loadApi = function () {
  var p = findApi(this.type), o;
  if (!p) { console.log('cwd failed load', this.type); return undefined; }
  if (this.api) { return; }
  try { o = require(p); }
  catch (e) { console.log(e.stack); return undefined; }
  return o(this, (!!this.server || !!this.fromServer));
};
serviceEmitter.prototype.extendApi = function (n) {
  var o, p;
  p = findApiExt(this.type, n);
  if (!p) { console.log('cwd failed extend', this.type, n); return undefined; }
  if (this.api[n]) { return; }
  try { o = require(p); }
  catch (e) { console.log(e.stack); return false; }
  var api = this.api[n] = { _events: [] };
  api.on = (function (n, f) { api._events.push({ n: n, f: f }); this.on(n, f); }).bind(this);
  api.off = (function (n, f) {
    for (var i = 0, e = api._events, l = e.length; i < l; i++) { if ((e[i].n == n) && (e[i].f == f)) { e.splice(i, 1); i--; l--; } }
    this.off(n, f);
  }).bind(this);
  o(this.api, api, (!!this.server || !!this.fromServer));
  return true;
};
serviceEmitter.prototype.cleanApi = function (n) {
  if (!this.api[n]) { return; }
  for (var i = 0, e = this.api[n]._events, l = e.length; i < l; i++) { this.off(e[i].n, e[i].f); }
  delete this.api[n];
};
module.exports = {
  serviceEmitter: serviceEmitter,
  reparsePath: reparsePath
};
