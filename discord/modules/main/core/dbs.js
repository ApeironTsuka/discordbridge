var fs = require('fs');

function loadDB(t, n, k, d) { if (!fs.existsSync(t.serverPath+'/'+n)) { clearDB(t, k, d); saveDB(t, n, k); return; } t[k] = t.loadData(n); }
function saveDB(t, n, k) { t.saveData(n, t[k]); }
function clearDB(t, k, d) { t[k] = JSON.parse(JSON.stringify(d)); } // FIXME there must be a better way
function delDB(t, n) { fs.unlinkSync(t.serverPath+'/'+n); }

function loadInto(client) {
  client.prototype.loadDBs = function () {
    var dbList = this.dbList, x;
    for (var i = 0, keys = Object.keys(dbList), l = keys.length; i < l; i++) {
      x = dbList[keys[i]];
      if (x.funcs) { x.load.call(this); }
      else { loadDB(this, x.n, x.key, x.def); }
    }
    this.__loadeddbs = true;
  };
  client.prototype.clearDBs = function () {
    var dbList = this.dbList, x;
    for (var i = 0, keys = Object.keys(dbList), l = keys.length; i < l; i++) {
      x = dbList[keys[i]];
      if (x.funcs) { x.clear.call(this); }
      else { clearDB(this, x.key, x.def); }
    }
    this.__loadeddbs = false;
  };
  client.prototype.saveDB = function (db) {
    var dbe = this.dbList[db];
    if (!dbe) { return; }
    if (dbe.funcs) { dbe.save.call(this); }
    else { saveDB(this, dbe.n, dbe.key); }
  };
  client.prototype.addDB = function (db, def, key, f) {
    var dbList = this.dbList;
    if (dbList[db]) { return false; }
    if (typeof def == 'function') {
      dbList[db] = { load: def, save: key, clear: f, funcs: true };
      if (this.__loadeddbs) { def.call(this); }
    } else {
      dbList[db] = { n: db, key: key||db, def: def };
      if (this.__loadeddbs) { loadDB(this, db, key||db, def); }
      else { clearDB(this, key||db, def); }
    }
    return true;
  };
  client.prototype.remDB = function (db, del) {
    var dbe = this.dbList[db];
    if (!dbe) { return; }
    delete this.dbList[db];
    if (del) { delDB(this, db); }
  };
  if (!this.__reload) { this.dbList = {}; }
  this.__loadeddbs = false;
}
function deleteFrom(client) {
  delete client.prototype.loadDBs;
  delete client.prototype.clearDBs;
  delete client.prototype.saveDB;
  delete client.prototype.addDB;
  delete client.prototype.remDB;
  if (!this.__reload) { delete client.dbList; }
}
module.exports = {
  name: 'Core-DB',
  version: '1.0',
  depends: [ 'Core-Data' ],
  load: function (client) { loadInto.call(this, client); },
  unload: function (client) { deleteFrom.call(this, client); }
}
