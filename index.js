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
          case 'partyn': channel = 21; break;
          case 'raid': channel = 25; break;
          case 'global': channel = 27; break;
          case 'raidn': channel = 32; break;
          default: return;
        }
        prox.mod.toServer('C_CHAT', 1, { channel, message });
        bridgeServer.lastSent = d.type;
        break;
      case types.WHISP:
        prox.mod.toServer('C_WHISPER', 1, { target, message });
        bridgeServer.lastSent = d.type;
        break;
      case types.PRIV:
        if (!bridgeServer.privs.names[target]) { return; }
        prox.mod.toServer('C_CHAT', 1, { channel: 11+bridgeServer.privs.names[target].ind, message });
        bridgeServer.lastSent = d.type;
        break;
      default: return;
    }
  });
  c.on('block', function (d) {
    let types = c.api.types;
    let { name } = d;
    prox.mod.toServer('C_BLOCK_USER', 1, { name });
    bridgeServer.lastSent = types.BLOCK;
  });
  c.on('unblock', function (d) {
    let types = c.api.types;
    let { name } = d;
    prox.mod.toServer('C_REMOVE_BLOCKED_USER', 1, { name });
    bridgeServer.lastSent = types.BLOCK;
  });
  let settings = bridgeServer.settings;
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
  constructor(emitter, mod) { this.emitter = emitter; this.mod = mod; }
  begin() { this.emitter.on('connection', attachEvents.bind(this)); }
  static init(mod) {
    let e = new serviceEmitter(), server;
    e.init('bridge', { keep: true });
    server = new bridgeServer(e, mod);
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
class FLManager {
  constructor(cb) { this.cb = cb; this.list = new Map(); }
  update(newlist) {
    let { list: olist, cb } = this, t, ev = [],
        list = newlist.friends, priming = olist.size == 0;
    function obj(p) { return { id: p.id, name: p.name, status: p.status }; }
    for (let i = 0, l = list.length; i < l; i++) {
      let p = list[i], k = obj(p);
      if (!olist.has(p.id)) {
        olist.set(p.id, k);
        if (!priming) { ev.push(k); }
        continue;
      }
      t = olist.get(p.id);
      if (t.status != p.status) {
        t.status = p.status;
        ev.push(obj(t));
      }
    }
    if (ev.length) { cb(ev); }
  }
  clear() { this.list.length = 0; }
  busy(id, state) {
    let u = this.list.get(id);
    if (u === undefined) { return; }
    u.status = (state?1:0);
    this.cb({ id, name: u.name, status: u.status });
  }
}
class PartyManager {
  constructor(cb) { this.cb = cb; this.list = new Map(); }
  update(newlist, lead) {
    let { list: olist, cb } = this, t, ev = [],
        list = newlist.members, nmap = new Map();
    function obj(p) { return { id: p.playerId, name: p.name, online: p.online, lead: p.playerId == lead }; }
    this.type = newlist.raid?'raid':'party';
    for (let i = 0, l = list.length; i < l; i++) {
      let p = list[i], k = obj(p);
      nmap.set(p.id, k);
      if (!olist.has(p.playerId)) {
        olist.set(p.playerId, k);
        ev.push({ ev: 'join', p: k });
        continue;
      }
      t = olist.get(p.playerId);
      if (t.online != p.online) {
        if (p.online) {
          t.online = true;
          ev.push({ ev: 'online', p: obj(t) });
        } else {
          t.online = false;
          ev.push({ ev: 'offline', p: obj(t) });
        }
      }
    }
    for (const p of olist) {
      if (!nmap.has(p.playerId)) {
        ev.push({ ev: 'left', p });
        olist.delete(p.playerId);
      }
    }
    //if ((this.lead != 0) && (this.lead != lead)) { ev.push({ ev: 'lead', p: this.list.get(lead) }); }
    this.lead = lead;
    if (ev.length) { cb(ev); }
  }
  offline(pid) {
    let p = this.list.get(pid);
    if (!p) { return; }
    if (!p.online) { return; }
    p.online = false;
    this.cb([ { ev: 'offline', p } ]);
  }
  online(pid) {
    let p = this.list.get(pid);
    if (!p) { return; }
    if (p.online) { return; }
    p.online = true;
    this.cb([ { ev: 'online', p } ]);
  }
  left(pid) {
    let p = this.list.get(pid);
    if (!p) { return; }
    this.list.delete(pid);
    this.cb([ { ev: 'left', p } ]);
    if (this.list.size == 1) {
      this.cb([ { ev: 'left', p: this.list.values().next().value }, { ev: 'disband' } ]);
      this.clear();
    }
  }
  leader(pid) {
    let pc = this.list.get(this.lead), p = this.list.get(pid);
    if ((!pc) || (!p)) { return; }
    pc.lead = false;
    p.lead = true;
    this.lead = pid;
    this.cb([ { ev: 'lead', p } ]);
  }
  clear() { this.list.clear(); this.type = 'none'; this.lead = 0; }
}
module.exports = function DiscordBridge(mod) {
  if (bridgeServer.running) { console.log('Only the first loaded TERA instance can use Discord'); return; }
  let emitter, types, settings = bridgeServer.settings = {}, privs = bridgeServer.privs = { names: {}, ids: {} };
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
  bridgeServer.init(mod);
  settings.raid = settings.party = false;
  bridgeServer.discord = require('child_process').fork(`${discordPath}/main.js`, [ bridgeServer.inst.emitter.port ], { cwd: discordPath });
  this.destructor = function () { bridgeServer.destroy(); };
  mod.hook('C_CHAT', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    bridgeServer.lastSent = false;
  });
  mod.hook('C_WHISPER', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    bridgeServer.lastSent = false;
  });
  mod.hook('S_CHAT', 3, (event) => {
    let { client } = bridgeServer, target;
    if (!client) { return; }
    target = idToChan(event.channel);
    if (!target) { return; }
    client.api.msg(client.api.types.CHAN, target, event.name, event.message);
  });
  mod.hook('S_WHISPER', 3, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    if (event.name == mod.game.me.name) { client.api.msg(client.api.types.WHISP, event.name, event.recipient, event.message); }
    else { client.api.msg(client.api.types.WHISP, undefined, event.name, event.message); }
  });
  mod.hook('S_JOIN_PRIVATE_CHANNEL', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    privs.ids[event.channelId] = privs.names[event.name] = { id: event.channelId, ind: event.index, name: event.name };
    client.api.privJoin(event.name);
  });
  mod.hook('S_LEAVE_PRIVATE_CHANNEL', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    let n = privs.ids[event.channelId].name;
    client.api.privLeft(n);
    delete privs.ids[event.channelId];
    delete privs.names[n];
  });
  mod.hook('S_PRIVATE_CHAT', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.msg(client.api.types.PRIV, privs.ids[event.channel].name, event.authorName, event.message);
  });
  mod.hook('S_PRIVATE_CHANNEL_NOTICE', 2, (event) => {
    let { client } = bridgeServer, ev = event.event;
    if (!client) { return; }
    ev = mod.parseSystemMessage(`@${ev}`);
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
        case 'online': out += `${evs[i].p.name} has come online\n`; break;
        case 'offline': out += `${evs[i].p.name} has gone offline\n`; break;
        case 'join': out += `${evs[i].p.name} has joined the ${partyManager.type}\n`; break;
        case 'left': out += `${evs[i].p.name} has left the ${partyManager.type}\n`; break;
        case 'lead': out += `${evs[i].p.name} is now ${partyManager.type} lead\n`; break;
        case 'disband':
          settings.party = settings.raid = false;
          client.api.partyStatus(false, false);
          out += `${partyManager.type} disbanded\n`;
          break;
        default: continue;
      }
    }
    client.api.partyUpdate(out);
  });
  mod.hook('S_PARTY_MEMBER_LIST', 7, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    settings.party = true;
    settings.raid = event.raid;
    client.api.partyStatus(true, event.raid);
    partyManager.update(event, event.leaderPlayerId);
  });
  mod.hook('S_LEAVE_PARTY', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.partyUpdate(`You have left the ${partyManager.type}\n`);
    settings.party = settings.raid = false;
    client.api.partyStatus(false, false);
    partyManager.clear();
  });
  mod.hook('S_LOGOUT_PARTY_MEMBER', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    partyManager.offline(event.playerId);
  });
  mod.hook('S_LEAVE_PARTY_MEMBER', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    partyManager.left(event.playerId);
  });
  mod.hook('S_CHANGE_PARTY_MANAGER', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.partyLead(mod.game.me.name == event.name);
    partyManager.leader(event.playerId);
  });
  let flManager = bridgeServer.flManager = new FLManager((evs) => {
    let out = '', { client } = bridgeServer;
    if (!client) { return; }
    for (let i = 0, l = evs.length; i < l; i++) {
      out += `${evs[i].name} has changed status to: `;
      switch (evs[i].status) {
        case 2: out += 'offline'; break;
        case 1: out += 'busy'; break;
        case 0: out += 'online'; break;
        default: out += `unknown (${evs[i].status})`; break;
      }
      out += '\n';
    }
    client.api.flUpdate(out);
  });
  mod.hook('S_UPDATE_FRIEND_INFO', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    flManager.update(event);
  });
  mod.hook('S_CHANGE_FRIEND_STATE', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    flManager.busy(event.playerId, event.state==1);
  });
  mod.hook('S_MUTE', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    client.api.muted(idToChan(event.channel), event.muted);
  });
  mod.hook('S_ADD_BLOCKED_USER', 2, (event) => {
    let { client } = bridgeServer, b = (bridgeServer.lastSent == client.api.types.BLOCK);
    if (!client) { return; }
    client.api.block(event.id, event.name, b);
    if (b) { bridgeServer.lastSent = undefined; }
  });
  mod.hook('S_REMOVE_BLOCKED_USER', 1, (event) => {
    let { client } = bridgeServer, b = (bridgeServer.lastSent == client.api.types.BLOCK);
    if (!client) { return; }
    client.api.unblock(event.id, b);
    if (b) { bridgeServer.lastSent = undefined; }
  });
  mod.hook('S_USER_BLOCK_LIST', 2, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    let out = [];
    for (let i = 0, list = event.blockList, l = list.length; i < l; i++) { out.push({ id: list[i].id, name: list[i].name }); }
    client.api.blockList(out);
  });
  mod.hook('S_SYSTEM_MESSAGE', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    let message = mod.parseSystemMessage(event.message);
    if (bridgeServer.lastSent !== false) {
      let { types } = client.api;
      switch (message.id) {
        case 'SMT_CHAT_INPUTRESTRICTION_ERROR': client.api.badSend(); break;
        case 'SMT_GENERAL_NOT_IN_THE_WORLD': if (bridgeServer.lastSent == types.WHISP) { client.api.noExistWhisp(); } break;
        case 'SMT_FRIEND_NOT_EXIST_USER': if (bridgeServer.lastSent == types.BLOCK) { client.api.noExistBlock(); } break;
        default: break;
      }
    }
    switch (message.id) {
      case 'SMT_GUILD_MEMBER_LOGON':
      case 'SMT_GUILD_MEMBER_LOGON_NO_MESSAGE': client.api.guildLogin(message.tokens.UserName, message.tokens.Comment); break;
      case 'SMT_GUILD_MEMBER_LOGOUT': client.api.guildLogout(message.tokens.UserName); break;
      default: break;
    }
  });
  mod.hook('S_RETURN_TO_LOBBY', 1, (event) => {
    let { client } = bridgeServer;
    if (!client) { return; }
    if ((!settings.party) || (!settings.raid)) { return; }
    settings.party = settings.raid = false;
    client.api.partyStatus(false, false);
    partyManager.clear();
  });
  mod.command.add('discordbridge', {
    $default() { mod.command.message('Usage: discordbridge [on/off]. Turns on/off using the bridge.'); },
    on() {
      let { client } = bridgeServer;
      if (!client) { mod.command.message('No running Discord instance found'); return; }
      if (client.api.silenced) { return; }
      client.api.silence();
      mod.command.message('Bridge silenced. Note that the Discord instance is still running, just not being used.');
    },
    off() {
      let { client } = bridgeServer;
      if (!client) { mod.command.message('No running Discord instance found'); return; }
      if (!client.api.silenced) { return; }
      client.api.unsilence();
      mod.command.message('Bridge unsilenced. Discord will begin broadcasting again.');
    }
  });
};
