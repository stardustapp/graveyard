// Serves up enough HTML to nicely direct users to the account pages

DefaultSite = class DefaultSite {
  constructor(domainName) {
    if (!domainName)
      throw new Error(`DefaultSite requires a domain name`);
    this.domainName = domainName;
  }

  async getEntry(path) {
    switch (path) {
      case '/index.html':
        return new DefaultSiteIndex(this);

      default:
        console.log(`path ${path} doesn't exist`);
        return null;
    }
  }
}

class DefaultSiteIndex {
  constructor(site) {
    this.site = site;
    this.domain = site.domainName;
  }

  async get() {
    return BlobLiteral.fromString(commonTags.safeHtml`<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0"/>
  <title>${this.domain}</title>
  <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500" rel="stylesheet">
  <style type="text/css">
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
      color: #ddd;
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
  </style>
</head>
<body>
  <header>
    <h1>${this.domain}</h1>
    <h2>a <em>Stardust</em> system</h2>
  </header>

  <nav>
    <a href="/~/home" class="action">Login</a>
    <a href="/~/register" class="action">Register</a>
    <a href="/~/about" class="action alt-action">About</a>
  </nav>

  <div class="fill"></div>

  <footer>
    powered by the Stardust platform,
    built by
    <a href="http://danopia.net">danopia</a>
  </footer>
</body>
</html>`, 'text/html');
  }
}
