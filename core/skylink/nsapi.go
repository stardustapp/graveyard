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
	Ok      bool
	Status  string            // "Ok", "Next", "Done", "Failed", TODO: replace Ok field
	Chan    int               `json:",omitempty"` // If starting, continuing, or ending a channel
	Channel <-chan nsResponse `json:"-"`          // Mapped from Chan, not sent on the wire
	Output  *nsEntry          `json:",omitempty"`
}

type nsEntry struct {
	Name string
	Type string `json:",omitempty"`

	StringValue string    `json:",omitempty"`
	FileData    []byte    `json:",omitempty"`
	Children    []nsEntry `json:",omitempty"`
	Shapes      []string  `json:",omitempty"`
}
