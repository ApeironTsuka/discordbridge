const { serviceEmitter } = require('tserv-service');

function attachEvents(c) {
  let prox = bridgeServer.inst;
  if (bridgeServer.client) { return; }
  bridgeServer.client = c;
  c.loadApi();
  c.on('msg', function (d) {
    let types = c.api.types, channel;
    let { type, target, msg: message } = d;
    switch (d.type) {
      case types.CHAN:
        switch (target) {
          case 'say': channel = 0; break;
          case 'party': channel = 1; break;
          case 'guild': channel = 2; break;
          case 'area': channel = 3; break;
          case 'trade': channel = 4; break;
          case 'raid': channel = 25; break;
          case 'global': channel = 27; break;
          default: return;
        }
        prox.dispatch.toServer('C_CHAT', 1, { channel, message });
        bridgeServer.lastSent = d.type;
        break;
      case types.WHISP:
        prox.dispatch.toServer('C_WHISPER', 1, { target, message });
        bridgeServer.lastSent = d.type;
        break;
      case types.PRIV:
        if (!bridgeServer.privs.names[target]) { return; }
        prox.dispatch.toServer('C_CHAT', 1, { channel: 11+bridgeServer.privs.names[target].ind, message });
        bridgeServer.lastSent = d.type;
        break;
      default: return;
    }
  });
  let settings = prox.dispatch.settings;
  c.api.partyStatus(settings.party, settings.raid);
  c.api.privList(bridgeServer.privs.names);
}
function idToChan(id) {
  switch (id) {
    case 0: return 'say';
    case 1: return 'party';
    case 2: return 'guild';
    case 3: return 'area';
    case 4: return 'trade';
    case 21: return 'partyn';
    case 25: return 'raid';
    case 27: return 'global';
    case 32: return 'raidn';
    default: return undefined;
  }
}

