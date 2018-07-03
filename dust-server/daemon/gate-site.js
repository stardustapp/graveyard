// Serves up enough HTML to nicely direct users to the account page

class GateSite {
  constructor(domainName, accountManager, sessionManager, domainManager) {
    if (!domainName)
      throw new Error(`GateSite requires a domain name`);
    if (!sessionManager)
      throw new Error(`GateSite requires a session manager`);

    this.domainName = domainName;
    this.accountManager = accountManager;
    this.sessionManager = sessionManager;
    this.domainManager = domainManager;
  }

  async getEntry(path) {
    switch (path) {

      // dynamic entry points
      case '/login':
        return new GateSiteLogin(this);
      case '/register':
        return new GateSiteRegister(this);

      // dynamic gated pages
      case '/home':
        return new GateSiteHome(this);
      case '/ftue':
        return new GateSiteFtue(this);
      case '/add-domain':
        return new GateSiteAddDomain(this);

      // extra pages
      case '/about':
        return new GateSiteAbout(this);

      // assets
      case '/style.css':
        return new GateSiteStyle();

      default:
        console.log(`path ${path} doesn't exist`);
        return null;
    }
  }
}

function wrapGatePage(title, inner) {
  return BlobLiteral.fromString(commonTags.safeHtml`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0"/>
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500" rel="stylesheet">
      <link href="style.css" type="text/css" rel="stylesheet" media="screen,projection" />
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
    </html>`, 'text/html');
}

class GateSiteLogin {
  constructor(site) {
    this.site = site;
  }

  async get() {
    return wrapGatePage(`login | ${this.site.domainName}`, commonTags.safeHtml`
      <form method="post" id="modal-form">
        <h1>login to <em>${this.site.domainName}</em></h1>
        <input type="hidden" name="domain" value="${this.site.domainName}">
        <input type="text" name="username" placeholder="username" required autofocus>
        <input type="password" name="password" placeholder="password">
        <button type="submit">log in</button>
      </form>
      <div style="align-self: center;">
        <a href="register">or register a new account</a>
      </div>`);
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();

    const {domain, username, password} = request.req.bodyparams;

    // look up the account
    const accountId = await this.site.accountManager.resolveAddress(username, domain);
    if (!accountId) {
      ToastNotif(`Client tried logging in to unknown chart ${username}@${domain}`);
      throw new Error(`Invalid auth credentials`);
    }

    // load account and check access
    const account = await this.site.accountManager.getAccount(accountId);
    await account.assertPassword(password);
    console.log('launching', account);

    // vend a new session
    const session = await this.site.sessionManager.create(account, {
      lifetime: 'long',
      client: 'web gate',
    });
    ToastNotif(`User ${username} successfully logged in`);

    return setCookieAndBuildRedirect(accountId, session.record.sid, '/~/home');
  }
}

function setCookieAndBuildRedirect(accountId, sessionId, url='/') {
  const body = wrapGatePage('redirecting...', commonTags.safeHtml`
    <header>
      <h2>redirecting to <a href="${url}">${url}</a></h2>
    </header>`);
  body.Name = 'body';

  const cookieName = `stardust:acct:${encodeURIComponent(accountId)}`;
  const newCookie = sessionId;
  const expiresAt = moment.utc().add(1, 'month').toDate().toUTCString();
  const setCookie = `${cookieName}=${encodeURIComponent(newCookie)}; Expires=${expiresAt}`; // HttpOnly?

  return new FolderLiteral('http response', [
    new StringLiteral('status code', '303'),
    new FolderLiteral('headers', [
      new StringLiteral('Location', url),
      new StringLiteral('Set-Cookie', setCookie),
    ]),
    body,
  ]);
}

function buildRedirect(url='/') {
  const body = wrapGatePage('redirecting...', commonTags.safeHtml`
    <header>
      <h2>redirecting to <a href="${url}">${url}</a></h2>
    </header>`);
  body.Name = 'body';

  return new FolderLiteral('http response', [
    new StringLiteral('status code', '303'),
    new FolderLiteral('headers', [
      new StringLiteral('Location', url),
    ]),
    body,
  ]);
}

class GateSiteRegister {
  constructor(site) {
    this.site = site;
  }

  async get() {
    return wrapGatePage(`register | ${this.site.domainName}`, commonTags.safeHtml`
      <form method="post" id="modal-form">
        <h1>register new account</h1>
        <input type="hidden" name="domain" value="${this.site.domainName}">
        <div class="row">
          <input type="text" name="username" placeholder="username" required autofocus style="width: 12em; text-align: right;">
          <label for="username">@${this.site.domainName}</label>
        </div>
        <input type="email" name="email" placeholder="your email (private)" required>
        <input type="text" name="realname" placeholder="your 'real' name (shared)" required>
        <button type="submit">submit registration</button>
      </form>`);
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();

    const account = await this.site.accountManager.create(request.req.bodyparams);
    const session = await this.site.sessionManager.create(account, {
      lifetime: 'short',
      client: 'gate-api',
    });
    return setCookieAndBuildRedirect(
        account.record.aid,
        session.record.sid,
        '/~/ftue');
  }
}

class GateSiteAddDomain {
  constructor(site) {
    this.site = site;
  }

