# Node.JS Runtime for server-side Dust

This JavaScript module shims Stardust's monolithic Chrome server into a Node.JS server.
Certain source files are replaced wholesale to produce a standard program entry-point.

Data is stored using a graph database implemented over leveldb.
Specify a `--data-path` if you'd like to persist the data in a specific location,
  so the data will survive between process invocations.

This shim can [ideally] be kept minimal and mostly provide network and graph interfaces.
The unshimmed codebase already has a Dust resource compiler and runtime.

## Intended Use-case Examples
* Persisting a profile-server which manages user accounts and homedirs
* Distributing the 'dust build' software to work on Dust software
* Structuring legacy protocol sockets, like IRC or IMAP clients
* Serving host resources such as OS processes or the OS filesystem
* Tunneling Internet client requests to endpoints within Dust
* Evaluating application logic using existing scripting runtimes
* Compiling generated programs into binaries
* Monitoring the health of arbitrary other modules
* Letting users bring up arbitrary sandboxed Dust servers
