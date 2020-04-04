const { EventEmitter } = require('events');

const types = {
  WHISP: 0,
  PRIV: 1,
  CHAN: 2,
  BLOCK: 3
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
    emitter.on('party lead', function (d) { api.emit('party lead', d.isMe); });
    emitter.on('fl update', function (d) { api.emit('fl update', d.upd); });
    emitter.on('bad send', function () { api.emit('bad send'); });
    emitter.on('no exist whisp', function () { api.emit('no exist whisp'); });
    emitter.on('no exist block', function () { api.emit('no exist block'); });
    emitter.on('muted', function (d) { api.emit('muted', d.status, d.msg); });
    emitter.on('block', function (d) { api.emit('block', d.id, d.name, d.alert); });
    emitter.on('unblock', function (d) { api.emit('unblock', d.id, d.alert); });
    emitter.on('block list', function (d) { api.emit('block list', d.list); });
    emitter.on('guild login', function (d) { api.emit('guild login', d.name, d.comment); });
    emitter.on('guild logout', function (d) { api.emit('guild logout', d.name); });
    this.types = types;
  }
  sendMessage(type, target, msg) { this.emitter.send({ event: 'msg', data: { type, target, msg }, replyExpected: false }); }
  block(name) { this.emitter.send({ event: 'block', data: { name }, replyExpected: false }); }
  unblock(name) { this.emitter.send({ event: 'unblock', data: { name }, replyExpected: false }); }
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
  partyLead(isMe) { this.emitter.send({ event: 'party lead', data: { isMe }, replyExpected: false }); }
  flUpdate(upd) { this.emitter.send({ event: 'fl update', data: { upd }, replyExpected: false }); }
  badSend() { this.emitter.send({ event: 'bad send', data: {}, replyExpected: false }); }
  noExistWhisp() { this.emitter.send({ event: 'no exist whisp', data: {}, replyExpected: false }); }
  noExistBlock() { this.emitter.send({ event: 'no exist block', data: {}, replyExpected: false }); }
  muted(status, msg) { this.emitter.send({ event: 'muted', data: { status, msg }, replyExpected: false }); }
  block(id, name, alert) { this.emitter.send({ event: 'block', data: { id, name, alert }, replyExpected: false }); }
  unblock(id, alert) { this.emitter.send({ event: 'unblock', data: { id, alert }, replyExpected: false }); }
  blockList(list) { this.emitter.send({ event: 'block list', data: { list }, replyExpected: false }); }
  guildLogin(name, comment) { this.emitter.send({ event: 'guild login', data: { name, comment }, replyExpected: false }); }
  guildLogout(name) { this.emitter.send({ event: 'guild logout', data: { name }, replyExpected: false }); }
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
