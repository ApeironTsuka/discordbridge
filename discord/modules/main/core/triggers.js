function loadInto(client) {
  client.prototype.addTrigger = function (t, cb) {
    var lct = t.toLowerCase(), tl = this.triggerList[lct];
    if (!tl) { this.triggerList[lct] = tl = []; }
    tl.push(cb);
  };
  client.prototype.remTrigger = function (t, cb) {
    var lct = t.toLowerCase(), tl = this.triggerList[lct];
    if (!tl) { return; }
    for (var i = 0, l = tl.length; i < l; i++) { if (tl[i] == cb) { tl.splice(i, 1); break; } }
  };
  client.prototype.addTriggers = function (o) {
    var keys = Object.keys(o);
    for (var i = 0, l = keys.length; i < l; i++) { this.addTrigger(keys[i], o[keys[i]]); }
  };
  client.prototype.remTriggers = function (o) {
    var keys = Object.keys(o);
    for (var i = 0, l = keys.length; i < l; i++) { this.remTrigger(keys[i], o[keys[i]]); }
  };
  client.prototype.setTriggerPrefix = function (p) {
    this.triggerPrefix = p;
    this.saveDB('trigger');
  };
  client.prototype.hasTrigger = function (t) {
    var lct = t.toLowerCase(), tl = this.triggerList[lct];
    if (!tl) { return false; }
    return true;
  };
  client.prototype.callTrigger = function (t, e) {
    var lct = t.toLowerCase(), tl = this.triggerList[lct], x;
    if (!tl) { return false; }
    for (var i = 0, l = tl.length; i < l; i++) { x = tl[i].call(this, e); if ((x) || (x === undefined)) { return true; } }
    return false;
  };
  client.prototype.triggerUsage = function (t, s) { return 'Usage: '+this.triggerPrefix+t+' '+s; };
  if (!this.__reload) {
    this.addDB('trigger', '!', 'triggerPrefix');
    this.triggerList = {};
  }
}
function deleteFrom(client) {
  delete client.prototype.addTrigger;
  delete client.prototype.remTrigger;
  delete client.prototype.addTriggers;
  delete client.prototype.remTriggers;
  delete client.prototype.setTriggerPrefix;
  delete client.prototype.hasTrigger;
  delete client.prototype.callTrigger;
  delete client.prototype.triggerUsage;
  if (!this.__reload) {
    this.remDB('trigger');
    delete this.triggerList;
    this.triggerPrefix = '!';
  }
}
module.exports = {
  name: 'Core-Triggers',
  version: '1.0',
  depends: [ 'Core-DB' ],
  load: function (client) { loadInto.call(this, client); },
  unload: function (client) { deleteFrom.call(this, client); }
}
