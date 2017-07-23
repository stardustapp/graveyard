package skylink

type nsRequest struct {
	Op   string
	Path string `json:",omitempty"`
	// Root  string   `json:",omitempty"` // operating context URI base
	Dest  string   `json:",omitempty"` // destination for output
	Input *nsEntry `json:",omitempty"`

	// for `enumerate` op
	Depth  int `json:",omitempty"`
	Shapes []string
}

type nsResponse struct {
	Ok     bool
	Output *nsEntry `json:",omitempty"`
}

type nsEntry struct {
	Name string
	Type string `json:",omitempty"`

	StringValue string    `json:",omitempty"`
	FileData    []byte    `json:",omitempty"`
	Children    []nsEntry `json:",omitempty"`
	Shapes      []string  `json:",omitempty"`
}
