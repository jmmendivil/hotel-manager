const GLib            = imports.gi.GLib;
const Lang            = imports.lang;
const Main            = imports.ui.main;
const Mainloop        = imports.mainloop;
const PanelMenu       = imports.ui.panelMenu;
const PopupMenu       = imports.ui.popupMenu;
const St              = imports.gi.St;
const ExtensionUtils  = imports.misc.extensionUtils;
const HotelLauncher   = ExtensionUtils.getCurrentExtension();
const PopupServerItem = HotelLauncher.imports.popupServerItem.PopupServerItem;
const Util            = imports.misc.util;

var HotelManager = new Lang.Class({
  Name: 'HotelManager',
  _entries: {},
  _running: false,
  _homeDir: GLib.get_home_dir(),

  _init: function() {
    this._config = this._hotelConfig();
    this._uri    = this._hotelUri();

    this._createContainer();
    this._refresh();
  },

  _createContainer: function() {
    this.container = new PanelMenu.Button()
    PanelMenu.Button.prototype._init.call(this.container, 0.0);

    let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
    let icon = new St.Icon({ icon_name: 'network-cellular-hspa-symbolic', style_class: 'system-status-icon' });
    hbox.add_child(icon);

    this.container.actor.add_actor(hbox);
    this.container.actor.add_style_class_name('panel-status-button');

    this.container.actor.connect('button-press-event', Lang.bind(this, function() {
      this._refresh();
    }));

    Main.panel.addToStatusArea('HotelManager', this.container);
  },

  _hotelConfig: function() {
    let config = this._homeDir + '/.hotel/conf.json';
    let data   = { port: 2000, host: '127.0.0.1', tld: 'localhost' };

    if (GLib.file_test(config, GLib.FileTest.EXISTS)) {
      data = GLib.file_get_contents(config)[1].toString();
      data = JSON.parse(data);
    }

    return data;
  },

  _hotelUri: function() {
    let host = this._config.host;
    let port = this._config.port;

    return host + ':' + port;
  },

  _getCommand: function() {
    let command = 'hotel';
    let hotelRc = this._homeDir + '/.hotelrc';

    if (GLib.file_test(hotelRc, GLib.FileTest.EXISTS)) {
      hotelRc = GLib.file_get_contents(hotelRc);

      if (hotelRc[0] == true) {
        let userCommand = hotelRc[1].toString().split("\n")[0];
        userCommand = userCommand.replace('~', this._homeDir);

        if (userCommand != '') {
          command = userCommand;
        }
      }
    }

    return command;
  },

  _getUrl: function (action, id) {
    let paths = {
      start:   '/_/servers/${id}/start',
      stop:    '/_/servers/${id}/stop',
      servers: '/_/servers'
    };

    let path = this._uri + paths[action].toString().replace('${id}', id);
    return path;
  },

  _checkHotel: function () {
    let running = GLib.spawn_command_line_sync('ps -ef').toString().match(/hotel\/lib\/daemon/);
    return running == 'hotel/lib/daemon';
  },

  _toggleHotel: function (start) {
    let action  = start ? 'start' : 'stop';
    let command = this._getCommand();

    Util.spawn([command, action]);
  },

  _checkServer: function (server) {
    let running = server['status'];
    return running == 'running';
  },

  _toggleServer: function (id, start) {
    let action = start ? 'start' : 'stop';
    let url    = this._getUrl(action, id);

    GLib.spawn_command_line_sync('curl --request POST ' + url);
  },

  _openServerUrl: function (id) {
    let url = 'http://' + id + '.' + this._config.tld;
    Util.spawn(['xdg-open', url]);
  },

  _getServers: function () {
    let items = {};

    if (this._running) {
      let url  = this._getUrl('servers');
      let list = GLib.spawn_command_line_sync('curl ' + url);

      try {
        items = JSON.parse(list[1].toString());
      } catch (e) {
        items = {};
      }
    }

    return items;
  },

  _addServerItems: function () {
    let servers = Object.keys(this._entries);

    if (servers.length) {
      this.container.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      servers.map(Lang.bind(this, function(id, index) {
        let server     = this._entries[id];
        let active     = this._checkServer(server);
        let serverItem = new PopupServerItem(id, active, { 'restartButton': true, 'launchButton': true });

        this.container.menu.addMenuItem(serverItem);

        serverItem.connect('toggled', Lang.bind(this, function(button, state) {
          this._toggleServer(id, state);
          this._setServerItemState(button, id);
        }));

        serverItem.launchButton.connect('clicked', Lang.bind(this, function() {
          this._openServerUrl(id);
        }));
      }));
    }
  },

  _setServerItemState: function(serverItem, server) {
    serverItem.setSensitive(false);

    Mainloop.timeout_add(500, Lang.bind(this, function() {
      this._entries = this._getServers();
      let curServer = this._entries[server];

      serverItem.setToggleState(this._checkServer(curServer));
      serverItem.setSensitive(true);
    }));
  },

  _setHotelItemState: function(hotelItem) {
    hotelItem.setSensitive(false);

    Mainloop.timeout_add(500, Lang.bind(this, function() {
      this._running = this._checkHotel();

      hotelItem.setToggleState(this._running);
      hotelItem.setSensitive(true);
    }));
  },

  _refresh: function() {
    this.container.menu.removeAll();

    this._running = this._checkHotel();
    this._entries = this._getServers();

    let options = {
      'autoCloseMenu': true,
      'restartButton': true,
      'launchButton':  true
    };

    let hotelItem = new PopupServerItem('Hotel', this._running, options);
    this.container.menu.addMenuItem(hotelItem);

    Mainloop.idle_add(Lang.bind(this, this._addServerItems));

    hotelItem.connect('toggled', Lang.bind(this, function(button, state) {
      this._toggleHotel(state);
      this._setHotelItemState(button);
    }));

    hotelItem.launchButton.connect('clicked', Lang.bind(this, function() {
      this._openServerUrl('hotel');
    }));
  },

  destroy: function() {
    this.container.destroy();
  }
});

let hotelManager;

function enable() {
  hotelManager = new HotelManager();
}

function disable() {
  hotelManager.destroy();
  hotelManager = null;
}
