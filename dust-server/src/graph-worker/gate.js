/*
destinations.documentGET.registerHandler('/~/apps/', async match => {
  const allPkgs = await kernel.softwareDB.listAllPackages();
  let pkgListing = allPkgs.map(record => commonTags.safeHtml`
    <li style="display: flex;">
      <a href="by-id/${record.pid}" style="flex: 1;">${record.displayName}</a>
      <a href="builder/?id=${record.pid}">
        <i class="material-icons">edit</i>
      </a>
      <a href="delete?id=${record.pid}">
        <i class="material-icons">delete</i>
      </a>
    </li>
  `).join('\n');
  if (!allPkgs.length) {
    pkgListing = commonTags.safeHtml`<li style="display: flex;">None yet</li>`;
  }

  return wrapGatePage('Apps Home', commonTags.html`
    <div style="display: flex;">
      <section class="compact modal-form">
        <h2>Your apps</h2>
        <ul style="text-align: left; margin: 0; padding: 0 0.5em;">
          ${pkgListing}
        </ul>
        <a href="store/browse" class="action">
          Download app from store
        </a>
        <a href="new-package?type=webapp" class="action">
          Start developing new app
        </a>
      </section>
    </div>`);
});

destinations.documentGET.registerHandler('/~/apps/new-package', async (_, {uri}) => {
  return wrapGatePage(`Create Package`, commonTags.safeHtml`
    <style type="text/css">
      label { text-align: left; }
      input, select { flex: 1; }
      .modal-form .row label { margin-right: 0; }
      .row { margin-left: 1em; }
    </style>
    <form method="post" class="modal-form" style="max-width: 70em;">
      <h1>create package</h1>
      <div class="row">
        <label for="displayName">display name</label>
        <input type="text" name="displayName" required autofocus>
      </div>
      <div class="row">
        <label for="type">package type</label>
        <select name="type" required>
          <option value="webapp" selected>Web application</option>
          <option value="backend" disabled>Backend service</option>
          <option value="library" disabled>Resource library</option>
        </select>
      </div>
      <div class="row">
        <label for="sourceLicense">source code license</label>
        <input type="text" name="sourceLicense" value="MIT" required>
      </div>
      <div class="row">
        <label for="iconUrl">icon URL</label>
        <input type="text" name="iconUrl">
      </div>
      <button type="submit">
        start development
      </button>
    </form>
    <div style="align-self: center;">
      <a href=".">return home</a>
    </div>`);
});

destinations.documentPOST.registerHandler('/~/apps/new-package', async (_, {request}) => {
  const data = await request.formData();
  const pkg = await kernel.softwareDB.createPackage({
    displayName: data.get('displayName'),
    type: data.get('type'),
    sourceLicense: data.get('sourceLicense'),
    iconUrl: data.get('iconUrl'),
  });
  return Response.redirect(`/~/apps/builder/?id=${pkg.pid}`);
});
*/
