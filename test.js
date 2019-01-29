'use strict';
const serviceEmitter = require('tserv-service').serviceEmitter,
      fs = require('fs'), vorpal = require('vorpal')();

let dispatchShim = {
  hook: function (p, v, cb) { dispatchShim.cbs[p] = cb; },
  toServer: function (...args) { console.log(args); },
  settings: { party: false, raid: false },
  cbs: {},
  game: { me: { name: 'Testperson' } },
  command: { add: function () {} },
  privs: {},
  privInds: {},
  privCounter: 0,
  ptype: 0
};

let partyPackets = [
  { id: 'S_PARTY_MEMBER_LIST', raid: true, members: [ { playerId: 1, online: true, name: 'Emonas' }, { playerId: 0, online: true, name: dispatchShim.game.me.name } ] },
  { id: 'S_PARTY_MEMBER_LIST', raid: true, members: [ { playerId: 1, online: true, name: 'Emonas' }, { playerId: 0, online: true, name: dispatchShim.game.me.name }, { playerId: 2, online: true, name: 'Badnets' } ] },
  { id: 'S_LOGOUT_PARTY_MEMBER', playerId: 2 },
  { id: 'S_PARTY_MEMBER_LIST', raid: true, members: [ { playerId: 1, online: true, name: 'Emonas' }, { playerId: 0, online: true, name: dispatchShim.game.me.name }, { playerId: 2, online: true, name: 'Badnets' } ] },
  { id: 'S_LEAVE_PARTY_MEMBER', playerId: 2, name: 'Badnets' },
  { id: 'S_LEAVE_PARTY' }
];
let flPackets = [
  { id: 'S_UPDATE_FRIEND_INFO', friends: [ { id: 0, name: 'Emonas', status: 1 } ] },
  { id: 'S_UPDATE_FRIEND_INFO', friends: [ { id: 0, name: 'Emonas', status: 2 }, { id: 1, name: 'Badnets', status: 0 } ] },
  { id: 'S_UPDATE_FRIEND_INFO', friends: [ { id: 1, name: 'Badnets', status: 2 } ] }
];

vorpal
  .command('test [what]', '')
  .action(function (w, cb) {
    switch (w.what) {
      case 'fl':
        for (let i = 0, l = flPackets.length; i < l; i++) {
          setTimeout(function () {
            console.log(`Calling packet ${i}`);
            dispatchShim.cbs[flPackets[i].id](flPackets[i]);
            if (i == l-1) { cb(); }
          }, 1000*i);
        }
        break;
      case 'party':
        for (let i = 0, l = partyPackets.length; i < l; i++) {
          setTimeout(function () {
            console.log(`Calling packet ${i}`);
            dispatchShim.cbs[partyPackets[i].id](partyPackets[i]);
            if (i == l-1) { cb(); }
          }, 1000*i);
        }
        break;
      case 'badmsg':
        dispatchShim.cbs['S_SYSTEM_MESSAGE']({ message: '@3161' });
        cb();
        break;
      default: console.log(`Unknown test ${w.what}`); cb(); return;
    }
  });

