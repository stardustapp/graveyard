#!/usr/bin/gjs

imports.searchPath.unshift("lib");
const Promise = imports.promise.Promise;
//const {setTimeout, clearTimeout} = imports.timing;
const Skylink = imports.skylink.Skylink;

const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Notify = imports.gi.Notify

const sky = new Skylink('', 'wss://devmode.cloud/~~export/ws')

/*
setTimeout(() => {
  Notify.init("Hello world")
  Hello=Notify.Notification.new ("Skylink",
                                 "Your pizza order is out for delivery. ETA 9:14 PM",
                                 "dialog-information");
  Hello.set_urgency(Notify.NOTIFY_URGENCY_CRITICAL);
  Hello.show();

}, 30000);
*/

const OrbiterApp = new Lang.Class({
  Name: 'Skylink Orbiter',

  _init: function () {
    this.application = new Gtk.Application();

    this.application.connect('startup', () => {
      this._buildUI();
    });
    this.application.connect('activate', () => {
      this._window.present();
    });
  },

  _buildUI: function () {
    this._window = new Gtk.ApplicationWindow({
      application: this.application,
      window_position: Gtk.WindowPosition.CENTER,
      border_width: 10,
      title: "Sky Login",
    });

    this._label = new Gtk.Label({
      label: "Find yourself:",
    });

    this._domainEntry = new Gtk.Entry({
      placeholder_text: 'Domain name',
      text: 'devmode.cloud',
    });

    this._chartEntry = new Gtk.Entry({
      placeholder_text: 'Chart name'
    });
    //this._entry.set_placeholder_text('~dan-chat');
    //this._entry.set_text('dan-chat');

    this._grid = new Gtk.Grid();
    this._grid.attach(this._label, 0, 0, 1, 1);
    this._grid.attach(this._domainEntry, 0, 1, 1, 1);
    this._grid.attach(this._chartEntry, 0, 2, 1, 1);

    this._window.add(this._grid);
    this._window.show_all();
  }

});

// Run the application
let app = new OrbiterApp();
app.application.run(ARGV);
