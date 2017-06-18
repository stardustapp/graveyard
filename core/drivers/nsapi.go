package drivers

type nsRequest struct {
	Op    string
	Path  string
	Input *nsEntry
}

type nsResponse struct {
	Ok     bool
	Output *nsEntry
}

type nsEntry struct {
	Name string
	Type string

	StringValue string
	FileData    []byte
	Children    []nsEntry
}
