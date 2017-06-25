package skylink

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
