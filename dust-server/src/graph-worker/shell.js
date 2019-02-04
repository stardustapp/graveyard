async function ShellSiteHome(match, input) {
  console.log(this.graphStore);

  // maybe TODO: const appGraphs = this.graphStore.querySelectorAll('.app-profile');
  const appGraphs = this.graphStore.getGraphsUsingEngine('app-profile/v1-beta1');
  const dustGraphs = this.graphStore.getGraphsUsingEngine('dust-app/v1-beta1');
  console.log('app listing:', appGraphs[0], dustGraphs[0]);

  let localAppListing = [];
  let localPkgListing = [];

  for (const graph of dustGraphs) {
    const package = graph.selectAllWithType('Package')[0];
    const appRouter = graph.selectAllWithType('AppRouter')[0];
    switch (package.PackageType) {
    case 'App':
      localAppListing.push(commonTags.safeHtml`
        <li style="display: flex;">
          <a href="install-app?graphId=${package.data.graphId}" style="flex: 1;">
            ${package.data.name}
          </a>
          <a href="delete?graphId=${package.data.graphId}">
            <i class="material-icons">delete</i>
          </a>
        </li>`);
      break;
    case 'Library':
    default:
      localPkgListing.push(commonTags.safeHtml`
        <li>
          ${package.data.name}
        </li>`);
    }
  }

  let appListing = appGraphs.map(profile => {
    const app = profile.selectAllWithType('Instance')[0];
    return commonTags.safeHtml`
      <li>
        <a href="my/${profile.data.fields.appKey}/" class="app">
          <img src="${app.IconUrl}}">
          <h3>${app.data.name}</h3>
        </a>
      </li>
    `;
  }).join('\n');
  if (!appGraphs.length) {
    appListing = commonTags.safeHtml`<li>None yet</li>`;
  }

  return wrapGatePage(`app launcher | stardust`, commonTags.html`
  <div style="flex-flow: column;">
    <!--section class="compact modal-form">
      <p>${commonTags.safeHtml`You are ${null}!`}</p>
      ${true ? commonTags.html`
        <a href="set-password" class="action">Change account password</a>
      ` : commonTags.html`
        <p>You don't have a password!</p>
        <a href="set-password" class="action">Create password</a>
      `}
      <a href="logout" class="action">log out</a>
    </section-->

    <section class="compact modal-form">
      <h2>Your apps</h2>
      <ul style="margin: 0; padding: 0 0.5em;" class="app-list">
        ${appListing}
      </ul>
      <!--a href="create-app" class="action">
        Create application
      </a-->
    </section>

    <section class="compact modal-form">
      <h2>Local packages</h2>
      <ul style="text-align: left;">
        ${localAppListing}
      </ul>
      <h3>Support libraries</h3>
      <ul style="text-align: left;">
        ${localPkgListing}
      </ul>
      <a href="dust-store" class="action">
        Download DUST packages
      </a>
    </section>
  </div>`);
}

