'use strict';
function isPrivate(m) { var c = m.channel; return ((c.type == 'group') || (c.type == 'dm')); }
var trigs = {
  /* HELP
  ## DESC Load a module
  ## CMD #PREFIX#load <module>
  ## ADMIN
  ## ARGS
  ##   <module> - Module to load
  ## ENDARGS
  */
  load: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    var w = m.words[1];
    if (!w) { m.channel.send('No module specified'); return; }
    try { this.loadModule(w); m.channel.send('Loaded'); }
    catch (err) {
      console.log(err, err.stack, err.deps);
      m.channel.send('Error: '+err.name+': '+err.message+(err.deps?' - '+JSON.stringify(err.deps):''));
    }
    this.saveModules();
  },
  /* HELP
  ## DESC Unload a module
  ## CMD #PREFIX#unload <module>
  ## ADMIN
  ## ARGS
  ##   <module> - Module to unload
  ## ENDARGS
  */
  unload: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    var w = m.words[1];
    if (!w) { m.channel.send('No module specified'); return; }
    try { this.unloadModule(w); m.channel.send('Unloaded'); }
    catch (err) {
      console.log(err, err.stack, err.deps);
      m.channel.send('Error: '+err.name+': '+err.message+(err.deps?' - '+JSON.stringify(err.deps):''));
    }
    this.saveModules();
  },
  /* HELP
  ## DESC Reload a module (does unload->load)
  ## CMD #PREFIX#reload <module>
  ## ADMIN
  ## ARGS
  ##   <module> - Module to reload
  ## ENDARGS
  */
  reload: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    var w = m.words[1], ev = m.words[2];
    if (!w) { m.channel.send('No module specified'); return; }
    if ((ev) && (ev.toLowerCase() == 'everywhere')) {
      if (this.auth.owner != m.author.id) { m.reply('You don\'t have permission to do that'); return; }
    } else {
      try { this.reloadModule(w); }
      catch (err) {
        console.log(err, err.stack);
        m.channel.send('Error: '+err.name+': '+err.message);
      }
    }
    if (ev) {
      for (let i = 0, list = this.client.__bots, l = list.length; i < l; i++) {
        try { list[i].reloadModule(w); } catch (err) {}
      }
      try { this.client.__pBot.reloadModule(w); } catch (err) {}
    }
    m.channel.send('Reloaded');
  },
  /* HELP
  ## DESC Load a hotfix module (does load->unload)
  ## CMD #PREFIX#hotfix <module>
  ## ADMIN
  ## ARGS
  ##   <module> - Module to use
  ## ENDARGS
  */
  hotfix: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    var w = m.words[1], ev = m.words[2];
    if (!w) { m.channel.send('No module specified'); return; }
    if ((ev) && (ev.toLowerCase() == 'everywhere')) {
      if (this.auth.owner != m.author.id) { m.reply('You don\'t have permission to do that'); return; }
    } else {
      try { this.loadModule(w); this.unloadModule(w); }
      catch (err) {
        console.log(err, err.stack);
        m.channel.send('Error: '+err.name+': '+err.message);
      }
    }
    if (ev) {
      for (let i = 0, list = this.client.__bots, l = list.length; i < l; i++) {
        try { list[i].loadModule(w); list[i].unloadModule(w); } catch (err) {}
      }
      try { this.client.__pBot.loadModule(w); this.client.__pBot.unloadModule(w); } catch (err) {}
    }
    m.channel.send('Hotfixed');
  },
  /* HELP
  ## DESC Set a new trigger prefix
  ## CMD #PREFIX#settrigger <prefix>
  ## ADMIN
  ## ARGS
  ##   <prefix> - The new prefix to set
  ## ENDARGS
  */
  settrigger: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    var t = m.words[1];
    if (!t) { m.channel.send('No new trigger specified'); return; }
    this.setTriggerPrefix(t);
    m.channel.send('Trigger prefix changed');
  },
  /* HELP
  ## DESC PMs a list of available modules
  ## CMD #PREFIX#modlist
  ## ADMIN
  */
  modlist: function (m) {
    if (isPrivate(m)) { return; }
    if ((!m.channel.permissionsFor(m.member).has('ADMINISTRATOR')) &&
        (this.auth.owner != m.author.id)) { m.reply('You don\'t have permission to do that'); return; }
    let out = '', list = this.getModuleList();
    for (let i = 0, l = list.length; i < l; i++) {
      out += 'Module "'+list[i].fname.split('/')[0]+'"'+(list[i].extension?' of extension "'+list[i].extension+'"':'')+':\n';
      out += '\t\tName: '+list[i].name+'\n';
      if (list[i].desc) { out += '\t\tDescription: '+list[i].desc.replace(/#PREFIX#/g, this.triggerPrefix)+'\n'; }
      out += '\t\tVersion: '+list[i].version+'\n';
      if (list[i].loaded) { out += '\t\t(Already loaded)\n'; }
    }
    this.sendChopped(m.author, out.replace(/\n*$/, '').replace(/^(.?)/gm, '|$1'));
  }
};
function handleMsgs(m) {
  var words = m.cleanContent.replace(/  */g, ' ').replace(/^ /, '').replace(/ $/, '').split(/ /), trigger = words[0];
  var k = this.triggerPrefix;
  if ((new RegExp('^'+k.replace(/([\\\[\]\(\)\^\$\.\|\?\*\+\{\}])/g, '\\$1'))).test(trigger)) {
    trigger = trigger.substr(k.length).toLowerCase();
    if (this.hasTrigger(trigger)) {
      m.words = words;
      try { if (this.callTrigger(trigger, m)) { return; } }
      catch (err) {
        console.log(err.stack);
        m.channel.send('Error: '+err.name+': '+err.message);
      }
    }
  }
}
function load(bot) {
  bot.addTriggers(trigs);
  bot.on('message', handleMsgs);
  console.log('loaded system');
}
function unload(bot) {
  bot.remTriggers(trigs);
  bot.off('message', handleMsgs);
  console.log('unloaded system');
}
module.exports = {
  name: 'System',
  version: '1.0',
  depends: [ 'Core-Triggers' ],
  load,
  unload
}