vorpal
  .command('sendmsg [type] [target] [from] [message...]', '')
  .action(function (w, cb) {
    switch (w.type) {
      case 'chat':
        {
          let channel, { from } = w;
          switch (w.target) {
            case 'say': channel = 0; break;
            case 'party': channel = 1; break;
            case 'guild': channel = 2; break;
            case 'area': channel = 3; break;
            case 'trade': channel = 4; break;
            case 'partyn': channel = 21; break;
            case 'raid': channel = 25; break;
            case 'global': channel = 27; break;
            case 'raidn': channel = 32; break;
            default: console.log(`Unknown message target "${w.target}"`); break;
          }
          if (!from) { console.log('Must provide a \'from\' for this message type'); break; }
          dispatchShim.cbs['S_CHAT']({ channel, authorName: from, message: `<FONT>${w.message.join(' ')}</FONT>` });
        }
        break;
      case 'priv':
        {
          let { target, from } = w, priv;
          if (!target) { console.log('Must provide a \'target\' for this message type'); break; }
          if (!from) { console.log('Must provide a \'from\' for this message type'); break; }
          priv = dispatchShim.privs[target];
          if (priv === undefined) { console.log('You must \'priv join\' that channel first'); break; }
          dispatchShim.cbs['S_PRIVATE_CHAT']({ channel: priv.id, authorName: from, message: `<FONT>${w.message.join(' ')}</FONT>` });
        }
        break;
      case 'whisp':
        {
          let from = w.target;
          if (!from) { console.log('Must provide a \'target\' for this message type'); break; }
          dispatchShim.cbs['S_WHISPER']({ authorName: from, recipient: dispatchShim.game.me.name, message: `<FONT>${w.from+(w.message?' '+w.message.join(' '):'')}</FONT>` });
        }
        break;
      default: console.log(`Unknown message type "${w.type}"`); break;
    }
    cb();
  });

vorpal
  .command('priv [action] [target]', '')
  .action(function (w, cb) {
    switch (w.action) {
      case 'join':
        {
          let target = w.target, priv, ind = -1;
          if (!target) { console.log('Must provide a \'target\' for this command'); break; }
          if (dispatchShim.privs[target]) { console.log('Already in that channel'); break; }
          for (let i = 0, inds = dispatchShim.privInds; i < 8; i++) { if (!inds[i]) { ind = i; break; } }
          priv = dispatchShim.privs[target] = { id: dispatchShim.privCounter++, ind };
          dispatchShim.privInds[priv.id] = true;
          dispatchShim.cbs['S_JOIN_PRIVATE_CHANNEL']({ index: ind, channelId: priv.id, name: target });
        }
        break;
      case 'leave':
        {
          let target = w.target, id;
          if (!target) { console.log('Must provide a \'target\' for this command'); break; }
          if (!dispatchShim.privs[target]) { console.log('Not in that channel'); break; }
          id = dispatchShim.privs[target].id;
          delete dispatchShim.privs[target];
          delete dispatchShim.privInds[id];
          dispatchShim.cbs['S_LEAVE_PRIVATE_CHANNEL']({ channelId: id });
        }
        break;
      default: console.log(`Unknown action "${w.action}"`); break;
    }
    cb();
  });
vorpal
  .command('party [type] [raid]', '')
  .action(function (w, cb) {
    switch (w.type) {
      case 'join':
        if (dispatchShim.ptype != 0) { console.log('Already in a party/raid'); break; }
        dispatchShim.ptype = (w.raid == 'raid'?2:1);
        dispatchShim.cbs['S_PARTY_MEMBER_LIST']({ raid: w.raid == 'raid' });
        break;
      case 'leave':
        if (!dispatchShim.ptype) { console.log('Not in a party/raid'); break; }
        dispatchShim.ptype = 0;
        dispatchShim.cbs['S_LEAVE_PARTY']({});
        break;
      default: console.log(`Unknown type "${w.type}"`); break;
    }
    cb();
  });

vorpal.find('exit').remove();
vorpal
  .command('exit', '')
  .action(function (w, cb) {
    if (fs.existsSync('discord/_auth')) {
      fs.renameSync('discord/auth', 'discord/realauth');
      fs.renameSync('discord/_auth', 'discord/auth');
    }
    dispatchShim.inst.destructor();
    setTimeout(() => process.exit(), 1000);
  });
vorpal
  .command('init', '')
  .action(function (w, cb) {
    if (!fs.existsSync('discord/_auth')) {
      fs.renameSync('discord/auth', 'discord/_auth');
      fs.renameSync('discord/realauth', 'discord/auth');
    }
    let mod = require('./index.js');
    dispatchShim.inst = new mod(dispatchShim);
    cb();
  });
vorpal.delimiter('>').show();
