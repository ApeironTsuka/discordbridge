const { serviceEmitter } = require('tserv-service'), he = require('he');

let trigs = {
  /* HELP
  ## DESC Disable+delete a channel
  ## CMD #PREFIX#disable <channel>
  ## ADMIN
  ## ARGS
  ##   <channel> - One of the following: say, area, party, raid, guild, trade, global, whispers, privates, friends
  ##   Disabling whispers will disable all whispers
  ##   Disabling privates will disable all private channels
  ##   Disabling friends will disable sending friend status updates to #status
  ## ENDARGS
  */
  disable: function (m) {
    let chanmap = this._proxy.chanmap, settings = this._proxy.settings, c = (m.words[1]?m.words[1].toLowerCase():'');
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    switch (c) {
      case 'say': case 'area': case 'party': case 'raid': case 'guild':
      case 'trade': case 'global': case 'whispers': case 'privates': case 'friends':
        if (!settings.enabled[c]) { return; }
        settings.enabled[c] = false;
        this.saveData('settings', this._proxy.settings);
        if (c == 'whispers') {
          for (let i = 0, list = chanmap.whispers, l = list.length; i < l; i++) { list[i].delete(); }
          chanmap.whispers.length = 0;
        } else if (c == 'privates') {
          for (let i = 0, list = chanmap.privates, l = list.length; i < l; i++) { list[i].delete(); }
          chanmap.privates.length = 0;
        } else if (c != 'friends') {
          chanmap[c].delete();
          delete chanmap[c];
        }
        saveChanmap(this);
        break;
      default:
        if (c == '') { m.channel.send('No channel provided'); }
        else { m.channel.send(`Unknown channel "${c}"`); }
        break;
    }
  },
  /* HELP
  ## DESC Enable+create a channel
  ## CMD #PREFIX#enable <channel>
  ## ADMIN
  ## ARGS
  ##   <channel> - One of the following: say, area, party, raid, guild, trade, global, whispers, privates, friends
  ##   Enabling whispers will enable all whispers
  ##   Enabling privates will enable all private channels
  ##   Enabling friends will enable sending friend status updates to #status
  ## ENDARGS
  */
  enable: function (m) {
    let chanmap = this._proxy.chanmap, settings = this._proxy.settings, c = (m.words[1]?m.words[1].toLowerCase():'');
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    switch (c) {
      case 'say': case 'area': case 'party': case 'raid': case 'guild':
      case 'trade': case 'global': case 'privates': case 'whispers': case 'friends':
        if (settings.enabled[c]) { return; }
        settings.enabled[c] = true;
        this.saveData('settings', this._proxy.settings);
        if (c == 'privates') {
          for (let i = 0, list = this._proxy.priv, keys = Object.keys(list), l = keys.length; i < l; i++) {
            this.server.createChannel(keys[i], 'text')
            .then((c) => { chanmap['private'][keys[i]] = c; return c.setParent(chanmap.privates); });
          }
        } else if ((c != 'whispers') && (c != 'friends')) {
          this.server.createChannel(c, 'text')
          .then((ch) => { chanmap[c] = ch; return ch.setParent(chanmap.chats); });
        }
        saveChanmap(this);
        break;
      default:
        if (c == '') { m.channel.send('No channel provided'); }
        else { m.channel.send(`Unknown channel "${c}"`); }
        break;
    }
  },
  /* HELP
  ## DESC Close a whisper channel
  ## CMD #PREFIX#close
  ## ADMIN
  */
  close: function (m) {
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    for (let i = 0, list = this._proxy.chanmap.whispers, l = list.length; i < l; i++) {
      if (m.channel.id == list[i].id) { m.channel.delete(); list.splice(i, 1); saveChanmap(this); break; }
    }
  },
  /* HELP
  ## DESC Keep party/raid channels when not in a party/raid
  ## CMD #PREFIX#keepparty
  ## ADMIN
  ## ARGS
  ##   <yes/no> - Anything other than 'no' counts as 'yes'
  ## ENDARGS
  */
  keepparty: function (m) {
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    let { avail, settings, chanmap } = this._proxy, on = (m.words[1]?(!(m.words[1]=='no')):true), c = settings.keepparty;
    if (on == c) { return; }
    settings.keepparty = on;
    this.saveData('settings', settings);
    if (!on) {
      let { party, raid } = avail;
      if ((!party) && (chanmap.party)) { chanmap.party.delete(); delete chanmap.party; saveChanmap(bot); }
      if ((!raid) && (chanmap.raid)) { chanmap.raid.delete(); delete chanmap.raid; saveChanmap(bot); }
    }
  }
};
function saveChanmap(bot) {
  let chanmap = bot._proxy.chanmap, out = { privates: [], whispers: [] };
  for (let i = 0, keys = Object.keys(chanmap), l = keys.length; i < l; i++) {
    switch (keys[i]) { case 'privates': case 'whispers': continue; }
    out[keys[i]] = chanmap[keys[i]].id;
  }
  for (let i = 0, list = chanmap.whispers, l = list.length; i < l; i++) { out.whispers.push(list[i].id); }
  for (let i = 0, list = chanmap.privates, l = list.length; i < l; i++) { out.privates.push(list[i].id); }
  bot.saveData('chanmap', out);
}
function findWhisp(bot, name) {
  let whispers = bot._proxy.chanmap.whispers, lcn = name.toLowerCase();
  for (let i = 0, l = whispers.length; i < l; i++) { if (lcn == whispers[i].name) { return Promise.resolve(whispers[i]); } }
  return bot.server.createChannel(lcn, 'text')
  .then((c) => { whispers.push(c); saveChanmap(bot); return c.setParent(bot._proxy.chanmap.whisper); });
}
function findPriv(bot, name) {
  let privates = bot._proxy.chanmap.privates, lcn = name.toLowerCase();
  for (let i = 0, l = privates.length; i < l; i++) { if (lcn == privates[i].name) { return Promise.resolve(privates[i]); } }
  return bot.server.createChannel(lcn, 'text')
  .then((c) => { privates.push(c); saveChanmap(bot); return c.setParent(bot._proxy.chanmap['private']); });
}
function findChanType(bot, id) {
  let { chanmap } = bot._proxy, { types } = bot._proxy.client.api;
  for (let i = 0, keys = Object.keys(chanmap), l = keys.length; i < l; i++) {
    switch (keys[i]) { case 'whispers': case 'privates': continue; }
    if (chanmap[keys[i]].id == id) { return types.CHAN; }
  }
  for (let i = 0, list = chanmap.whispers, l = list.length; i < l; i++) { if (list[i].id == id) { return types.WHISP; } }
  for (let i = 0, list = chanmap['privates'], l = list.length; i < l; i++) { if (list[i].id == id) { return types.PRIV; } }
  return undefined;
}
function handleMsgs(m) {
  let words = m.cleanContent.replace(/  */g, ' ').replace(/^ /, '').replace(/ $/, '').split(/ /), trigger = words[0], k = this.triggerPrefix;
  if (this.auth.owner != m.author.id) { return; }
  if ((new RegExp('^'+k.replace(/([\\\[\]\(\)\^\$\.\|\?\*\+\{\}])/g, '\\$1'))).test(trigger)) {
    trigger = trigger.substr(k.length).toLowerCase();
    if (this.hasTrigger(trigger)) { return; }
  }
  let type = findChanType(this, m.channel.id);
  if (type === undefined) { return; }
  switch (m.channel.name) { case 'party': case 'raid': if (!this._proxy.avail[m.channel.name]) { return; } }
  if (m.channel.__muted) { m.channel.send('Shh, you\'re still muted'); return; }
  this._proxy.client.api.sendMessage(type, m.channel.name, `<FONT>${he.encode(m.cleanContent)}</FONT>`);
  this._proxy.lastSource = m.channel;
}
function setupServer(bot) {
  let chanmap = { whispers: [], privates: [] };
  if (!bot.server) { return Promise.reject(); }
  try { return Promise.resolve(bot.loadData('chanmap')); }
  catch (e) {
    return bot.server.createChannel('status', 'text')
    .then((c) => { chanmap.status = c.id; return bot.server.createChannel('TERA Chats', 'category'); })
    .then((p) => {
      chanmap.chats = p.id;
      return bot.server.createChannel('say', 'text').then((c) => { chanmap.say = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('area', 'text')).then((c) => { chanmap.area = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('party', 'text')).then((c) => { chanmap.party = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('raid', 'text')).then((c) => { chanmap.raid = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('guild', 'text')).then((c) => { chanmap.guild = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('trade', 'text')).then((c) => { chanmap.trade = c.id; return c.setParent(p); })
      .then(() => bot.server.createChannel('global', 'text')).then((c) => { chanmap.global = c.id; return c.setParent(p); });
    })
    .then(() => bot.server.createChannel('TERA Private Channels', 'category')).then((c) => { chanmap['private'] = c.id; return Promise.resolve(); })
    .then(() => bot.server.createChannel('TERA Whispers', 'category')).then((c) => { chanmap.whisper = c.id; return Promise.resolve(); })
    .then(() => { bot.saveData('chanmap', chanmap); return Promise.resolve(chanmap); });
  }
}
function setupProxy(bot) {
  let client = new serviceEmitter();
  client.setIdentifier('id');
  client.connectToP('proxy', process.argv[2]);
  client.on('ready', function () {
    this.loadApi();
    this.api.on('msg', function (type, target, from, msg) {
      let { types } = this, { chanmap, settings } = bot._proxy, m = he.decode(msg.replace(/<.*?>/g, ''));
      switch (type) {
        case types.WHISP:
          if (!settings.enabled.whispers) { break; }
          findWhisp(bot, from)
          .then((c) => c.send(`[${from}]: ${m}`));
          break;
        case types.PRIV:
          if (!settings.enabled.privates) { break; }
          findPriv(bot, target)
          .then((c) => c.send(`[${from}]: ${m}`));
          break;
        case types.CHAN:
          switch (target) {
            case 'say': case 'area': case 'party': case 'raid': case 'guild': case 'trade': case 'global':
              if (chanmap[target]) { chanmap[target].send(`[${from}]: ${m}`); }
              break;
            case 'partyn': if (chanmap.party) { chanmap.party.send(`[NOTICE][${from}]: ${m}`); } break;
            case 'raidn': if (chanmap.raid) { chanmap.raid.send(`[NOTICE][${from}]: ${m}`); } break;
            default: return;
          }
          break;
        default: return;
      }
    });
    this.api.on('priv join', function (chan) {
      if (!bot._proxy.settings.enabled.privates) { return; }
      findPriv(bot, chan);
      bot._proxy.privs[chan] = true;
    });
    this.api.on('priv left', function (chan) {
      if (!bot._proxy.settings.enabled.privates) { return; }
      findPriv(bot, chan)
      .then((c) => {
        let privates = bot._proxy.chanmap.privates, lcn = chan.toLowerCase();
        c.delete();
        delete bot._proxy.privs[chan];
        for (let i = 0, l = privates.length; i < l; i++) { if (lcn == privates[i].name) { privates.splice(i, 1); break; } }
        saveChanmap(bot);
      });
    });
    this.api.on('priv notice', function (chan, event, name) {
      if (!bot._proxy.settings.enabled.privates) { return; }
      findPriv(bot, chan)
      .then((c) => c.send(`[${name}] has ${event+'ed'}`));
    });
    this.api.on('priv list', function (list) {
      if (!bot._proxy.settings.enabled.privates) { return; }
      for (let i = 0, keys = Object.keys(list), l = keys.length; i < l; i++) {
        findPriv(bot, keys[i]);
        bot._proxy.privs[keys[i]] = true;
      }
    });
    this.api.on('party status', function (party, raid) {
      let { avail, settings, chanmap } = bot._proxy;
      avail.party = party;
      avail.raid = raid;
      if ((!party) && (!settings.keepparty) && (chanmap.party)) { chanmap.party.delete(); delete chanmap.party; saveChanmap(bot); }
      if ((!raid) && (!settings.keepparty) && (chanmap.raid)) { chanmap.raid.delete(); delete chanmap.raid; saveChanmap(bot); }
      if ((party) && (settings.enabled.party) && (!chanmap.party)) {
        bot.server.createChannel('party', 'text')
        .then((c) => { chanmap.party = c; saveChanmap(bot); return c.setParent(chanmap.chats); });
      }
      if ((raid) && (settings.enabled.raid) && (!chanmap.raid)) {
        bot.server.createChannel('raid', 'text')
        .then((c) => { chanmap.raid = c; saveChanmap(bot); return c.setParent(chanmap.chats); });
      }
    });
    this.api.on('party update', function (upd) {
      let { avail, settings, chanmap } = bot._proxy, c;
      if (avail.raid) { if (settings.enabled.raid) { c = chanmap.raid; } }
      else if (avail.party) { if (settings.enabled.party) { c = chanmap.party; } }
      if (!c) { return; }
      c.send(upd);
    });
    this.api.on('fl update', function (upd) {
      let { settings, chanmap } = bot._proxy;
      if (!settings.enabled.friends) { return; }
      chanmap.status.send(upd);
    });
    this.api.on('bad send', function () {
      let { lastSource } = bot._proxy;
      lastSource.send('The previous message was reject by the TERA server');
    });
    this.api.on('muted', function (channel, status) {
      let { settings, chanmap } = bot._proxy, { enabled } = settings;
      if (!chanmap[channel]) { return; }
      chanmap[channel].__muted = status;
      if (status) { chanmap[channel].send('You\'ve been muted from this chat. For shame.'); }
      else { chanmap[channel].send('Your muted has been lifted!'); }
    });
  });
  bot._proxy.client = client;
  return Promise.resolve();
}
function load(bot) {
  bot.addTriggers(trigs);
  bot.on('message', handleMsgs);
  bot._proxy = { privs: {}, avail: { party: false, raid: false } };
  try { bot._proxy.settings = bot.loadData('settings'); }
  catch (e) { bot._proxy.settings = { keepparty: true, enabled: { say: true, area: true, party: true, raid: true, guild: true, trade: true, global: true, privates: true, whispers: true, friends: true } }; bot.saveData('settings', bot._proxy.settings); }
  setupServer(bot)
  .then((chanmap) => {
    let saveMap = false;
    for (let i = 0, keys = Object.keys(chanmap), l = keys.length; i < l; i++) {
      switch (keys[i]) { case 'whispers': case 'privates': continue; }
      chanmap[keys[i]] = bot.server.channels.get(chanmap[keys[i]]);
    }
    for (let i = 0, list = chanmap.whispers, l = list.length; i < l; i++) {
      list[i] = bot.server.channels.get(list[i]);
      if (!list[i]) { list.splice(i, 1); i--; l--; saveMap = true; }
    }
    for (let i = 0, list = chanmap.privates, l = list.length; i < l; i++) {
      list[i] = bot.server.channels.get(list[i]);
      if (!list[i]) { list.splice(i, 1); i--; l--; saveMap = true; }
    }
    bot._proxy.chanmap = chanmap;
    if (saveMap) { saveChanmap(bot); }
    let out = '';
    for (let i = 0, list = bot._proxy.settings.enabled, keys = Object.keys(list), l = keys.length; i < l; i++) {
      switch (keys[i]) { case 'whispers': case 'privates': case 'friends': continue; }
      if (!list[keys[i]]) { continue; }
      if (!chanmap[keys[i]]) { out += keys[i]; }
    }
    if (out != '') {
      out = `Missing the following enabled channels:\n${out}\nTo correct this, use ${bot.triggerPrefix}disable <name> and then ${bot.triggerPrefix}enable <name>`;
      if (chanmap.status) { chanmap.status.send(out); }
      else { console.log(out); }
    }
    if (saveMap) {
      out = 'Some whisper or private channels have been deleted while the bot was offline and have been cleaned up internally';
      if (chanmap.status) { chanmap.status.send(out); }
      else { console.log(out); }
    }
  })
  .then(() => setupProxy(bot))
  .catch((e) => { console.log(e); });
  console.log('loaded bridge');
}

function unload(bot) {
  bot._proxy.client.disconnect();
  bot.remTriggers(trigs);
  bot.off('message', handleMsgs);
  console.log('unloaded bridge');
}

module.exports = {
  name: 'thing', // FIXME
  version: '1.0',
  desc: '',
  depends: [ 'Core-Triggers' ],
  load,
  unload
};
