// outdated test for dust apps
// at least partially depends on app-profile (for data storage)

function vcsTest(cb) {
  return async function runVcsTest() {
    const db = new ObjectDataBase('graph');
    await db.ready;
    try {
      await cb.call(this, db);
    } finally {
      await db.closeIdb();
      //await idb.delete('graph');
    }
  };
}

vcsTests.addSuite('cleanup', vcsTest(async function(db) {
  await db.deleteEverything();
}));

vcsTests.addSuite('personal blog generator', vcsTest(async function(db) {
  const blog = await db
    .createGraph({
      fields: {
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

  console.debug('Got blog graph:', blog);
  this.assertEq(blog.record.fields.displayName, 'Personal Blog');
  this.assertEq(blog.record.version, 1);

  const posts = await blog.createObject({
    name: 'posts',
    type: 'collection',
  });

  //blog.repos.getObject('config').store('')
  //blog.getEntry('/source/README').store()

  //const bucket = await db.openStore(graphId, 'resources', BucketStore);
  //console.debug('Opened resource repo');
  //this.assertEq(resStore.)
}));

vcsTests.addSuite('todo list datastore', vcsTest(async function(db) {
  const graph = await db
    .createGraph({
      fields: {
        displayName: 'To-DONE!',
      },
    });
  console.debug('Got todo graph:', graph);

  const themesColl = await graph.createObject({
    name: 'themes',
    type: 'collection',
    fields: {
      addedAt: {type: 'core/timestamp', insertionDefault: 'now'},
      color: {type: 'core/string', mutable: true},
      name: {type: 'core/string', mutable: true},
    },
  });
  const entriesColl = await graph.createObject({
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
  const repo = new S3ApplicationRepository();

  const bartendPkg = await repo.fetchPackage('bartend');
  const bartendApp = await ImportLegacyStardustApplication(db, bartendPkg);

  const shoutPkg = await repo.fetchPackage('shout');
  const shoutApp = await ImportLegacyStardustApplication(db, shoutPkg);

  // create a new shout
  const shoutHandle = await shoutApp
    .get('my/shout.collection')
    .insert({
      Message: 'is this thing on',
      FromPlace: 'rooftops',
    });

  // retrieve the shout and check fields
  const shout = await shoutApp
    .get('my/shout.collection')
    .findOne(shoutHandle);
  this.assertEq(shout.Message, 'is this thing on');
  this.assertEq(shout.FromPlace, 'rooftops');

  /*

  a from-scratch shouter subset

  const graph = await db.createGraph({
    fields: {
      type: 'application',
      name: 'To-DONE!',
      iconUrl: 'https://i.imgur.com/0UkUtuD.png',
    },
  });
  console.debug('Created graph:', graph);

  const collection = await graph.createObject({
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

  const router = await graph.createObject({
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

  await graph.createObject({
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
