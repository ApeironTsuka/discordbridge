var serviceEmitter = require('tserv-service').serviceEmitter, fs = require('fs');

var ids = 0;

function load(bot) {
  if (!bot.services) { bot.services = {}; }
  var f = function (onready, noload) {
    this.ready = true;
    this.connected++;
    if (!noload) { this.loadApi(); }
    if (this.type == 'web') { this.extendApi('ids'); }
    if (onready) { onready.call(this); }
  };
  bot.prototype.useService = function (n, onready, specName) {
    var name = n, port, emitter, client, local, services;
    if (n.name) { name = n.name; port = n.port; emitter = n.emitter; local = n.local; }
    if (!this.__services) { this.__services = {}; }
    services = local?this.__services:bot.services;
    if (!services[name]) {
      if (!emitter) {
        client = services[name] = new serviceEmitter();
        client.setIdentifier(this.id);
        if (port) { client.connectToP(name, port); }
        else { client.connectTo(name); }
      } else { client = services[name] = emitter; }
      client.readycbs = [ { cb: f.bind(client, onready), id: ids } ];
      client.connected = 0;
      client.on('ready', client.readycbs[0].cb);
      client.on('disconnect', function () {
        this.ready = false;
        this.connected = 0;
      });
      client.specName = specName;
      if (specName) { this[specName] = client; }
    } else {
      client = services[name];
      client.readycbs.push({ cb: f.bind(client, onready), id: ids });
      client.on('ready', client.readycbs[client.readycbs.length-1].cb);
      if (client.ready) { setTimeout(function () { f.call(client, onready, true); }, 1); }
    }
    client.setMaxListeners(50);
    return { client: client, id: ids++ };
  };
  bot.prototype.useExtService = function (n, onready, specName) {
    var name = n, local = false, services;
    if (n.name) { name = n.name; local = !!n.local; }
    if (!this.__services) { this.__services = {}; }
    services = local?this.__services:bot.services;
    if (services[name]) { return this.useService(n, onready, specName); }
    console.log(`CALLED USEEXTSERVICE ${name}`);
    let s = new serviceEmitter(), ext;
    s.setIdentifier(this.id);
    let extReady = () => {
      console.log('EXT SERVICE READY');
      if ((services[name]) && (services[name].ready)) { return; }
      ext.client.api.serviceStart(name, (d) => {
        console.log(`connecting to ${name} on port ${d.port}`);
        s.connectTo({ name, port: d.port });
        s.on('reconnect', () => {
          setTimeout(() => {
            let ext = this.useService('extoverseer', () => {
              ext.client.api.serviceStart(name, (d) => {
                s.client.connectTo({ name, port: d.port });
                //this.freeService('extoverseer', ext.id);
              });
            });
          }, 6000);
        });
      });
      //this.freeService('extoverseer', ext.id);
    };
    ext = this.useService('extoverseer', extReady);
    return this.useService({ name, local, emitter: s }, onready, specName);
  };
  bot.prototype.freeService = function (n, id) {
    let name = n, local, services;
    if (n.name) { name = n.name; local = n.local; }
    services = local?bot.services:this.__services;
    if (!services[name]) { return; }
    var client = services[name];
    for (var i = 0, cbs = client.readycbs, l = cbs.length; i < l; i++) { if (cbs[i].id == id) { client.off('ready', cbs[i].cb); cbs.splice(i, 1); break; } }
    client.connected--;
    if (client.connected == 0) {
      client.disconnect();
      if (client.specName) { delete this[client.specName]; }
      delete services[name];
    }
  };
}
function unload(bot) {
  delete bot.prototype.useService;
  delete bot.prototype.usExtService;
  delete bot.prototype.freeService;
  if (!this.__reload) {
    var client;
    for (var i = 0, services = bot.services, keys = Object.keys(service), l = keys.length; i < l; i++) {
      client = services[keys[i]];
      for (var x = 0, cbs = client.readycbs, xl = cbs.length; x < xl; x++) { client.off('ready', cbs[x]); }
      client.connected = 0;
      client.ready = false;
      client.disconnect();
      delete client;
    }
  }
}
module.exports = {
  name: 'Core-Services',
  version: '1.0',
  load: function (bot) { load.call(this, bot); },
  unload: function (bot) { unload.call(this, bot); }
};