class bridgeServer {
  constructor(emitter, dispatch) { this.emitter = emitter; this.dispatch = dispatch; }
  begin() { this.emitter.on('connection', attachEvents.bind(this)); }
  static init(dispatch) {
    let e = new serviceEmitter(), server;
    e.init('bridge', { keep: true });
    server = new bridgeServer(e, dispatch);
    server.begin();
    bridgeServer.inst = server;
    bridgeServer.running = true;
    bridgeServer.lastSent = false;
  }
  static destroy() {
    bridgeServer.discord.kill();
    bridgeServer.inst.emitter.server.close();
    bridgeServer.running = false;
    bridgeServer.partyManager.clear();
    bridgeServer.flManager.clear();
  }
}
class FLList {
  constructor(list) { this.list = list||[]; }
  has(id) {
    for (let i = 0, list = this.list, l = list.length; i < l; i++) { if (list[i].id == id) { return list[i]; } }
    return false;
  }
  get(id) { return this.has(id)||undefined; }
  add(id, name, status) {
    if (this.has(id)) { return; }
    this.list.push({ id, name, status });
  }
  rem(id) { for (let i = 0, list = this.list, l = list.length; i < l; i++) { if (list[i].id == id) { list.splice(i, 1); return true; } } return false; }
  get length() { return this.list.length; }
  set length(n) { this.list.length = n; }
}
class FLManager {
  constructor(cb) { this.cb = cb; this.list = new FLList(); }
  update(newlist) {
    let { list: olist, cb } = this, t, ev = [],
        nlist = new FLList(newlist.friends), priming = olist.length == 0;
    for (let i = 0, { list } = nlist, l = list.length; i < l; i++) {
      let p = list[i];
      if (!olist.has(p.id)) {
        olist.add(p.id, p.name, p.status);
        if (!priming) { ev.push({ id: p.id, name: p.name, status: p.status }); }
        continue;
      }
      t = olist.get(p.id);
      if (t.status != p.status) {
        ev.push({ id: t.id, name: t.name, status: p.status });
        t.status = p.status;
      }
    }
    if (ev.length) { cb(ev); }
  }
  clear() { this.list.length = 0; }
}
class PartyList {
  constructor(list) { this.list = list||[]; }
  has(id) {
    for (let i = 0, list = this.list, l = list.length; i < l; i++) { if (list[i].playerId == id) { return list[i]; } }
    return false;
  }
  get(id) { return this.has(id)||undefined; }
  add(id, name, online) {
    if (this.has(id)) { return; }
    this.list.push({ playerId: id, name, online });
  }
  rem(id) { for (let i = 0, list = this.list, l = list.length; i < l; i++) { if (list[i].playerId == id) { list.splice(i, 1); return true; } } return false; }
  get length() { return this.list.length; }
  set length(n) { this.list.length = n; }
}
class PartyManager {
  constructor(cb) { this.cb = cb; this.list = new PartyList(); }
  update(newlist) {
    let { list: olist, cb } = this, t, ev = [],
        nlist = new PartyList(newlist.members);
    this.type = newlist.raid?'raid':'party';
    for (let i = 0, { list } = nlist, l = list.length; i < l; i++) {
      let p = list[i];
      if (!olist.has(p.playerId)) {
        olist.add(p.playerId, p.name, p.online);
        ev.push({ ev: 'join', id: p.playerId, name: p.name, online: p.online });
        continue;
      }
      t = olist.get(p.playerId);
      if (t.online != p.online) {
        if (p.online) {
          t.online = true;
          ev.push({ ev: 'online', id: t.playerId, name: t.name });
        } else {
          t.online = false;
          ev.push({ ev: 'offline', id: t.playerId, name: t.name });
        }
      }
    }
    for (let i = 0, { list } = olist, l = list.length; i < l; i++) {
      let p = list[i];
      if (!nlist.has(p.playerId)) {
        ev.push({ ev: 'left', id: p.playerId, name: p.name });
        olist.rem(p.playerId);
      }
    }
    if (ev.length) { cb(ev); }
  }
  offline(pid) {
    let t = this.list.get(pid);
    if (!t) { return; }
    t.online = false;
    this.cb([ { ev: 'offline', id: t.playerId, name: t.name } ]);
  }
  online(pid) {
    let t = this.list.get(pid);
    if (!t) { return; }
    t.online = true;
    this.cb([ { ev: 'online', id: t.playerId, name: t.name } ]);
  }
  left(pid) {
    let t = this.list.get(pid);
    if (!t) { return; }
    this.list.rem(pid);
    this.cb([ { ev: 'left', id: t.playerId, name: t.name } ]);
  }
  clear() { this.list.length = 0; this.type = 'none'; }
}
module.exports = function DiscordBridge(dispatch) {
  if (bridgeServer.running) { console.log('Only the first loaded TERA instance can use Discord'); return; }
  let emitter, types, { settings } = dispatch, privs = bridgeServer.privs = { names: {}, ids: {} };
  let discordPath = `${__dirname}/discord`, fs = require('fs');
  try { fs.statSync(`${discordPath}/node_modules/discord.js`); }
  catch (e) {
    console.error('DiscordBridge was not set up properly. Be sure to follow the readme.');
    console.error('Error: Discord.js not found. Probably freshly installed this module. Exit Proxy and follow the readme to finish the setup this module sadly can\'t do on its own at this time.');
    return;
  }
  try {
    let auth = JSON.parse(fs.readFileSync(`${discordPath}/auth`));
    if ((!auth.owner) || (!auth.sekrit)) {
      console.error('DiscordBridge was not set up properly. Be sure to follow the readme.');
      console.error('Error: Missing owner or token in discord/auth config file.');
      return;
    }
  } catch (e) {
    console.error('DiscordBridge was not set up properly. Be sure to follow the readme.');
    console.error('Error loading discord/auth config file. Usually this is because of missing "" around owner or token.');
    return;
  }
  bridgeServer.init(dispatch);
  settings.raid = settings.party = false;
  bridgeServer.discord = require('child_process').fork(`${discordPath}/main.js`, [ bridgeServer.inst.emitter.port ], { cwd: discordPath });
  this.destructor = function () { bridgeServer.destroy(); };
  dispatch.hook('C_CHAT', 1, (event) => {
    let { client } = bridgeServer, target;
    if (!client) { return; }
    bridgeServer.lastSent = false;
    if ((event.channel >= 11) && (event.channel <= 18)) {
      let ind = event.channel-11;
      for (let i = 0, ids = privs.ids, keys = Object.keys(ids), l = keys.length; i < l; i++) {
        if (ids[keys[i]].ind == ind) {
          client.api.msg(client.api.types.PRIV, ids[keys[i]].name, dispatch.game.me.name, event.message);
          break;
        }
      }
    } else {
      let target = idToChan(event.channel);
      if (!target) { return; }
      client.api.msg(client.api.types.CHAN, target, dispatch.game.me.name, event.message);
    }
  });
  dispatch.hook('C_WHISPER', 1, (event) => {
    let { client } = bridgeServer, target;
    if (!client) { return; }
    bridgeServer.lastSent = false;
    client.api.msg(client.api.types.WHISP, dispatch.game.me.name, undefined, event.message);
  });
  dispatch.hook('S_CHAT', 2, (event) => {
    let { client } = bridgeServer, target;
    if (!client) { return; }
    target = idToChan(event.channel);
    if (!target) { return; }
    client.api.msg(client.api.types.CHAN, target, event.authorName, event.message);
  });
  dispatch.hook('S_WHISPER', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.msg(client.api.types.WHISP, undefined, event.authorName, event.message);
  });
  dispatch.hook('S_JOIN_PRIVATE_CHANNEL', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    privs.ids[event.channelId] = privs.names[event.name] = { id: event.channelId, ind: event.index, name: event.name };
    client.api.privJoin(event.name);
  });
  dispatch.hook('S_LEAVE_PRIVATE_CHANNEL', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    let n = privs.ids[event.channelId].name;
    client.api.privLeft(n);
    delete privs.ids[event.channelId];
    delete privs.names[n];
  });
  dispatch.hook('S_PRIVATE_CHAT', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.msg(client.api.types.PRIV, privs.ids[event.channel].name, event.authorName, event.message);
  });
  dispatch.hook('S_PRIVATE_CHANNEL_NOTICE', 2, (event) => {
    let { client } = bridgeServer, ev = event.event;
    if (!client) { return; }
    ev = dispatch.parseSystemMessage(`@${ev}`);
    switch (ev.id) {
      case 'SMT_PRIVATE_CHANNEL_ENTER':
        client.api.privNotice(privs.ids[event.channelId].name, 'enter', event.name);
        break;
      case 'SMT_PRIVATE_CHANNEL_EXIT':
        client.api.privNotice(privs.ids[event.channelId].name, 'exit', event.name);
        break;
      default: return;
    }
  });
  let partyManager = bridgeServer.partyManager = new PartyManager((evs) => {
    let out = '', { client } = bridgeServer;
    if (!client) { return; }
    for (let i = 0, l = evs.length; i < l; i++) {
      switch (evs[i].ev) {
        case 'online': out += `${evs[i].name} has come online\n`; break;
        case 'offline': out += `${evs[i].name} has gone offline\n`; break;
        case 'join': out += `${evs[i].name} has joined the ${partyManager.type}\n`; break;
        case 'left': out += `${evs[i].name} has left the ${partyManager.type}\n`; break;
        default: continue;
      }
    }
    client.api.partyUpdate(out);
  });
  dispatch.hook('S_PARTY_MEMBER_LIST', 7, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    settings.party = true;
    settings.raid = event.raid;
    client.api.partyStatus(true, event.raid);
    partyManager.update(event);
  });
  dispatch.hook('S_LEAVE_PARTY', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.partyUpdate(`You have left the ${partyManager.type}\n`);
    settings.party = settings.raid = false;
    client.api.partyStatus(false, false);
    partyManager.clear();
  });
  dispatch.hook('S_LOGOUT_PARTY_MEMBER', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    partyManager.offline(event.playerId);
  });
  dispatch.hook('S_LEAVE_PARTY_MEMBER', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    partyManager.left(event.playerId);
  });
  /*dispatch.hook('S_PARTY_MEMBER_INTERVAL_POS_UPDATE', 3, (event) => { // FIXME THERE MUST BE A BETTER WAY
    let { client } = bridgeServer;
    if (!client) { return; }
    partyManager.online(event.playerId);
  });*/
  let flManager = bridgeServer.flManager = new FLManager((evs) => {
    let out = '', { client } = bridgeServer;
    if (!client) { return; }
    for (let i = 0, l = evs.length; i < l; i++) {
      out += `${evs[i].name} has changed status to: `;
      switch (evs[i].status) {
        case 0: out += 'offline'; break;
        case 1: out += 'busy'; break;
        case 2: out += 'online'; break;
        default: out += `unknown (${evs[i].status})`; break;
      }
      out += '\n';
    }
    client.api.flUpdate(out);
  });
  dispatch.hook('S_UPDATE_FRIEND_INFO', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    flManager.update(event);
  });
  dispatch.hook('S_MUTE', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.muted(idToChan(event.channel), event.status);
  });
  dispatch.hook('S_SYSTEM_MESSAGE', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    let message = dispatch.parseSystemMessage(event.message);
    if (bridgeServer.lastSent !== false) {
      if (message.id == 'SMT_CHAT_INPUTRESTRICTION_ERROR') { client.api.badSend(); }
      else if ((message.id == 'SMT_GENERAL_NOT_IN_THE_WORLD') && (bridgeServer.lastSent == client.api.types.WHISP)) { client.api.noExist(); }
    }
  });
  dispatch.command.add('discordbridge', {
    $default() { dispatch.command.message('Usage: discordbridge [on/off]. Turns on/off using the bridge.'); },
    on() {
      let { client } = bridgeServer;
      if (!client) { dispatch.command.message('No running Discord instance found'); return; }
      if (client.api.silenced) { return; }
      client.api.silence();
      dispatch.command.message('Bridge silenced. Note that the Discord instance is still running, just not being used.');
    },
    off() {
      let { client } = bridgeServer;
      if (!client) { dispatch.command.message('No running Discord instance found'); return; }
      if (!client.api.silenced) { return; }
      client.api.unsilence();
      dispatch.command.message('Bridge unsilenced. Discord will begin broadcasting again.');
    }
  });
};
