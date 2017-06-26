# API overview
Skylink is implemented as a JSON request/response call pattern.
There are two reference transports at this time: HTTP POST and Websocket.
Send a request and get a response. It's that easy.

## HTTP transport
POST your JSON to `/~~export`. Get JSON back.
All clients have the same view of the exported NS.
The server may allow modifying the NS,
but all users will see the changed state.

Example URI: `http://localhost:9234/~~export`

## Websocket transport
Open a bare websocket against `/~~export/ws`.
Send a JSON text frame and get a JSON text frame back.
At this time, concurrency is not supported.
The connection must strictly follow request, response, request cadence.

Each Websocket client gets their own root NS and can store temporary
state on the server within that NS.
The public shared NS (e.g., what the HTTP transport exposes)
is mounted at `/pub` and should be useful in building state.

Example URI: `ws://localhost:9234/~~export/ws`

# Implemented operations

Consult `nsapi.go` for the actual data structures used.

## ping
No request args.

Response:
- Ok: true

## get
Retrieves a shallow copy of a named Entry.
Folders include a list of children's names.
Strings and Files include their direct value.

Request:
- Path: absolute path to return

Response:
- Ok: if the path was found
- Output: a shallow export of that node

## enumerate
Lists the children of a Folder including types and string values.
Supports limited recursion and shape-matching.
Children are not nested in the output.
A simple linear list of fully-qualified entries is returned instead.

Request:
- Path: absolute path to Folder of interest
- Depth: default `1`. `-1` for unlimited
- Shapes: array of paths to Shapes that everything should be matched against

Response:
- Ok: if the enumeration of Path was error-free
- Output: a Folder containing all nodes encountered,
  named with their path relative to Path

## invoke
Request:
- Path: absolute path to base.Function
- Input: optional argument for the func
- Dest: optional path to store output

Response:
- Ok: if the function was invocable
  (note: not related to invocation success)
- Output: shallow export of the result, unless dest was set

## store
Request:
- Input: nested structure to store
- Dest: absolute path to drop the new entry at

Response:
- Ok: if the entire operation was successful

## copy
Request:
- Path: abs path to source entry
- Dest: desired abs path to store a copy

Response:
- Ok: if the copy operation was successful

## unlink
Request:
- Path: abs path to unlink an entry from

Response:
- Ok: if the path is no longer in existence
  (note: doesn't mean it existed originally)
