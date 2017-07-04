package dag

type Graph struct {
	name  string
	nodes map[string]*Node
	edges map[string]*Edge
}

type Node struct {
	id       string
	nodeType string

	// as configured
	mountPath  string
	deviceType string
	deviceUri  string
}

type Edge struct {
	id           string
	upstreamId   string
	downstreamId string
}
