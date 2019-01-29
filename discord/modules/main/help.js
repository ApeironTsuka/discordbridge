'use strict';
const fs = require('fs'), parser = /\/\*\s*HELP\n((.|\n)*?)\*\//g;
let helpDB = {};
function parseHelp(s) {
  var a = s.split(/\n/), inArgs = false, out = {}, r = /^\s*##\s*/, t, args;
  for (var i = 0, l = a.length; i < l; i++) {
    if (!r.test(a[i])) { continue; }
    t = a[i].replace(r, '');
    if (!inArgs) {
      if (/^CMD /.test(t)) {
        if (out.cmd) { if (out.cmd instanceof Array) { out.cmd.push(t.substr(4)); } else { out.cmd = [ out.cmd, t.substr(4) ]; } }
        else { out.cmd = t.substr(4); }
      }
      else if (/^DESC /.test(t)) {
        if (out.desc) { if (out.desc instanceof Array) { out.desc.push(t.substr(5)); } else { out.desc = [ out.desc, t.substr(5) ]; } }
        else { out.desc = t.substr(5); }
      }
      else if (/^ARGS$/.test(t)) {
        inArgs = true;
        if (out.args) {
          if (out.args[0] instanceof Array) { args = []; out.args.push(args); }
          else { out.args = [ out.args ]; args = []; out.args.push(args); }
        }
        else { out.args = args = []; }
      }
      else if (/^ADMIN$/.test(t)) { out.adminOnly = true; }
      else if (/^OWNER$/.test(t)) { out.ownerOnly = true; }
      else if (/^USEFILE /.test(t)) { out.helpfile = t.substr(8); }
    } else {
      if (/^ENDARGS$/.test(t)) { inArgs = false; }
      else { args.push(t); }
    }
  }
  return out;
}
function parseScript(s) {
  var k, out = [];
  parser.lastIndex = 0;
  while (k = parser.exec(s)) { out.push(parseHelp(k[1])); }
  return out;
}
function genHelp(bot, mod) {
  if (!bot.__modules[mod]) { return; }
  var p = bot.__modules[mod].fullPath;
  var s = fs.readFileSync(p);
  helpDB[mod] = { help: parseScript(s), time: (new Date()).getTime(), path: p };
  fs.writeFileSync(bot.configPath+'/helpdb', JSON.stringify(helpDB), 'utf8');
}
function getHelp(bot, mod) {
  if (!bot.__modules[mod]) { return undefined; }
  if (!helpDB[mod]) { genHelp(bot, mod); return helpDB[mod]; }
  var s = fs.statSync(helpDB[mod].path);
  if (s.mtime.getTime() >= helpDB[mod].time) { genHelp(bot, mod); }
  return helpDB[mod];
}
function isPrivate(m) { var c = m.channel; return ((c.type == 'group') || (c.type == 'dm')); }
function getTrigText(trig) {
  let out = '', auths = '', arg;
  if (!trig.desc.join) {
    out += '\t\t'+(trig.cmd.join?trig.cmd.join('\n\t\t'):trig.cmd)+'\n';
    out += '\t\t\t\t'+trig.desc+'\n';
  }
  if (trig.adminOnly) { auths += '\t\t\t\tChannel admin only\n'; }
  if (trig.ownerOnly) { auths += '\t\t\t\tBot owner only\n'; }
  if (trig.args) {
    if (trig.cmd.join) {
      for (let i = 0, cmds = trig.cmd, l = cmds.length; i < l; i++) {
        arg = trig.args[i];
        if (!arg) { continue; }
        if (arg.join) { arg = arg.join('\n\t\t\t\t\t\t'); }
        if (trig.desc.join) {
          out += '\t\t'+cmds[i]+'\n';
          out += '\t\t\t\t'+trig.desc[i]+'\n';
          out += auths;
          out += '\t\t\t\tArguments:\n';
        } else if (trig.args[i].join) {
          out += '\t\t\t\tArguments for '+cmds[i]+'\n';
        } else {
          out += '\t\t\t\tArguments:\n';
        }
        out += '\t\t\t\t\t\t'+arg+'\n';
      }
    } else {
      out += '\t\t\t\tArguments:\n';
      out += '\t\t\t\t\t\t'+trig.args.join('\n\t\t\t\t\t\t')+'\n';
    }
  }
  return out;
}
var trigs = {
  help: function (m) {
    let mods = this.__modules, keys = Object.keys(mods), h = undefined, out = '', args = undefined;
    for (let i = 0, l = keys.length; i < l; i++) {
      h = getHelp(this, keys[i]).help;
      if (h.length == 0) { continue; }
      out += 'Triggers from module: '+keys[i]+'\n';
      for (let x = 0, xl = h.length; x < xl; x++) {
        if ((h[x].ownerOnly) && ((this.pBot||this).auth.owner != m.author.id)) { continue; }
        if ((h[x].adminOnly) && (!isPrivate(m)) && (!m.channel.permissionsFor(m.member).has('ADMINISTRATOR'))) { continue; }
        out += getTrigText(h[x]);
      }
      out += '\n';
    }
    this.sendChopped(m.author, out.replace(/#PREFIX#/g, this.triggerPrefix).replace(/\n*$/, '').replace(/^(.?)/gm, '| $1'));
  }
};
function load(bot) {
  try {
    if (bot.constructor.helpDB) { helpDB = bot.constructor.helpDB; }
    else { bot.constructor.helpDB = helpDB = JSON.parse(fs.readFileSync(bot.configPath+'/helpdb', 'utf8').toString()); }
  } catch (e) {}
  bot.addTriggers(trigs);
  bot.helpFuncs = { getHelp, getTrigText };
  console.log('loaded help');
}
function unload(bot) {
  bot.remTriggers(trigs);
  delete bot.helpFuncs;
  console.log('unloaded help');
}
module.exports = {
  name: 'Help',
  version: '1.0',
  depends: [ 'Core-Triggers' ],
  load: load,
  unload: unload
}
