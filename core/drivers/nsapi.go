package drivers

type nsRequest struct {
	Op    string
	Path  string `json:",omitempty"`
	Dest  string `json:",omitempty"` // destination for output
	Input *nsEntry `json:",omitempty"`
}

type nsResponse struct {
	Ok     bool
	Output *nsEntry `json:",omitempty"`
}

type nsEntry struct {
	Name string
	Type string `json:",omitempty"`

	StringValue string `json:",omitempty"`
	FileData    []byte `json:",omitempty"`
	Children    []nsEntry `json:",omitempty"`
}

/*
	# Implemented operations

	## get
	request:
	- path: absolute path to return
	response:
	- ok: if the path was found
	- output: a shallow export of that node

	## invoke
	request:
	- path: absolute path to base.Function
	- input: optional argument for the func
	- dest: optional path to store output - TODO
	response:
	- ok: if the function was invocable
	  (note: not related to invocation success)
	- output: shallow export of the result

	# Planned future operations
	These will be needed to support FUSE and others

	TODO: match output against given shapes

	## store
	request:
	- dest: abs path to drop new entries
	- input: nested structure to store at dest
	response:
	- ok: if the entire operation was successful

	## copy
	request:
	- path: abs path to source entry
	- dest: desired abs path to store a copy
	response:
	- ok: if the copy operation was successful

	## unlink
	request:
	- path: abs path to unlink an entry from
	response:
	- ok: if the path is no longer in existence
	  (note: doesn't mean it existed originally)
*/