function ShellSiteAddAppForm(match, input) {
  const graphId = input.uri.queryParams.get('graphId');
  const graph = this.graphStore.graphs.get(graphId);
  if (!graph) throw new Error(
    `graph ${graphId} not found, to install`);

  let installUI = '';

  const mountRows = [];/*
  Object.keys(pkg.record.mounts).forEach(mountPoint => {
    const mountDef = pkg.record.mounts[mountPoint];
    const fieldKey = `mount-${encodeURIComponent(mountPoint)}`;
    switch (mountDef.type) {
      case 'bind':
        mountRows.push(commonTags.safeHtml`
          <div class="row">
            <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${mountPoint}</label>
            <input type="text" name="${fieldKey}" value="${mountDef.suggestion}"
                style="width: 12em;">
          </div>
          <p class="hint">${mountDef.hint}</p>
        `);
        break;
    }
  });*/
  if (mountRows.length) {
    mountRows.unshift(commonTags.html`
      <hr>
      <h2>mount points</h2>
    `);
  }

  const workloadRows = [];/*
  Object.keys(pkg.record.workloads).forEach(wlId => {
    const workload = pkg.record.workloads[wlId];
    const fieldKey = `workload-${encodeURIComponent(wlId)}`;

    workloadRows.push(commonTags.safeHtml`
      <div class="row">
        <label for="${fieldKey}" style="margin: 0 0 0 2em; width: 5em;">${wlId}</label>
        <input type="text" name="${fieldKey}" value="${workload.sourceUri}" readonly
            style="width: 12em;">
      </div>
      <p class="hint">type: ${workload.type} / runtime: ${workload.runtime}</p>
    `);
  });*/
  if (workloadRows.length) {
    workloadRows.unshift(commonTags.html`
      <hr>
      <h2>workloads</h2>
    `);
  }

  return wrapGatePage(`install app`, commonTags.html`
    <div style="display: flex; align-self: center;">
      <form action="install-app" method="post" class="modal-form">
        <h1>install as app</h1>
        <div class="row">
          <label for="packageId" style="margin: 0 0 0 2em; width: 7em;">package</label>
          <select name="packageId" style="width: 12em; flex: 1;">
            <optgroup label="Dust Apps">
              <option selected value="${graph.data.graphId}"
                >${Array.from(graph.roots)[0].data.name}</option>
            </optgroup>
          </select>
        </div>
        <div class="row">
          <label for="appName" style="margin: 0 0 0 2em; width: 7em;">app name</label>
          <input type="text" name="appName" value="${Array.from(graph.roots)[0].data.name}"
              style="width: 12em;" autofocus required>
        </div>
        <div class="row">
          <label for="appKey" style="margin: 0 0 0 2em; width: 7em;">app key</label>
          <input type="text" name="appKey" value="${graph.data.fields.foreignKey}"
              style="width: 12em;" required>
        </div>
        <div class="row">
          <label for="location" style="margin: 0 0 0 2em; width: 7em;">data location</label>
          <select name="location" style="width: 12em; flex: 1;" required>
            <option disabled selected value="">select...</option>
            <option value="browser-local">this browser</option>
            <option value="legacy-poc">legacy DUST PoC</option>
            <option disabled>dan@localhost</option>
            <option disabled>dan@bees.network</option>
          </select>
        </div>
        <div class="row">
          <label for="privacy" style="margin: 0 0 0 2em; width: 7em;">privacy</label>
          <select name="privacy" style="width: 12em; flex: 1;" required>
            <option selected>private</option>
            <option disabled>public read-only</option>
            <option disabled>public interactive</option>
          </select>
        </div>
        ${mountRows}
        ${workloadRows}
        <button type="submit">
          install application
        </button>
      </form>
    </div>`);
}

async function ShellSiteAddAppAction(match, input) {
  const formData = await input.request.formData();
  const packageId = formData.get('packageId');
  const appKey = formData.get('appKey');
  const appName = formData.get('appName');
  const location = formData.get('location');
  const privacy = formData.get('privacy');

  const pkgGraph = this.graphStore.graphs.get(packageId);
  if (!pkgGraph) throw new Error(
    `source package graph ${packageId} not found, can't install nothing`);

  const appRouter = pkgGraph
    .selectAllWithType('AppRouter')[0];

  // build a list of all the schemas that can be persisted
  const persistedSchemas = pkgGraph
    .selectAllWithType('RecordSchema')
    .filter(schema => {
      // resolve the root base
      let base = schema.Base;
      while (base.SchemaRef)
        base = this.graphStore.objects.get(base.SchemaRef).Base;
      // Records are persisted, Classes are not
      return base.BuiltIn === 'Record';
    })

  const dependencies = pkgGraph.selectAllWithType('Dependency');
  console.log('dependencies:', dependencies);
  // TODO: use dependencies for like drivers and shit

  const engine = GraphEngine.get('app-profile/v1-beta1');
  const appGraph = await this.graphStore.findOrCreateGraph(engine, {
    selector: { appKey },
    fields: { appKey, location },
    async buildCb(engine, {originUrl}) {
      const builder = new GraphBuilder(engine);
      self.builder = builder;

      const instance = builder.withInstance(appName, 1, {
        IconUrl: appRouter.IconUrl,
        Source: {
          DustApp: appRouter,
        },
        Privacy: privacy,
      });

      switch (location) {
        case 'browser-local':
          // create a database
          const store = instance.withLocalCollection('Database', 1, {
            Schemas: persistedSchemas,
          });
          // point to the database
          instance.withLink('Records', 1, {
            Target: {
              LocalCollection: store,
            },
          });
          break;

        case 'legacy-poc':
          instance.withLink('Records', 1, {
            Target: {
              LegacyDDP: {
                SocketBaseUrl: 'wss://stardustapp.run',
                AppId: pkgGraph.data.fields.foreignKey,
                Schemas: persistedSchemas,
              },
            },
          });
          break;

        default: throw new Error(
          `Unrecognized app profile data location ${JSON.stringify(location)}`);
      }

      return builder;
    }});

  console.log('Created app profile', appGraph);
  return Response.redirect(`/~/apps/`);
}


