
function vcsTest(cb) {
  return async function runVcsTest() {
    await idb.delete('graph');
    const db = new ObjectDataBase('graph');
    await db.ready;
    try {
      await cb.call(this, db);
    } finally {
      await db.closeIdb();
      //await idb.delete('vcs');
    }
  };
}

vcsTests.addSuite('personal blog generator', vcsTest(async function(db) {
  const blog = await db
    .createProject({
      metadata: {
        //owner: 'root',
        displayName: 'Personal Blog',
      },
      objects: [{
        name: 'editor',
        type: 'web-bundle',
        engine: 'vue.js',
      },{
        name: 'generator',
        type: 'external-script',
        engine: 'node.js',
        sourceText: 'return 5;',
      }],
      /*
      repos: [{
        key: 'resources',
        engine: 'dvcs',
      },{
        key: 'config',
        engine: 'bucket',
      },{
        key: 'data',
        engine: 'bucket',
      },{
        key: 'output',
        engine: 'dvcs',
      }],
      expose: [{
        '/source': '/repos/source/workdir',
        '/config': '/repos/config/tree',
        '/data': '/repos/data/tree',
      }],*/
    });

  console.debug('Got blog project:', blog);
  this.assertEq(blog.record.metadata.displayName, 'Personal Blog');
  this.assertEq(blog.record.version, 1);

  const posts = await blog.createObject({
    name: 'posts',
    type: 'collection',
  });

  //blog.repos.getObject('config').store('')
  //blog.getEntry('/source/README').store()

  //const bucket = await db.openStore(projectId, 'resources', BucketStore);
  //console.debug('Opened resource repo');
  //this.assertEq(resStore.)
}));

vcsTests.addSuite('todo list datastore', vcsTest(async function(db) {
  const project = await db
    .createProject({
      metadata: {
        displayName: 'To-DONE!',
      },
    });
  console.debug('Got todo project:', project);

  const themesColl = await project.createObject({
    name: 'themes',
    type: 'collection',
    fields: {
      addedAt: {type: 'core/timestamp', insertionDefault: 'now'},
      color: {type: 'core/string', mutable: true},
      name: {type: 'core/string', mutable: true},
    },
  });
  const entriesColl = await project.createObject({
    name: 'entries',
    type: 'collection',
    fields: {
      addedAt: {type: 'core/timestamp', insertionDefault: 'now'},
      body: {type: 'core/string', mutable: true},
      status: {type: 'core/string', mutable: true, choices: ['todo', 'frozen', 'done']},
      theme: {type: 'my/themes.collection/reference', required: false},
    },
  });

  const themeDesign = await
  themesColl.insert({
    name: 'Design',
    color: '#f0f',
  });

  await entriesColl.insert({
    body: 'Make collections work',
    status: 'todo',
  });
  await entriesColl.insert({
    body: 'design on mounting swagger APIs',
    status: 'todo',
    theme: themeDesign,
  });
  console.log(await entriesColl.getAll());

}));

