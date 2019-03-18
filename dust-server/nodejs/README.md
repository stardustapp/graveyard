# Node.JS Runtime for server-side Dust

This JavaScript module shims Stardust's monolithic Chrome server into a Node.JS server.
Certain source files are replaced wholesale to produce a standard program entry-point.

Data is stored using a graph database implemented over leveldb.
Specify a `--data-path` if you'd like to persist the data in a specific location,
  so the data will survive between process invocations.

This shim can [ideally] be kept minimal and mostly provide network and graph interfaces.
The unshimmed codebase already has a Dust resource compiler and runtime.