function wrapGatePage(title, inner) {
  return new Response(commonTags.safeHtml`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0"/>
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500|Material+Icons" rel="stylesheet">
      <link href="/~/apps/style.css" type="text/css" rel="stylesheet" media="screen,projection" />
      <base href="/~/apps/">
    </head>
    <body>
      `+'\n\n  '+inner.split('\n').join('\n  ')+'\n\n  '+commonTags.safeHtml`

      <div class="fill"></div>

      <footer>
        powered by the Stardust platform,
        built by
        <a href="http://danopia.net">danopia</a>
      </footer>
    </body>
    </html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

function ShellSiteStyle() {
  return new Response(commonTags.safeHtml`
html, body {
  height: 100%;
  margin: 0;
}
body {
  background-image: linear-gradient(145deg, #3e4b66 0%, #1f2533 100%);
  background-attachment: fixed;
  color: #fff;
  font-family: Roboto, sans;
  display: flex;
  flex-direction: column;
}
body > * {
  flex-shrink: 0;
}
header {
  text-align: center;
  margin: 5em 1em 3em;
}
header h1 {
  font-size: 4em;
  margin: 0;
  font-weight: 500;
}
header h2 {
  font-size: 2em;
  margin: 0;
  color: #aaa;
  font-weight: 300;
}
header em {
  font-weight: 400;
  font-style: normal;
}
a {
  color: #ccc;
}
nav {
  display: flex;
  justify-content: center;
}
.fill {
  flex: 1;
}
.action {
  display: block;
  border: 3px solid #ccc;
  margin: 1em;
  padding: 0.7em 2em;
  text-decoration: none;
}
.alt-action {
  border-color: #999;
}
.action:hover {
  border-color: #fff;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.15);
  text-decoration: underline;
}
footer {
  max-width: 40em;
  margin: 5em auto 3em;
  text-align: center;
  color: #999;
}

.modal-form a {
  color: #333;
}
.modal-form .action {
  border-color: #666;
}
.modal-form .action:hover {
  border-color: #000;
  color: #000;
  background-color: rgba(0, 0, 0, 0.15);
}

.modal-form {
  display: flex;
  flex-direction: column;
  max-width: 40em;
  background-color: #eee;
  text-align: center;
  color: #000;
  margin: 5em auto 3em;
  padding: 2em 1em;
}
.modal-form.compact {
  margin: 1em auto;
  padding: 1em 1em;
}
.modal-form input, .modal-form select, .modal-form button {
  font-size: 1.3em;
  margin: 0.25em 1em;
  padding: 0.5em 1em;
  display: block;
  border: 3px solid #ccc;
}
.modal-form input:focus, .modal-form select:focus, .modal-form button:focus {
  border-color: #666;
  box-shadow: 0 0 4px 1px rgba(50, 50, 50, 0.3);
  outline: none;
}
.modal-form input:hover, .modal-form select:hover, .modal-form button:hover {
  border-color: #999;
  outline: none;
}
.modal-form input {
  background-color: #fff;
}
.modal-form select {
  background-color: #fff;
}
.modal-form button {
  background-color: rgba(0, 0, 0, 0.15);
  cursor: 666;
  color: #333;
}
.modal-form h1, .modal-form h2, .modal-form h3 {
  margin: 0.2em 1em 0.5em;
  font-weight: 300;
  color: #000;
}
.modal-form input {
  letter-spacing: 1px;
}
.modal-form input[type=password]:not(:placeholder-shown) {
  letter-spacing: 4px;
}
.modal-form input[disabled] {
  background-color: #f3f3f3;
}
.modal-form h1 em {
  font-weight: 400;
  font-style: normal;
}
.modal-form .row {
  display: flex;
}
.modal-form .row label {
  align-self: center;
  color: #000;
  font-size: 1.2em;
  margin-right: 2em;
  letter-spacing: 1px;
}
.modal-form .hint {
  margin-top: 0;
}

.app-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  list-style: none;
}
.app-list li {
  display: block;
  flex-basis: 128px;
}
.app-list .app {
  display: block;
  text-align: center;
  margin-bottom: 1em;
  color: rgba(0, 0, 0, 0.6);
  text-decoration: none;
}
.app-list .app:hover {
  color: #000;
}
.app-list .app img {
  width: 64px;
  height: 64px;
}
.app-list .app h3 {
  font-weight: 400;
  font-size: 1em;
  margin: 0;
}
`, {
    status: 200,
    headers: {
      'Content-Type': 'text/css',
    },
  });
}