vcsTests.addSuite('legacy app import', vcsTest(async function(db) {
  const project = await ImportLegacyStardustApplication(db, {
    "_platform": "stardust",
    "_version": 3,
    "packageId": "shout",
    "meta": {
      "_isNew": false,
      "type": "App",
      "name": "Shouter",
      "license": "MIT",
      "libraries": [],
      "iconUrl": "https://i.imgur.com/0UkUtuD.png",
      "layoutId": null
    },
    "resources": [
      {
        "_isNew": false,
        "type": "RouteTable",
        "name": "RootRoutes",
        "version": 1,
        "entries": [
          {
            "path": "/home",
            "type": "customAction",
            "template": null,
            "customAction": {
              "coffee": "->\n  @render 'Home'",
              "js": "(function() {\n  return function() {\n    return function() {\n      return this.render('Home');\n    };\n  };\n\n}).call();\n"
            }
          }
        ]
      },
      {
        "_isNew": false,
        "type": "Template",
        "name": "Home",
        "version": 36,
        "html": "<link href=\"https://fonts.googleapis.com/css?family=Arima+Madurai|Roboto\" rel=\"stylesheet\">\n\n<div id=\"wrap\">\n  {{> renderTemplate name='ShoutHero' }}\n\n  {{> renderTemplate name='PublicFeed' }}\n</div>",
        "css": "body {\n  font-family: 'Roboto', sans-serif;\n  background-color: #F0DFAB;\n  display: block;\n  align: center; }\n\n#wrap {\n  display: flex;\n  margin: 0 auto;\n  padding: 2em 1em;\n  max-width: 25em;\n  flex-direction: column; }\n",
        "scss": "body {\n  font-family: 'Roboto', sans-serif;\n  background-color: #F0DFAB;\n  display: block;\n  align: center;\n}\n\n#wrap {\n  display: flex;\n  margin: 0 auto;\n  padding: 2em 1em;\n  max-width: 25em;\n  flex-direction: column;\n}",
        "scripts": []
      },
      {
        "_isNew": false,
        "type": "Template",
        "name": "ShoutHero",
        "version": 97,
        "html": "<form id=\"shout-hero\">\n  <label id=\"from-bar\">\n    <span>Shout from the: </span>\n    \n    <input type=\"text\" name=\"fromPlace\"\n           maxlength=\"20\"\n           placeholder=\"(place)\"\n           value=\"rooftops\">\n  </label>\n  \n  <textarea name=\"message\" rows=\"5\" autofocus\n            maxlength=\"140\" placeholder=\"What do you have to say?\"\n            ></textarea>\n  \n  <div id=\"char-counter\">{{charCount}} / 140</div>\n  \n  <button type=\"submit\">Submit shout</button>\n</form>",
        "css": "#shout-hero {\n  background-color: #FFFCFC;\n  padding: 1em;\n  margin-bottom: 1em;\n  border-radius: 15px;\n  display: flex;\n  flex-direction: column; }\n\n#shout-hero label {\n  display: flex;\n  white-space: pre;\n  font-size: 1em;\n  margin: -1em -1em 0.5em;\n  padding: 1em 1em 0;\n  border-bottom: 1px solid #C98A3B; }\n\n#shout-hero [type=text] {\n  border: none;\n  background: none;\n  font-size: 1em;\n  padding: 0;\n  flex: 1;\n  width: 0; }\n\n#shout-hero label, #shout-hero [type=text], #shout-hero button {\n  font-family: 'Roboto', sans-serif;\n  text-transform: uppercase;\n  color: #C98A3B;\n  outline: none; }\n\n#shout-hero textarea {\n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.6em;\n  line-height: 1.2;\n  background: none;\n  text-transform: uppercase;\n  border: none; }\n\n#shout-hero #char-counter {\n  align-self: flex-end;\n  color: #F10879;\n  font-size: 0.8em; }\n\n#shout-hero button {\n  padding: 0.4em;\n  background: none;\n  border: none;\n  font-size: 1em;\n  color: #C98A3B;\n  border-top: 1px solid #C98A3B;\n  margin: 0.5em -1em -1em; }\n",
        "scss": "#shout-hero {\n  background-color: #FFFCFC;\n  padding: 1em;\n  margin-bottom: 1em;\n  border-radius: 15px;\n  \n  display: flex;\n  flex-direction: column;\n}\n\n#shout-hero label {\n  display: flex;\n  white-space: pre;\n  font-size: 1em;\n  margin: -1em -1em 0.5em;\n  padding: 1em 1em 0;\n  border-bottom: 1px solid #C98A3B;\n}\n\n#shout-hero [type=text] {\n  border: none;\n  background: none;\n  font-size: 1em;\n  padding: 0;\n  flex: 1;\n  width: 0;\n}\n\n#shout-hero label, #shout-hero [type=text], #shout-hero button {\n  font-family: 'Roboto', sans-serif;\n  text-transform: uppercase;\n  color: #C98A3B;\n  outline: none;\n}\n\n#shout-hero textarea {\n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.6em;\n  line-height: 1.2;\n  background: none;\n  text-transform: uppercase;\n  border: none;\n}\n\n#shout-hero #char-counter {\n  align-self: flex-end;\n  color: #F10879;\n  font-size: 0.8em;\n}\n\n#shout-hero button {\n  padding: 0.4em;\n  background: none;\n  border: none;\n  font-size: 1em;\n  color: #C98A3B;\n  border-top: 1px solid #C98A3B;\n  margin: 0.5em -1em -1em;\n}",
        "scripts": [
          {
            "key": "event:change textarea",
            "type": 4,
            "param": "change textarea",
            "coffee": "(evt) ->\n  #console.log evt.target.value",
            "js": "(function() {\n  return function() {\n    return function(evt) {};\n  };\n\n}).call();\n"
          },
          {
            "key": "event:keyup textarea",
            "type": 4,
            "param": "keyup textarea",
            "coffee": "(evt) ->\n  Template.instance().charCount.set evt.target.value.length",
            "js": "(function() {\n  return function() {\n    return function(evt) {\n      return Template.instance().charCount.set(evt.target.value.length);\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "on-create",
            "type": 1,
            "param": null,
            "coffee": "() ->\n  @charCount = new ReactiveVar 0",
            "js": "(function() {\n  return function() {\n    return function() {\n      return this.charCount = new ReactiveVar(0);\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "helper:charCount",
            "type": 3,
            "param": "charCount",
            "coffee": "() ->\n  Template.instance().charCount.get()",
            "js": "(function() {\n  return function() {\n    return function() {\n      return Template.instance().charCount.get();\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "on-render",
            "type": 0,
            "param": null,
            "coffee": "() ->\n  @charCount.set $('textarea').val().length",
            "js": "(function() {\n  return function() {\n    return function() {\n      return this.charCount.set($('textarea').val().length);\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "event:submit form",
            "type": 4,
            "param": "submit form",
            "coffee": "Shout = DUST.get 'Shout'\n\n(evt) ->\n  evt.preventDefault()\n  \n  charCount = evt.target.fromPlace.value.length\n  if charCount < 1\n    return alert \"You have to shout from somewhere\"\n  \n  charCount = evt.target.message.value.length\n  if charCount < 1\n    return alert \"Message can't be blank\"\n  if charCount > 140\n    return alert \"Message can only be up to 140 characters\"\n  \n  shout = new Shout\n    Time: new Date\n    FromPlace: evt.target.fromPlace.value\n    Message: evt.target.message.value\n  shout.commit()\n  \n  evt.target.message.value = ''\n  Template.instance().charCount.set 0\n  ",
            "js": "(function() {\n  return function() {\n    var Shout;\n    Shout = DUST.get('Shout');\n    return function(evt) {\n      var charCount, shout;\n      evt.preventDefault();\n      charCount = evt.target.fromPlace.value.length;\n      if (charCount < 1) {\n        return alert(\"You have to shout from somewhere\");\n      }\n      charCount = evt.target.message.value.length;\n      if (charCount < 1) {\n        return alert(\"Message can't be blank\");\n      }\n      if (charCount > 140) {\n        return alert(\"Message can only be up to 140 characters\");\n      }\n      shout = new Shout({\n        Time: new Date,\n        FromPlace: evt.target.fromPlace.value,\n        Message: evt.target.message.value\n      });\n      shout.commit();\n      evt.target.message.value = '';\n      return Template.instance().charCount.set(0);\n    };\n  };\n\n}).call();\n"
          }
        ]
      },
      {
        "_isNew": false,
        "type": "Template",
        "name": "PublicFeed",
        "version": 48,
        "html": "{{#each shouts}}\n\t<div class=\"feed-item\">\n    <h5>From the {{FromPlace}} &mdash;</h5>\n\t\t<div class=\"past-shout\">{{Message}}</div>\n    <time datetime={{strDate Time}}>{{strDate Time 'LT'}}</time>\n\t</div>\n{{/each}}",
        "css": ".feed-item {\n  margin: 0.5em 0; }\n\n.feed-item h5 {\n  margin: 0;\n  font-weight: 400;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-transform: uppercase; }\n\n.past-shout {\n  background-color: #FFFCFC;\n  padding: 0.7em 1em 0.5em;\n  border-radius: 10px;\n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.4em;\n  line-height: 1.2;\n  text-transform: uppercase;\n  white-space: pre-line; }\n\n.feed-item time {\n  margin: 0;\n  font-weight: 400;\n  font-size: 0.8em;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-align: right;\n  display: block;\n  text-transform: uppercase; }\n",
        "scss": ".feed-item {\n  margin: 0.5em 0;\n}\n\n.feed-item h5 {\n  margin: 0;\n  font-weight: 400;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-transform: uppercase;\n}\n\n.past-shout {\n  background-color: #FFFCFC;\n  padding: 0.7em 1em 0.5em;\n  border-radius: 10px;\n  \n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.4em;\n  line-height: 1.2;\n  text-transform: uppercase;\n  white-space: pre-line;\n}\n\n.feed-item time {\n  margin: 0;\n  font-weight: 400;\n  font-size: 0.8em;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-align: right;\n  display: block;\n  text-transform: uppercase;\n}\n",
        "scripts": [
          {
            "key": "helper:shouts",
            "type": 3,
            "param": "shouts",
            "coffee": "Shout = DUST.get 'Shout'\n\n() ->\n  Shout.find {},\n    sort: Time: -1\n    limit: 25",
            "js": "(function() {\n  return function() {\n    var Shout;\n    Shout = DUST.get('Shout');\n    return function() {\n      return Shout.find({}, {\n        sort: {\n          Time: -1\n        },\n        limit: 25\n      });\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "helper:strDate",
            "type": 3,
            "param": "strDate",
            "coffee": "(time, format) ->\n  if format.length\n    moment(time).format(format)\n  else moment(time).toJSON()",
            "js": "(function() {\n  return function() {\n    return function(time, format) {\n      if (format.length) {\n        return moment(time).format(format);\n      } else {\n        return moment(time).toJSON();\n      }\n    };\n  };\n\n}).call();\n"
          }
        ]
      },
      {
        "_isNew": false,
        "type": "CustomRecord",
        "name": "Shout",
        "version": 2,
        "base": "core:Record",
        "dataScope": "global",
        "fields": [
          {
            "key": "Time",
            "type": "core:date",
            "isList": false,
            "optional": false,
            "immutable": true,
            "default": null
          },
          {
            "key": "FromPlace",
            "type": "core:string",
            "isList": false,
            "optional": false,
            "immutable": true,
            "default": null
          },
          {
            "key": "Message",
            "type": "core:string",
            "isList": false,
            "optional": false,
            "immutable": true,
            "default": null
          }
        ],
        "timestamp": false
      },
      {
        "_isNew": false,
        "type": "Publication",
        "name": "Default",
        "version": 3,
        "recordType": "Shout",
        "filterBy": "{}",
        "sortBy": "{}",
        "fields": null,
        "limitTo": null,
        "children": []
      }
    ]
  });

  // create a new shout
  const shoutHandle = await project
    .get('my/shout.collection')
    .insert({
      Message: 'is this thing on',
      FromPlace: 'rooftops',
    });

  // retrieve the shout and check fields
  const shout = await project
    .get('my/shout.collection/find-one', shoutHandle);
  this.assertEq(shout.Message, 'is this thing on');
  this.assertEq(shout.FromPlace, 'rooftops');

  /*

  a from-scratch shouter subset

  const project = await db.createProject({
    metadata: {
      type: 'application',
      name: 'To-DONE!',
      iconUrl: 'https://i.imgur.com/0UkUtuD.png',
    },
  });
  console.debug('Created project:', project);

  const collection = await project.createObject({
    name: 'Shouts',
    type: 'collection',
    fields: {
      Time: {type: 'core/timestamp', insertionDefault: 'now'},
      FromPlace: {type: 'core/string'},
      Message: {type: 'core/string'},
    },
  });
  await collection.insert({
    Message: 'is this thing on',
    FromPlace: 'rooftops',
  });
  console.log(await collection.getAll());

  const router = await project.createObject({
    name: 'Public',
    type: 'web/router',
    //input: {type: 'http/path'},
    //output: {type: 'http/response'},
    entries: [{
      path: '/home',
      //match: 'static', // or 'pattern' 'regex' - specific to 
      type: 'inline-action',
      language: 'coffeescript',
      source: `->\n  @render 'Home'`,
      //action: {type: 'http/template', name: 'Home'},
      //action: {type: 'http/coffee-action', source: },
    }],
  });

  await project.createObject({
    name: 'Home',
    type: 'vue/component',
    //input: {type: 'http/path'},
    //output: {type: 'http/response'},
    entries: [{
      path: '/home',
      //match: 'static', // or 'pattern' 'regex' - specific to 
      type: 'inline-action',
      language: 'coffeescript',
      source: `->\n  @render 'Home'`,
      //action: {type: 'http/template', name: 'Home'},
      //action: {type: 'http/coffee-action', source: },
    }],
  });
*/
}));
