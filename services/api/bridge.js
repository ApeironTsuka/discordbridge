const { EventEmitter } = require('events');

const types = {
  WHISP: 0,
  PRIV: 1,
  CHAN: 2
};

class proxyClientApi extends EventEmitter {
  constructor(emitter) {
    super();
    this.emitter = emitter;
    let api = emitter.api = this;
    emitter.on('msg', function (d) { api.emit('msg', d.type, d.target, d.from, d.msg); });
    emitter.on('priv join', function (d) { api.emit('priv join', d.chan); });
    emitter.on('priv left', function (d) { api.emit('priv left', d.chan); });
    emitter.on('priv notice', function (d) { api.emit('priv notice', d.chan, d.event, d.name); });
    emitter.on('priv list', function (d) { api.emit('priv list', d.privs); });
    emitter.on('party status', function (d) { api.emit('party status', d.party, d.raid); });
    emitter.on('party update', function (d) { api.emit('party update', d.upd); });
    emitter.on('fl update', function (d) { api.emit('fl update', d.upd); });
    emitter.on('bad send', function () { api.emit('bad send'); });
    emitter.on('muted', function (d) { api.amit('muted', d.status, d.msg); });
    this.types = types;
  }
  sendMessage(type, target, msg) { this.emitter.send({ event: 'msg', data: { type, target, msg }, replyExpected: false }); }
}

class proxyServerApi extends EventEmitter {
  constructor(emitter) {
    super();
    this.emitter = emitter;
    emitter.api = this;
    this.types = types;
    this.silenced = false;
  }
  msg(type, target, from, msg) { this.emitter.send({ event: 'msg', data: { type, target, from, msg}, replyExpected: false }); }
  privJoin(chan) { this.emitter.send({ event: 'priv join', data: { chan }, replyExpected: false }); }
  privLeft(chan) { this.emitter.send({ event: 'priv left', data: { chan }, replyExpected: false }); }
  privNotice(chan, event, name) { this.emitter.send({ event: 'priv notice', data: { chan, event, name }, replyExpected: false }); }
  privList(privs) { this.emitter.send({ event: 'priv list', data: { privs }, replyExpected: false }); }
  partyStatus(party, raid) { this.emitter.send({ event: 'party status', data: { party, raid }, replyExpected: false }); }
  partyUpdate(upd) { this.emitter.send({ event: 'party update', data: { upd }, replyExpected: false }); }
  flUpdate(upd) { this.emitter.send({ event: 'fl update', data: { upd }, replyExpected: false }); }
  badSend() { this.emitter.send({ event: 'bad send', data: {}, replyExpected: false }); }
  muted(status, msg) { this.emitter.send({ event: 'muted', data: { status, msg }, replyExpected: false }); }
  silence() {
    this.emitter._send = this.emitter.send;
    this.emitter.send = function (...args) { if (this.silenced) { return; } this._send(...args); };
    this.emitter.silenced = true;
    this.silenced = true;
  }
  unsilence() {
    this.emitter.send = this.emitter._send;
    delete this.emitter.silenced;
    this.silenced = false;
  }
}

module.exports = function (emitter, isServer) { return (isServer?new proxyServerApi(emitter):new proxyClientApi(emitter)); };
