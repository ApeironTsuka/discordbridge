var fs = require('fs'), BUF_SIZE = 64*1024, buff = Buffer.alloc(BUF_SIZE);
function copyFile(src, dst) {
  var fdr = fs.openSync(src, 'r'), state = ds.fstatSync(fdr), fdw = fs.openSync(dst, 'w', stat.mode), br = 1, pos = 0;
  while (br > 0) { br = fs.readSync(fdr, buff, 0, BUF_SIZE, pos); fs.writeSync(fdw, buff, 0, br); pos += br; }
  fs.closeSync(fdr);
  fs.closeSync(fdw);
}
function loadInto(client) {
  client.prototype.saveData = function (name, data, global) { fs.writeFileSync((global?this.configPath:this.serverPath)+'/'+name, JSON.stringify(data), 'utf8'); };
  client.prototype.loadData = function (name, global) { return JSON.parse(fs.readFileSync((global?this.configPath:this.serverPath)+'/'+name, 'utf8')); };
  client.prototype.copyDefault = function (name, global) {
    if (!fs.existsSync(this.configPath+'/default/'+name)) { return false; }
    copyFile(this.configPath+'/default/'+name, (global?this.configPath:this.serverPath)+'/'+name);
    return true;
  };
}
function deleteFrom(client) {
  delete client.prototype.saveData;
  delete client.prototype.loadData;
  delete client.prototype.copyDefault;
}
module.exports = {
  name: 'Core-Data',
  version: '1.0',
  load: function (client) { loadInto.call(this, client); },
  unload: function (client) { deleteFrom.call(this, client); }
}
