package drivers

type nsRequest struct {
	Op   string
	Path string
}

type nsResponse struct {
	Ok   bool
	Name string
	Type string

	StringValue string
	FileData    []byte
	Children    []string
}