  renderForm(request) {
    if (!request.session) {
      return buildRedirect('/~/login');
    }

    return wrapGatePage(`add domain | ${this.site.domainName}`, commonTags.safeHtml`
      <form method="post" id="modal-form">
        <h1>add new domain</h1>
        <div class="row">
          <label for="owner" style="margin: 0 0 0 2em;">owner</label>
          <input type="text" name="owner" disabled value="${request.session.account.address()}"
              style="width: 12em;">
        </div>
        <input type="text" name="fqdn" placeholder="domain name (as in DNS)" required autofocus>
        <button type="submit">add domain to profile</button>
      </form>`);
  }

  async invoke(input) {
    const request = await new GateSiteRequest(this.site, input).loadState();
    console.log('add domain', input, request);
    
    if (request.req.method === 'GET') {
      return this.renderForm(request);
    }

    if (request.req.method === 'POST') {
      const domainName = request.req.bodyparams.fqdn;
      if (!domainName) {
        return this.renderForm(request);
      }

      const domain = await this.site.domainManager
          .registerDomain(domainName, request.session.account);
      
      return buildRedirect('/~/home');
      //return buildRedirect('/~/domains/'+domain.record.did);
    }
  }
}

// Created from a user request
// Parses cookies and such
// What more could you want?
class GateSiteRequest {
  constructor(site, request) {
    this.site = site;
    this.req = JSON.parse(request.StringValue);

    this.allCookies = new Map;
    this.acctCookies = new Map;
    const acctPrefix = 'stardust:acct:';
    if ('cookie' in this.req.headers) {
      this.req.headers.cookie.split(';')
        .map(s => s.trim().split('='))
        .filter(([k,v]) => {
          this.allCookies.set(k, v);
          return k.startsWith(acctPrefix);
        })
        .forEach(([k,v]) => this.acctCookies.set(k.slice(acctPrefix.length), v));
    }
  }

  async loadState() {
    if (this.acctCookies.size > 0) {
      const [acctId, sessId] = this.acctCookies.entries().next().value;
      console.log('have a cookie', acctId, sessId);
      this.session = await this.site.sessionManager.getSession(sessId);
    }
    return this;
  }
}

class GateSiteHome {
  constructor(site) {
    this.site = site;
  }

  async invoke(input) {
    const state = await new GateSiteRequest(this.site, input).loadState();
    if (!state.session) {
      return buildRedirect('/~/login');
    }

    const {account} = state.session;
    const memberships = await this.site.domainManager.getMembershipsFor(account);
    let domainListing = memberships.map(m => commonTags.safeHtml`
      <li>
        <a href="domains/${m.domain.record.did}">${m.domain.record.primaryFqdn}</a>
        (${m.role})
      </li>
    `).join('\n');
    if (!memberships.length) {
      domainListing = commonTags.safeHtml`<li>None yet</li>`;
    }

    return wrapGatePage(`home | ${this.site.domainName}`, commonTags.html`
      <section class="account-overview">
        <p>${commonTags.safeHtml`You are ${account.address()}!`}</p>
      </section>
      <section class="domain-list">
        <h2>Your domains</h2>
        <ul>
          ${domainListing}
        </ul>
        <a href="/~/add-domain" class="action">Add new domain</a>
      </section>`);
  }
}

class GateSiteFtue {
  constructor(site) {
    this.site = site;
  }

  async get() {
    return wrapGatePage(`get started | ${this.site.domainName}`, commonTags.safeHtml`
      <section class="ftue">
        <a href="/~/home" class="action">welcome to your new account :)</a>
        <p>here's what you can do:</p>
        <ul>
          <li>nothing, yet</li>
        </ul>
      </section>`);
  }
}

class GateSiteAbout {
  constructor(site) {
    this.site = site;
  }

  async get() {
    return wrapGatePage(`about | ${this.site.domainName}`, commonTags.safeHtml`
      <nav>
        <a href="/~/login" class="action">Login</a>
        <a href="/~/register" class="action">Register</a>
        <a href="/~/about" class="action alt-action">About</a>
      </nav>`);
  }
}

class GateSiteStyle {
  async get() {
    return BlobLiteral.fromString(`
html, body {
  height: 100%;
  margin: 0;
}
body {
  background-image: linear-gradient(145deg, #3e4b66 0%, #1f2533 100%);
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

#modal-form {
  display: flex;
  flex-direction: column;
  max-width: 40em;
  margin: 5em auto 3em;
  padding: 2em 1em;
  background-color: #eee;
  text-align: center;
}
#modal-form input, #modal-form button {
  font-size: 1.3em;
  margin: 0.25em 1em;
  padding: 0.5em 1em;
  display: block;
  border: 3px solid #ccc;
}
#modal-form input:focus, #modal-form button:focus {
  border-color: #666;
  box-shadow: 0 0 4px 1px rgba(50, 50, 50, 0.3);
  outline: none;
}
#modal-form input:hover, #modal-form button:hover {
  border-color: #999;
  outline: none;
}
#modal-form input {
  background-color: #fff;
}
#modal-form button {
  background-color: rgba(0, 0, 0, 0.15);
  cursor: 666;
  color: #333;
}
#modal-form h1 {
  margin: 0.2em 1em 0.5em;
  font-weight: 300;
  color: #000;
}
#modal-form input {
  letter-spacing: 1px;
}
#modal-form input[type=password]:not(:placeholder-shown) {
  letter-spacing: 4px;
}
#modal-form h1 em {
  font-weight: 400;
  font-style: normal;
}
#modal-form .row {
  display: flex;
}
#modal-form .row label {
  align-self: center;
  color: #000;
  font-size: 1.2em;
  margin-right: 2em;
  letter-spacing: 1px;
}
`, 'text/css');
  }
}
