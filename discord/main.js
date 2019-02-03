'use strict';
const fs = require('fs');
console._log = console.log;
console.log = function (...args) { console._log('[discord]', ...args); fs.appendFileSync('log', `${...args}\n`); };
fs.writeFileSync('log', '');
console.log('Loading..');
const Discord = require('discord.js'), util = require('util'),
      EventEmitter = require('events').EventEmitter, http = require('http'), https = require('https'),
      urlp = require('url'), modsupport = require('tserv-modsupport');
let botData, bots = [], botsHash = {}, pBot, client = new Discord.Client(), wget;

function loadJSON(p,d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').toString()); }
  catch (err) { return d; }
}
function saveData() { fs.writeFileSync('data/botData', JSON.stringify(botData), 'utf8'); }
function addServ(s) {
  if (botsHash[s.id]) { return; }
  let bot = new discordBot(client, s.id, undefined, s);
  bots.push(botsHash[s.id] = bot);
  botData.servers.push(s.id);
  saveData();
  bot.saveModules();
}
function remServ(s) {
  if (!botsHash[s.id]) { return; }
  delete botsHash[s.id];
  for (let i = 0, l = bots.length; i < l; i++) { if (s.id == bots[i].id) { bots.splice(i, 1); break; } }
  for (let i = 0, sv = botData.servers, l = sv.length; i < l; i++) { if (s.id == sv[i]) { sv.splice(i, 1); break; } }
  saveData();
}
function updateServ(os, ns) {}

const auth = loadJSON('auth', undefined);
if (!auth) { console.log('No auth found'); process.exit(); }
if (!auth.sekrit) { console.log('No auth token found'); process.exit(); }
botData = loadJSON('data/botData', {});
function routeEvent(client, e, f) { client.on(e, f.bind(undefined, e)); }
function eventRouter(n, a1, a2) {
  var s, t = a1||a2;
  if (t instanceof Discord.User) { t = a2; }
  else if (t instanceof Discord.GuildMember) { s = t.guild; }
  else if (t instanceof Discord.Channel) {
    if ((t.type == 'dm') || (t.type == 'group')) { pBot.emit(n, a1, a2); return; }
    s = t.guild;
  } else if (t instanceof Discord.Message) {
    if (!t.guild) { pBot.emit(n, a1, a2); return; }
    s = t.guild;
  } else if (t instanceof Discord.Role) { s = t.guild; }
  else if (t instanceof Discord.Guild) { s = t; }
  else if (n == 'messageDeleteBulk') { s = t.first(); if (!s.guild) { pBot.emit(n, a1, a2); return; } s = t.guild; }
  if (!botsHash[s.id]) { addServ(s); }
  botsHash[s.id].emit(n, a1, a2);
}
function forwardEvent(n, a1, a2) { pBot.emit(n, a1, a2); }
routeEvent(client, 'channelCreate', eventRouter);
routeEvent(client, 'channelDelete', eventRouter);
routeEvent(client, 'channelPinsUpdate', eventRouter);
routeEvent(client, 'channelUpdate', eventRouter);
routeEvent(client, 'guildBanAdd', eventRouter);
routeEvent(client, 'guildBanRemove', eventRouter);
routeEvent(client, 'guildEmojiCreate', eventRouter);
routeEvent(client, 'guildEmojiDelete', eventRouter);
routeEvent(client, 'guildEmojiUpdate', eventRouter);
routeEvent(client, 'guildMemberAdd', eventRouter);
routeEvent(client, 'guildMemberAvailable', eventRouter);
routeEvent(client, 'guildMemberRemove', eventRouter);
routeEvent(client, 'guildMembersChunk', eventRouter);
routeEvent(client, 'guildMemberSpeaking', eventRouter);
routeEvent(client, 'guildMemberUpdate', eventRouter);
routeEvent(client, 'message', eventRouter);
routeEvent(client, 'messageDelete', eventRouter);
routeEvent(client, 'messageDeleteBulk', eventRouter);
routeEvent(client, 'messageUpdate', eventRouter);
routeEvent(client, 'presenceUpdate', forwardEvent);
routeEvent(client, 'roleCreate', eventRouter);
routeEvent(client, 'roleDelete', eventRouter);
routeEvent(client, 'roleUpdate', eventRouter);
routeEvent(client, 'typingStart', eventRouter);
routeEvent(client, 'typingStop', eventRouter);
routeEvent(client, 'userUpdate', forwardEvent);
routeEvent(client, 'voiceStateUpdate', eventRouter);

client.on('guildCreate', function (s) { addServ(s); pBot.emit('guildCreate', s); });
client.on('guildDelete', function (s) { remServ(s); pBot.emit('guildDelete', s); });
client.on('guildUpdate', function (os, ns) { updateServ(os, ns); pBot.emit('guildUpdate', os, ns); });

function discordBot(c, id, isPM, server) {
  console.log('Loading bot id '+id);
  this.configPath = './data';
  this.id = id;
  this.serverPath = this.configPath+'/'+(id||'pm');
  try { fs.mkdirSync(this.serverPath); } catch (err) {}
  this.client = c;
  this.isPM = isPM;
  var mods;
  try { mods = JSON.parse(fs.readFileSync(this.serverPath+'/modules', 'utf8')); } catch (err) { mods = [ 'core/data', 'core/services', 'core/dbs', 'core/triggers', 'system', 'help' ]; if (!isPM) { mods.push('bridge'); } }
  modsupport.add(this, 'main', true);
  this.auth = auth;
  if (!isPM) {
    this.server = server||client.guilds.get(id);
    if (!this.server) { console.log('Uhh.. server is undefined..?'); }
    this.pBot = pBot;
  }
  for (let i = 0, l = mods.length; i < l; i++) { this.loadModule(mods[i]); }
  this.loadDBs();
}
util.inherits(discordBot, EventEmitter);
discordBot.prototype.saveModules = function () { fs.writeFileSync(this.serverPath+'/modules', JSON.stringify(this.__modulesList.copyTree(true)), 'utf8'); };
discordBot.prototype.off = EventEmitter.prototype.removeListener;
wget = discordBot.prototype.wget = function (url, asRes) {
  return new Promise(function (resolve, reject) {
    var o = urlp.parse(url), req, data = '';
    o.method = 'GET';
    o.headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.111 Safari/537.36' };
    if (o.protocol == 'http:') { req = http; }
    else if (o.protocol == 'https:') { req = https; }
    else { reject(new Error('Links must be http(s)')); return; }
    req.request(o, function (res) {
      if ((res.statusCode == 302) || (res.statusCode == 301)) { wget((!/^http/i.test(res.headers.location)?o.protocol:'')+res.headers.location,asRes).then(resolve,reject); return; }
      else if (res.statusCode != 200) { reject(new Error('Status code: '+res.statusCode)); return; }
      if (asRes) { resolve(res); return; }
      res.on('data', function (c) { data += c; })
         .on('end', function () { resolve(data); });
    }).end();
  });
};
discordBot.prototype.chopUp = function (data) {
  let out = [], c = 0, line = '', arr = data.split('\n'), t;
  for (let i = 0, l = arr.length; i < l; i++) {
    t = arr[i].replace(/  /g, '\t')+'\n';
    if (c+t.length > 2000) { out.push(line); c = 0; line = ''; }
    c += t.length;
    line += t;
  }
  if (line != '') { out.push(line); }
  return out;
};
discordBot.prototype.sendChopped = function (c, d) {
  let arr = d;
  if (!(d instanceof Array)) { arr = this.chopUp(d); }
  for (let i = 0, l = arr.length; i < l; i++) { c.send(arr[i]).catch(console.error); }
};
/*
client events
  disconnected
  warn
  error
*/

let recontmr, dcCount = 0;
function init() {
  console.log(`connected ${dcCount}`);
  if (bots.length > 0) { return; } // prevent doubled init
  if (!botData.servers) { botData.servers = []; }
  if (!fs.existsSync('./data')) { fs.mkdirSync('./data'); }
  if (!fs.existsSync('./extensions')) { fs.mkdirSync('./extensions'); }
  pBot = new discordBot(client, 0, true);
  for (let i = 0, serverList = botData.servers, l = serverList.length; i < l; i++) { bots.push(botsHash[serverList[i]] = new discordBot(client, serverList[i])); }
  client.__bots = bots;
  client.__pBot = pBot;
}
function reconnect() {
  if (recontmr) { clearTimeout(recontmr); recontmr = 0; }
  client.login(auth.sekrit)
  .then((token) => console.log('Successfully logged in'))
  .catch((err) => { console.log(`There was an error loggin in: ${err}`); setTimeout(reconnect, 5000); });
}
console.log('Logging in..');
client.on('ready', init);
client.on('disconnect', function () {
  pBot.emit('disconnect');
  for (var i = 0, l = bots.length; i < l; i++) { bots[i].emit('disconnect'); }
  console.log(`disconnected ${++dcCount}`);
});
client.on('error', function (err) {
  console.log('discord socket err', err);
  setTimeout(reconnect, 5000);
});
reconnect();

// FIXME
require('process').on('uncaughtException', (err) => {
  console.log('UNHANDLED EXCEPTION NEED TO BE FIXING ASAP');
  console.log(err);
});
